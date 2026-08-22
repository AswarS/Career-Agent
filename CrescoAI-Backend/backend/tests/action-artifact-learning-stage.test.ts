import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publishActionArtifact } from "../src/artifacts/actionArtifactPublisher.js";
import { resolveArtifactForWorkspace } from "../src/artifacts/actionArtifactResolver.js";
import { createLearningStagePackageAdapter } from "../src/tools/LearningStageDesignTool/artifactAdapter.js";

const uid = "123e4567-e89b-42d3-a456-426614174000";
const source = {
  schema_version: "1.0",
  artifact_type: "LearningStagePackage",
  created_at: "2026-08-20T10:00:00.000Z",
  package: {
    plan_id: "lp_test",
    plan_ref: `artifact://${uid}`,
    plan_version: 1,
    stage_id: "stage-1",
    stage_name: "Agent 评估基础",
    stage_goal: "建立可复现评估能力",
    constraints: { available_time: "8h/week" },
    objectives: [
      {
        id: "objective-1",
        description: "设计可复现的 Agent evaluation",
        competency_refs: ["comp-1"],
        completion_criteria: ["能够说明数据集、指标和回归门槛"],
      },
    ],
    sequence: [
      {
        order: 1,
        title: "评估设计",
        objective_refs: ["objective-1"],
        content_scope: ["offline evaluation"],
        learning_activities: ["阅读官方指南"],
        practice_tasks: ["实现一个评估集"],
        resources: [
          {
            title: "OpenAI Evals guide",
            url: "https://platform.openai.com/docs/guides/evals",
            source_type: "official_documentation",
            purpose: "理解评估闭环",
          },
        ],
        expected_outputs: ["评估报告"],
      },
    ],
    assessment: {
      method: "artifact review",
      expected_evidence: ["代码与报告"],
      completion_criteria: [
        {
          objective_ref: "objective-1",
          criterion: "评估可重复运行",
          required: true,
        },
      ],
    },
    limitations: [],
  },
};

describe("LearningStagePackage artifact adapter", () => {
  test("publishes, renders, and resolves a valid package", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "stage-package-"));
    await writeFile(join(workspace, "stage.json"), JSON.stringify(source));
    const publication = await publishActionArtifact({
      workspaceDir: workspace,
      sessionId: "session-1",
      userId: "user1",
      completion: {
        skill_call_id: "call-1",
        skill_name: "learning-stage-design",
        agent_id: "agent-1",
        outcome: "success",
        summary: "done",
        completed_at: "2026-08-20T10:01:00.000Z",
        result: { artifact: { path: "stage.json" } },
      },
      adapter: createLearningStagePackageAdapter(workspace),
    });
    expect(publication?.status).toBe("ready");
    expect(await readFile(publication!.presentation_path!, "utf8")).toContain(
      "Agent 评估基础",
    );
    expect(
      (
        await resolveArtifactForWorkspace({
          userId: "user1",
          workspaceDir: workspace,
          artifactRef: publication!.artifact_ref,
          expectedType: "LearningStagePackage",
        })
      ).artifactType,
    ).toBe("learning-stage-package");
  });
  test("rejects unresolved objective references", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "stage-package-"));
    const invalid = structuredClone(source);
    invalid.package.sequence[0]!.objective_refs = ["missing"];
    await writeFile(join(workspace, "stage.json"), JSON.stringify(invalid));
    const publication = await publishActionArtifact({
      workspaceDir: workspace,
      sessionId: "session-1",
      userId: "user1",
      completion: {
        skill_call_id: "call-1",
        skill_name: "learning-stage-design",
        agent_id: "agent-1",
        outcome: "success",
        summary: "done",
        completed_at: "2026-08-20T10:01:00.000Z",
        result: { artifact: { path: "stage.json" } },
      },
      adapter: createLearningStagePackageAdapter(workspace),
    });
    expect(publication?.status).toBe("error");
  });
  test("recovers a unique recent artifact when the returned workspace-relative path is duplicated", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "stage-package-"));
    const actualName = "learning-stage-package-stage-1.json";
    await writeFile(join(workspace, actualName), JSON.stringify(source));
    const publication = await publishActionArtifact({
      workspaceDir: workspace,
      sessionId: "session-1",
      userId: "user1",
      completion: {
        skill_call_id: "call-1",
        skill_name: "learning-stage-design",
        agent_id: "agent-1",
        outcome: "success",
        summary: "done",
        completed_at: new Date().toISOString(),
        duration_ms: 5_000,
        result: {
          artifact: {
            path: `some/repository/prefix/workspace/${actualName}`,
          },
        },
      },
      adapter: createLearningStagePackageAdapter(workspace),
    });
    expect(publication?.status).toBe("ready");
  });
});
