import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertActionArtifactPublished,
  publishActionArtifact,
} from "../src/artifacts/actionArtifactPublisher.js";
import { createLearningProgressAssessmentAdapter } from "../src/tools/LearningProgressAssessmentTool/artifactAdapter.js";
const uid = "123e4567-e89b-42d3-a456-426614174000";
const source = {
  schema_version: "1.0",
  artifact_type: "LearningProgressAssessment",
  created_at: "2026-08-20T10:00:00.000Z",
  assessment: {
    plan_id: "lp",
    plan_ref: `artifact://${uid}`,
    plan_version: 1,
    stage_id: "s1",
    stage_package_ref: `artifact://${uid}`,
    evidence: [
      {
        id: "e1",
        source_type: "conversation",
        summary: "回答",
        basis: "demonstrated",
      },
    ],
    objectives: [
      {
        objective_ref: "o1",
        status: "met",
        confidence: "medium",
        evidence_refs: ["e1"],
        assessment: "达到标准",
        remaining_gaps: [],
      },
    ],
    overall: {
      mastery: "meets",
      confidence: "medium",
      coverage_summary: "覆盖关键目标",
    },
    readiness: "advance",
    readiness_rationale: "关键标准已满足",
    limitations: [],
  },
};
describe("LearningProgressAssessment adapter", () => {
  test("publishes a validated assessment presentation", async () => {
    const w = await mkdtemp(join(tmpdir(), "assessment-"));
    await writeFile(join(w, "a.json"), JSON.stringify(source));
    const p = await publishActionArtifact({
      workspaceDir: w,
      sessionId: "s",
      userId: "u",
      completion: {
        skill_call_id: "c",
        skill_name: "learning-progress-assessment",
        agent_id: "a",
        outcome: "success",
        summary: "done",
        completed_at: "2026-08-20T10:00:00.000Z",
        result: { artifact: { path: "a.json" } },
      },
      adapter: createLearningProgressAssessmentAdapter(w),
    });
    expect(p?.status).toBe("ready");
    expect(p?.artifact_ref).toStartWith("artifact://");
  });
  test("rejects unknown evidence references", async () => {
    const w = await mkdtemp(join(tmpdir(), "assessment-"));
    const bad = structuredClone(source);
    bad.assessment.objectives[0]!.evidence_refs = ["missing"];
    await writeFile(join(w, "a.json"), JSON.stringify(bad));
    const p = await publishActionArtifact({
      workspaceDir: w,
      sessionId: "s",
      userId: "u",
      completion: {
        skill_call_id: "c",
        skill_name: "learning-progress-assessment",
        agent_id: "a",
        outcome: "success",
        summary: "done",
        completed_at: "2026-08-20T10:00:00.000Z",
        result: { artifact: { path: "a.json" } },
      },
      adapter: createLearningProgressAssessmentAdapter(w),
    });
    expect(p?.status).toBe("error");
    expect(() =>
      assertActionArtifactPublished(
        {
          skill_call_id: "c",
          skill_name: "learning-progress-assessment",
          agent_id: "a",
          outcome: "success",
          summary: "done",
          completed_at: "2026-08-20T10:00:00.000Z",
        },
        p,
      ),
    ).toThrow("ARTIFACT_PUBLICATION_FAILED");
  });

  test("recovers one recent matching artifact when the model omits result.artifact.path", async () => {
    const w = await mkdtemp(join(tmpdir(), "assessment-"));
    await mkdir(join(w, "action_artifacts"));
    await writeFile(
      join(w, "action_artifacts", "learning-progress-assessment-stage-1.json"),
      JSON.stringify(source),
    );
    const p = await publishActionArtifact({
      workspaceDir: w,
      sessionId: "s",
      userId: "u",
      completion: {
        skill_call_id: "c",
        skill_name: "learning-progress-assessment",
        agent_id: "a",
        outcome: "success",
        summary: "done",
        completed_at: new Date().toISOString(),
        duration_ms: 5_000,
        result: {},
      },
      adapter: createLearningProgressAssessmentAdapter(w),
    });
    expect(p?.status).toBe("ready");
    expect(p?.artifact_type).toBe("learning-progress-assessment");
  });
});
