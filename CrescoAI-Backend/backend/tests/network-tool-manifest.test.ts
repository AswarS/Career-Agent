import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  buildNetworkToolManifest,
  hasNetworkToolManifestContractDrift,
  NETWORK_CONVERSATION_CONTEXT,
  NETWORK_PROFILE_REFRESH_CONTEXT,
  type NetworkToolManifest,
} from "../scripts/generate-network-tool-manifest.js";
import { renderNetworkToolManifestReadme } from "../scripts/generate-network-tool-manifest-readme.js";

const controlledEnvironment = {
  ENABLE_TOOL_SEARCH: "true",
  CAREER_AGENT_PROFILE_V2_TOOLS: "true",
  CAREER_AGENT_PROFILE_COMPACT_TOOLS: "true",
  CAREER_AGENT_PROFILE_AGENT_WORKFLOW_V1: "true",
} as const;

const previousEnvironment = new Map<string, string | undefined>();
let manifest: NetworkToolManifest;

beforeAll(async () => {
  for (const [name, value] of Object.entries(controlledEnvironment)) {
    previousEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
  manifest = await buildNetworkToolManifest({
    generatedAt: "2026-08-28T00:00:00.000Z",
    sourceRevision: {
      branch: "test",
      commit: "test",
      dirty: false,
    },
  });
});

afterAll(() => {
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("offline Network Tool manifest", () => {
  test("ignores generation metadata while still detecting contract drift", () => {
    const regenerated = structuredClone(manifest);
    regenerated.generated_at = "2026-08-29T00:00:00.000Z";
    regenerated.source_revision = {
      branch: "next-branch",
      commit: "next-commit",
      dirty: false,
    };
    expect(hasNetworkToolManifestContractDrift(manifest, regenerated)).toBe(
      false,
    );

    regenerated.tools[0]!.description = "changed contract";
    expect(hasNetworkToolManifestContractDrift(manifest, regenerated)).toBe(
      true,
    );
  });

  test("exports only usable non-MCP Network tools in both Profile contexts", () => {
    expect(manifest.scope.include_mcp).toBe(false);
    expect(manifest.scope.contexts).toEqual([
      NETWORK_CONVERSATION_CONTEXT,
      NETWORK_PROFILE_REFRESH_CONTEXT,
    ]);
    expect(
      manifest.tools.filter(
        (tool) => tool.context === NETWORK_CONVERSATION_CONTEXT,
      ),
    ).toHaveLength(31);
    expect(
      manifest.tools.filter(
        (tool) => tool.context === NETWORK_PROFILE_REFRESH_CONTEXT,
      ),
    ).toHaveLength(2);
    expect(manifest.tools.some((tool) => tool.name.startsWith("mcp__"))).toBe(
      false,
    );
    expect(manifest.excluded_tools.map((tool) => tool.name).sort()).toEqual([
      "Agent",
      "EnterWorktree",
      "ExitWorktree",
    ]);
    for (const excluded of manifest.excluded_tools) {
      expect(manifest.tools.some((tool) => tool.name === excluded.name)).toBe(
        false,
      );
    }
  });

  test("classifies only concrete action-skill wrappers as Skill Tools", () => {
    expect(
      manifest.tools
        .filter((tool) => tool.tool_type === "skill_tool")
        .map((tool) => [tool.name, tool.skill_binding?.skill_name]),
    ).toEqual([
      ["BaselineAssessment", "baseline-assessment"],
      ["CareerCompetencyModel", "career-competency-model"],
      ["LearningPlan", "learning-plan"],
      ["LearningProgressAssessment", "learning-progress-assessment"],
      ["LearningStageDesign", "learning-stage-design"],
    ]);
    expect(manifest.tools.find((tool) => tool.name === "Skill")).toMatchObject({
      tool_type: "harness_tool",
      skill_binding: null,
    });
    expect(
      manifest.tools.find((tool) => tool.name === "ReturnSkillResult"),
    ).toMatchObject({
      tool_type: "harness_tool",
      skill_binding: null,
    });
  });

  test("keeps interactive and refresh Profile contracts distinct", () => {
    const profiles = manifest.tools.filter(
      (tool) => tool.name === "profile_read" || tool.name === "profile_update",
    );
    expect(profiles).toHaveLength(4);
    expect(new Set(profiles.map((tool) => tool.id)).size).toBe(4);
    expect(
      profiles
        .filter((tool) => tool.context === NETWORK_CONVERSATION_CONTEXT)
        .map((tool) => tool.schema_cache_namespace),
    ).toEqual(["product-profile-interactive", "product-profile-interactive"]);
    expect(
      profiles
        .filter((tool) => tool.context === NETWORK_PROFILE_REFRESH_CONTEXT)
        .map((tool) => tool.schema_cache_namespace),
    ).toEqual(["product-profile-refresh", "product-profile-refresh"]);

    const interactiveUpdate = profiles.find(
      (tool) =>
        tool.context === NETWORK_CONVERSATION_CONTEXT &&
        tool.name === "profile_update",
    )!;
    const refreshUpdate = profiles.find(
      (tool) =>
        tool.context === NETWORK_PROFILE_REFRESH_CONTEXT &&
        tool.name === "profile_update",
    )!;
    expect(JSON.stringify(interactiveUpdate.input_schema)).toContain(
      '"evidence"',
    );
    expect(JSON.stringify(interactiveUpdate.input_schema)).not.toContain(
      '"evidenceRefs"',
    );
    expect(JSON.stringify(refreshUpdate.input_schema)).toContain(
      '"evidenceRefs"',
    );
    expect(refreshUpdate.resource_io.writes).toEqual([
      {
        resource_id: "state:ProfileRefreshOverlay",
        access: "stage_mutation",
        operations: ["set", "clear", "add", "remove"],
      },
    ]);
  });

  test("publishes a closed resource catalog and the reviewed learning flow", () => {
    const resourceIds = new Set(
      manifest.resources.map((resource) => resource.id),
    );
    expect(resourceIds).toEqual(
      new Set([
        "artifact:BaselineAssessment@1.0",
        "artifact:CareerCompetencyModel@1.0",
        "artifact:LearningPlan@1.0",
        "artifact:LearningStagePackage@1.0",
        "artifact:LearningProgressAssessment@1.0",
        "state:LearningState@1.0",
        "state:ProductProfile",
        "state:ProfileRefreshOverlay",
        "state:PlanMode",
        "handle:BackgroundTask",
        "handle:SkillInvocation",
        "snapshot:LearningState",
        "snapshot:ProductProfile",
        "snapshot:ProfileRefreshOverlay",
      ]),
    );

    for (const tool of manifest.tools) {
      for (const binding of [
        ...tool.resource_io.consumes,
        ...tool.resource_io.produces,
        ...tool.resource_io.reads,
        ...tool.resource_io.writes,
      ]) {
        expect(resourceIds.has(binding.resource_id)).toBe(true);
      }
    }

    const learningPlan = manifest.tools.find(
      (tool) => tool.name === "LearningPlan",
    )!;
    expect(
      learningPlan.resource_io.consumes.map((binding) => binding.resource_id),
    ).toEqual([
      "artifact:CareerCompetencyModel@1.0",
      "artifact:BaselineAssessment@1.0",
    ]);
    expect(
      learningPlan.resource_io.consumes.map((binding) => binding.requirement),
    ).toEqual(["required_semantically", "required_semantically"]);
    expect(learningPlan.resource_io.produces[0]?.resource_id).toBe(
      "artifact:LearningPlan@1.0",
    );

    const updateProgress = manifest.tools.find(
      (tool) => tool.name === "UpdateLearningProgress",
    )!;
    expect(
      updateProgress.resource_io.consumes.map((binding) => [
        binding.resource_id,
        binding.when?.["input.operation"],
      ]),
    ).toEqual([
      ["artifact:LearningStagePackage@1.0", "attach_stage_package"],
      ["artifact:LearningProgressAssessment@1.0", "record_assessment"],
    ]);
    expect(updateProgress.resource_io.writes[0]?.resource_id).toBe(
      "state:LearningState@1.0",
    );
  });

  test("includes resolved API contracts, provenance, and drift hashes", () => {
    for (const tool of manifest.tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.description).not.toContain("<ERROR:");
      expect(tool.input_schema).toBeTruthy();
      expect(tool.schema_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(tool.source.file.length).toBeGreaterThan(0);
      expect(tool.source.export.length).toBeGreaterThan(0);
    }
  });

  test("renders a README whose statistics and indexes come from the manifest", () => {
    const readme = renderNetworkToolManifestReadme(manifest);
    expect(readme).toContain("| Tool 记录数 | 33 |");
    expect(readme).toContain("| Harness Tool | 28 |");
    expect(readme).toContain("| Skill Tool | 5 |");
    expect(readme).toContain("| Resource 数 | 14 |");
    expect(readme).toContain(
      "`network.profile_refresh:harness_tool:profile_read:product-profile-refresh`",
    );
    expect(readme).toContain(
      "| `LearningPlan` | `learning-plan` | `action-tool` |",
    );
    expect(readme).toContain(
      "`available` 表示在 scope/assumptions 下无额外平台门槛",
    );
    expect(readme).toContain("此 JSON 不声明 Tool—Tool 直接依赖边");
  });

  test("rejects manifest fields that the README does not document", () => {
    const changedManifest = structuredClone(manifest) as NetworkToolManifest & {
      tools: Array<
        NetworkToolManifest["tools"][number] & { new_field?: string }
      >;
    };
    changedManifest.tools[0]!.new_field = "schema drift";
    expect(() => renderNetworkToolManifestReadme(changedManifest)).toThrow(
      "tools has undocumented fields: new_field",
    );
  });
});
