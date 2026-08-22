import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { z } from "zod/v4";
import type { JsonValue } from "../skills/skillLifecycleTypes.js";

export type ActionCompletionForArtifact = {
  skill_call_id: string;
  skill_name: string;
  agent_id: string;
  outcome: "success" | "insufficient_input" | "error";
  summary: string;
  result?: JsonValue;
  completed_at: string;
  duration_ms?: number;
};

export type ArtifactPresentation = {
  title: string;
  summary: string;
  renderMode: "html";
  html: string;
};

export type ActionArtifactAdapter<TCanonical extends JsonValue> = {
  artifactType: string;
  artifactSlug: string;
  schemaVersion: string;
  toCanonical(
    completion: ActionCompletionForArtifact,
  ): TCanonical | Promise<TCanonical>;
  render(artifact: TCanonical): ArtifactPresentation;
};

const actionArtifactManifestSchema = z.strictObject({
  artifact_uid: z.string().uuid(),
  artifact_type: z.string().trim().min(1),
  schema_version: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string(),
  canonical_path: z.string().trim().min(1),
  presentation_path: z.string().trim().min(1),
  render_mode: z.literal("html"),
  skill_call_id: z.string().trim().min(1),
  skill_name: z.string().trim().min(1),
  agent_id: z.string().trim().min(1),
  session_id: z.string().trim().min(1),
  user_id: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  logical_object_type: z.string().trim().min(1).optional(),
  logical_object_id: z.string().trim().min(1).optional(),
  version: z.number().int().positive().optional(),
  previous_artifact_ref: z.string().trim().min(1).optional(),
});

export type ActionArtifactManifest = z.infer<
  typeof actionArtifactManifestSchema
>;

export type ActionArtifactPublication = {
  artifact_uid: string;
  artifact_ref: string;
  artifact_type: string;
  schema_version: string;
  status: "ready" | "canonical_only" | "error";
  canonical_path?: string;
  presentation_path?: string;
  render_mode?: "html";
  error?: string;
};

export type PublicActionArtifactPublication = Omit<
  ActionArtifactPublication,
  "canonical_path" | "presentation_path"
>;

const actionArtifactIndexSchema = z.strictObject({
  artifact_uid: z.string().uuid(),
  artifact_ref: z.string().trim().min(1),
  artifact_type: z.string().trim().min(1),
  schema_version: z.string().trim().min(1),
  status: z.enum(["ready", "canonical_only"]),
  canonical_path: z.string().trim().min(1),
  presentation_path: z.string().trim().min(1).optional(),
  user_id: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export type ActionArtifactIndex = z.infer<typeof actionArtifactIndexSchema>;
export const ACTION_ARTIFACT_INDEX_SUFFIX = ".artifact-index.json";

export function toPublicActionArtifactPublication(
  publication: ActionArtifactPublication,
): PublicActionArtifactPublication {
  const {
    canonical_path: _canonicalPath,
    presentation_path: _presentationPath,
    ...publicValue
  } = publication;
  return publicValue;
}

export function toArtifactRef(artifactUid: string): string {
  return `artifact://${artifactUid}`;
}

export const ACTION_ARTIFACT_MANIFEST_SUFFIX = ".artifact.json";

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/[/\\][^\s]+/g, "[path]").slice(0, 500);
}

function assertSafeSlug(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`Invalid artifact slug ${JSON.stringify(value)}`);
  }
}

export function isPathInsideWorkspace(
  root: string,
  candidate: string,
): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  const pathFromRoot = relative(normalizedRoot, normalizedCandidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

function resultArtifactPath(result: JsonValue | undefined): string | undefined {
  let value: unknown = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const raw = (value as { artifact?: { path?: unknown } } | undefined)?.artifact
    ?.path;
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

/**
 * Resolve the file explicitly returned by the Skill. As a compatibility
 * fallback for models that wrote the required artifact but omitted its path
 * from ReturnSkillResult, accept exactly one recent, schema-matching JSON file
 * from the two Action-owned output directories.
 */
export async function resolveActionSkillArtifactPath(input: {
  completion: ActionCompletionForArtifact;
  workspaceDir: string;
  artifactType: string;
}): Promise<string> {
  const workspace = resolve(input.workspaceDir);
  const explicit = resultArtifactPath(input.completion.result);
  if (explicit) {
    const candidate = isAbsolute(explicit)
      ? explicit
      : resolve(workspace, explicit);
    if (!isPathInsideWorkspace(workspace, candidate)) {
      throw new Error("Skill artifact path escapes the workspace");
    }
    const canonical = await realpath(candidate).catch(() => "");
    if (canonical) {
      if (!isPathInsideWorkspace(workspace, canonical)) {
        throw new Error("Skill artifact path escapes the workspace");
      }
      const metadata = await stat(canonical).catch(() => undefined);
      if (metadata?.isFile()) return canonical;
    }
    // Some models prepend the repository-relative workspace path even though
    // the Action already runs with the user workspace as cwd. Treat a missing
    // explicit path as a serialization mistake and use the same unique,
    // recent, schema-matching recovery used when the path is omitted.
  }

  const completedAt = Date.parse(input.completion.completed_at);
  const duration = Math.max(0, input.completion.duration_ms ?? 0);
  const earliest = completedAt - duration - 60_000;
  const latest = completedAt + 60_000;
  const matches: string[] = [];
  for (const directory of [workspace, join(workspace, "action_artifacts")]) {
    const names = await readdir(directory).catch(() => [] as string[]);
    for (const name of names) {
      if (
        !name.endsWith(".json") ||
        name.endsWith(ACTION_ARTIFACT_INDEX_SUFFIX)
      )
        continue;
      const candidate = join(directory, name);
      const metadata = await stat(candidate).catch(() => undefined);
      if (
        !metadata?.isFile() ||
        metadata.mtimeMs < earliest ||
        metadata.mtimeMs > latest
      )
        continue;
      const canonical = await realpath(candidate).catch(() => "");
      if (!canonical || !isPathInsideWorkspace(workspace, canonical)) continue;
      try {
        const value = JSON.parse(await readFile(canonical, "utf8")) as {
          artifact_type?: unknown;
        };
        if (value.artifact_type === input.artifactType) matches.push(canonical);
      } catch {
        // Non-JSON and unrelated JSON files are not candidates.
      }
    }
  }
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    throw new Error(
      unique.length === 0
        ? "Skill result artifact.path is unavailable and no matching recent artifact exists"
        : "Skill result artifact.path is unavailable and multiple matching recent artifacts exist",
    );
  }
  return unique[0]!;
}

export function assertActionArtifactPublished(
  completion: ActionCompletionForArtifact,
  publication: ActionArtifactPublication | undefined,
): void {
  if (completion.outcome !== "success") return;
  if (!publication || publication.status === "error") {
    throw new Error(
      `ARTIFACT_PUBLICATION_FAILED: ${publication?.error ?? "Skill did not produce a publishable artifact"}`,
    );
  }
}

export async function readActionArtifactManifest(
  presentationPath: string,
  workspaceDir: string,
): Promise<ActionArtifactManifest | undefined> {
  try {
    const source = await readFile(
      `${presentationPath}${ACTION_ARTIFACT_MANIFEST_SUFFIX}`,
      "utf8",
    );
    const manifest = actionArtifactManifestSchema.parse(JSON.parse(source));
    if (
      normalize(manifest.presentation_path) !== normalize(presentationPath) ||
      !isPathInsideWorkspace(workspaceDir, manifest.presentation_path) ||
      !isPathInsideWorkspace(workspaceDir, manifest.canonical_path)
    ) {
      return undefined;
    }
    return manifest;
  } catch {
    return undefined;
  }
}

export async function publishActionArtifact<
  TCanonical extends JsonValue,
>(input: {
  completion: ActionCompletionForArtifact;
  adapter: ActionArtifactAdapter<TCanonical>;
  workspaceDir: string;
  sessionId: string;
  userId?: string | null;
  logicalObject?: {
    type: string;
    id: string;
    version: number;
    previousArtifactRef?: string;
  };
}): Promise<ActionArtifactPublication | undefined> {
  if (input.completion.outcome !== "success") return undefined;

  const artifactUid = randomUUID();
  const artifactRef = toArtifactRef(artifactUid);
  const workspaceDir = resolve(input.workspaceDir);
  assertSafeSlug(input.adapter.artifactSlug);

  let canonical: TCanonical;
  try {
    canonical = await input.adapter.toCanonical(input.completion);
  } catch (error) {
    return {
      artifact_uid: artifactUid,
      artifact_ref: artifactRef,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: "error",
      error: safeError(error),
    };
  }

  const canonicalDir = join(workspaceDir, "action_artifacts");
  const presentationDir = join(workspaceDir, "html_generated");
  const canonicalPath = join(
    canonicalDir,
    `${input.adapter.artifactSlug}-${artifactUid}.json`,
  );
  const presentationPath = join(
    presentationDir,
    `${input.adapter.artifactSlug}-${artifactUid}.html`,
  );
  const indexPath = join(
    canonicalDir,
    `${input.adapter.artifactSlug}-${artifactUid}${ACTION_ARTIFACT_INDEX_SUFFIX}`,
  );
  const createdAt = new Date().toISOString();

  try {
    await mkdir(canonicalDir, { recursive: true });
    await mkdir(presentationDir, { recursive: true });
    const serialized = `${JSON.stringify(canonical, null, 2)}\n`;
    JSON.parse(serialized);
    await writeFile(canonicalPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    const index: ActionArtifactIndex = {
      artifact_uid: artifactUid,
      artifact_ref: artifactRef,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: "canonical_only",
      canonical_path: canonicalPath,
      user_id: input.userId ?? null,
      created_at: createdAt,
      ...(input.logicalObject
        ? {
            logical_object_type: input.logicalObject.type,
            logical_object_id: input.logicalObject.id,
            version: input.logicalObject.version,
            ...(input.logicalObject.previousArtifactRef
              ? {
                  previous_artifact_ref:
                    input.logicalObject.previousArtifactRef,
                }
              : {}),
          }
        : {}),
    };
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    return {
      artifact_uid: artifactUid,
      artifact_ref: artifactRef,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: "error",
      error: safeError(error),
    };
  }

  let presentation: ArtifactPresentation;
  try {
    presentation = input.adapter.render(canonical);
    if (!presentation.html.trim()) {
      throw new Error("Artifact adapter returned empty HTML");
    }
    await writeFile(presentationPath, presentation.html, {
      encoding: "utf8",
      flag: "wx",
    });

    const manifest: ActionArtifactManifest = {
      artifact_uid: artifactUid,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      title: presentation.title,
      summary: presentation.summary,
      canonical_path: canonicalPath,
      presentation_path: presentationPath,
      render_mode: presentation.renderMode,
      skill_call_id: input.completion.skill_call_id,
      skill_name: input.completion.skill_name,
      agent_id: input.completion.agent_id,
      session_id: input.sessionId,
      user_id: input.userId ?? null,
      created_at: createdAt,
    };
    await writeFile(
      `${presentationPath}${ACTION_ARTIFACT_MANIFEST_SUFFIX}`,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    const index: ActionArtifactIndex = {
      artifact_uid: artifactUid,
      artifact_ref: artifactRef,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: "ready",
      canonical_path: canonicalPath,
      presentation_path: presentationPath,
      user_id: input.userId ?? null,
      created_at: createdAt,
    };
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, {
      encoding: "utf8",
      flag: "w",
    });
  } catch (error) {
    return {
      artifact_uid: artifactUid,
      artifact_ref: artifactRef,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: "canonical_only",
      canonical_path: canonicalPath,
      error: safeError(error),
    };
  }

  return {
    artifact_uid: artifactUid,
    artifact_ref: artifactRef,
    artifact_type: input.adapter.artifactType,
    schema_version: input.adapter.schemaVersion,
    status: "ready",
    canonical_path: canonicalPath,
    presentation_path: presentationPath,
    render_mode: "html",
  };
}
