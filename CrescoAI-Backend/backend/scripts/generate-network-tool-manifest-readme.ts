import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NetworkToolManifest } from "./generate-network-tool-manifest.js";

type StringRecord = Record<string, unknown>;

const TOP_LEVEL_FIELDS: Record<string, string> = {
  manifest_version: "清单格式版本；用于判断消费方是否支持当前 JSON 结构。",
  generated_at: "本次有效内容首次生成的 ISO 8601 时间；内容未变化时保持不变。",
  source_revision: "生成清单时对应的 Git 分支、提交和工作区脏状态。",
  scope: "本清单覆盖的运行上下文以及生成时采用的环境假设。",
  resources: "Tool 会消费、产出、读取或写入的顶层资源目录。",
  tools:
    "实际纳入清单的可用 Tool 记录；同名 Tool 在不同 context 下可有多条记录。",
  excluded_tools:
    "注册过但经 Network 层判定不可用、因而未进入 tools 的审计记录。",
  warnings: "生成时发现但未阻断产物输出的漂移或环境问题。",
};

const SOURCE_REVISION_FIELDS: Record<string, string> = {
  branch: "生成时所在 Git 分支。",
  commit: "生成时的 Git commit 标识。",
  dirty: "生成时工作区是否存在未提交变化。",
};

const SCOPE_FIELDS: Record<string, string> = {
  include_mcp: "是否包含 MCP Tool；本清单固定为 `false`。",
  contexts: "本清单实际枚举的 Network 运行上下文。",
  assumptions: "为得到可复现 Tool 集而采用的权限、Tool Search 和 prompt 环境。",
};

const SCOPE_ASSUMPTION_FIELDS: Record<string, string> = {
  permission_mode: "生成 Tool 池时采用的权限模式。",
  tool_search_mode: "生成环境解析出的 Tool Search 模式。",
  tool_search_loading: "Deferred Tool 适用于哪些模型能力条件。",
  prompt_contract_context:
    "解析动态 Tool prompt 时模拟的认证上下文，不包含真实凭据。",
};

const TOOL_FIELDS: Record<string, string> = {
  id: "图节点应优先使用的稳定标识；包含 context、tool_type、name，必要时包含 schema namespace。",
  name: "暴露给模型的 Tool 名称；它不保证跨 context 唯一。",
  aliases: "Tool 可被检索或兼容识别的其他名称。",
  tool_type:
    "`harness_tool` 为原生 Harness Tool；`skill_tool` 为从 Skill 封装出的具体 Tool。建图时两者可同等处理。",
  skill_binding: "仅 Skill Tool 非空，记录其来源 Skill 及封装入口模式。",
  context: "该 Tool 实际可用的 Network 运行上下文。",
  schema_cache_namespace:
    "区分同名但 schema 不同的 Tool 合约；不需要区分时为 `null`。",
  description:
    "实际解析后的 Tool prompt/说明，可用于检索、选 Tool 或节点描述。",
  search_hint: "面向 Tool Search 的短提示；没有独立提示时为 `null`。",
  input_schema: "Tool 输入的 JSON Schema。",
  output_schema:
    "Tool 输出的 JSON Schema；源码未声明时为 `null`，生成器不会猜测。",
  availability: "平台/运行时层面的可用性；不表示业务数据是否已经准备好。",
  loading:
    "`eager` 直接进入 Tool 集；`deferred` 在支持 Tool Search 的模型中按需加载。",
  properties: "只读性、破坏性、并发安全、交互要求和严格 schema 等执行属性。",
  resource_io: "经过整理的语义资源 I/O，可直接转换为 Tool—Resource 边。",
  source: "Tool 的代码来源类型、文件和导出名。",
  schema_hash: "输入/输出合约的 SHA-256 漂移指纹。",
};

const SKILL_BINDING_FIELDS: Record<string, string> = {
  skill_name: "生成该具体 Tool 的 Skill 名称。",
  entry_mode: "Skill 被封装为 Tool 的入口模式；当前为 `action-tool`。",
};

const AVAILABILITY_FIELDS: Record<string, string> = {
  status:
    "`available` 表示在 scope/assumptions 下无额外平台门槛；`conditional` 表示必须满足 conditions。",
  conditions:
    "平台、模型或运行时暴露条件。业务前置数据不放这里，而由 input_schema/resource_io 表达。",
};

const CONDITION_FIELDS: Record<string, string> = {
  type: "条件的机器可读类别。",
  description: "条件的人类可读说明。",
};

const PROPERTY_FIELDS: Record<string, string> = {
  read_only: "是否只读；`input_dependent` 表示取决于具体调用参数。",
  destructive: "是否可能产生难恢复的副作用；`input_dependent` 表示取决于参数。",
  concurrency_safe:
    "是否可与其他调用安全并行；`input_dependent` 表示取决于参数。",
  requires_user_interaction: "执行过程中是否要求用户交互。",
  strict: "是否按严格 schema 约束输入。",
};

const RESOURCE_IO_FIELDS: Record<string, string> = {
  consumes: "调用所需或在特定条件下使用的不可变/版本化输入资源。",
  produces: "调用创建的新资源。",
  reads: "调用读取的状态、快照或句柄。",
  writes: "调用创建、变更或推进的状态/句柄。",
};

const RESOURCE_BINDING_FIELDS: Record<string, string> = {
  resource_id: "指向顶层 resources[].id 的外键。",
  binding: "资源与 Tool 输入/输出字段、引用格式之间的映射。",
  requirement: "`required_in_schema`、`required_semantically` 或 `optional`。",
  resolution: "资源的解析来源，例如显式输入或上下文推导。",
  access: "读取/写入动作的语义名称。",
  operations: "当一个 Tool 支持多种资源操作时列出具体操作。",
  produced_when: "满足指定输入条件时才产出该资源。",
  when: "满足指定输入条件时该绑定才生效。",
};

const RESOURCE_FIELDS: Record<string, string> = {
  id: "资源稳定标识，也是 resource_io 中使用的外键。",
  kind: "`artifact`、`state`、`handle` 或 `snapshot`。",
  resource_type: "领域资源类型名称。",
  schema_version: "资源 schema 版本；未独立版本化时为 `null`。",
  scope: "资源所属范围：user、conversation、session 或 job。",
  persistence:
    "资源实际持久化位置：workspace、database、session、process 或 job。",
  mutable: "资源是否可原地变化。",
  versioned: "资源是否显式版本化。",
  reference: "Tool 传递该资源时使用的引用格式；不通过引用传递时为 `null`。",
  description: "资源的领域语义说明。",
  source: "资源定义或语义整理所依据的源码位置。",
};

const TOOL_SOURCE_FIELDS: Record<string, string> = {
  kind: "`builtin`、`service` 或 `generated_skill_action`。",
  file: "相对于项目根目录的源码文件。",
  export: "定义或创建该 Tool 的导出符号。",
};

const RESOURCE_REFERENCE_FIELDS: Record<string, string> = {
  format: "引用值的格式，例如 `artifact://<uuid>` 或 `task_id`。",
  opaque: "引用是否应被消费方当作不透明标识。",
};

const RESOURCE_SOURCE_FIELDS: Record<string, string> = {
  kind: "`declared` 表示源码有明确领域定义；`curated` 表示由本清单整理语义。",
  file: "资源定义或语义整理所依据的源码文件。",
};

const EXCLUDED_FIELDS: Record<string, string> = {
  name: "被排除的 Tool 名称。",
  context: "排除发生的运行上下文。",
  reason: "为什么注册存在但在该 Network 上下文不可用。",
  enforced_by: "由 Network runtime 还是 permission 层执行排除。",
  source: "被排除 Tool 的源码位置。",
};

const EXCLUDED_SOURCE_FIELDS: Record<string, string> = {
  file: "被排除 Tool 的源码文件。",
  export: "定义被排除 Tool 的导出符号。",
};

function assertObject(
  value: unknown,
  label: string,
): asserts value is StringRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertDocumentedFields(
  records: unknown[],
  docs: Record<string, string>,
  label: string,
): void {
  const actual = new Set<string>();
  for (const [index, record] of records.entries()) {
    assertObject(record, `${label}[${index}]`);
    for (const key of Object.keys(record)) actual.add(key);
  }
  const undocumented = [...actual].filter((key) => !(key in docs)).sort();
  if (undocumented.length > 0) {
    throw new Error(
      `${label} has undocumented fields: ${undocumented.join(", ")}`,
    );
  }
}

function validateDocumentationCoverage(manifest: NetworkToolManifest): void {
  assertDocumentedFields([manifest], TOP_LEVEL_FIELDS, "manifest");
  assertDocumentedFields(
    [manifest.source_revision],
    SOURCE_REVISION_FIELDS,
    "source_revision",
  );
  assertDocumentedFields([manifest.scope], SCOPE_FIELDS, "scope");
  assertDocumentedFields(
    [manifest.scope.assumptions],
    SCOPE_ASSUMPTION_FIELDS,
    "scope.assumptions",
  );
  assertDocumentedFields(manifest.tools, TOOL_FIELDS, "tools");
  assertDocumentedFields(
    manifest.tools.flatMap((tool) =>
      tool.skill_binding === null ? [] : [tool.skill_binding],
    ),
    SKILL_BINDING_FIELDS,
    "tools[].skill_binding",
  );
  assertDocumentedFields(
    manifest.tools.map((tool) => tool.availability),
    AVAILABILITY_FIELDS,
    "tools[].availability",
  );
  assertDocumentedFields(
    manifest.tools.flatMap((tool) => tool.availability.conditions),
    CONDITION_FIELDS,
    "tools[].availability.conditions",
  );
  assertDocumentedFields(
    manifest.tools.map((tool) => tool.properties),
    PROPERTY_FIELDS,
    "tools[].properties",
  );
  assertDocumentedFields(
    manifest.tools.map((tool) => tool.resource_io),
    RESOURCE_IO_FIELDS,
    "tools[].resource_io",
  );
  assertDocumentedFields(
    manifest.tools.flatMap((tool) => [
      ...tool.resource_io.consumes,
      ...tool.resource_io.produces,
      ...tool.resource_io.reads,
      ...tool.resource_io.writes,
    ]),
    RESOURCE_BINDING_FIELDS,
    "resource bindings",
  );
  assertDocumentedFields(manifest.resources, RESOURCE_FIELDS, "resources");
  assertDocumentedFields(
    manifest.tools.map((tool) => tool.source),
    TOOL_SOURCE_FIELDS,
    "tools[].source",
  );
  assertDocumentedFields(
    manifest.resources.flatMap((resource) =>
      resource.reference === null ? [] : [resource.reference],
    ),
    RESOURCE_REFERENCE_FIELDS,
    "resources[].reference",
  );
  assertDocumentedFields(
    manifest.resources.map((resource) => resource.source),
    RESOURCE_SOURCE_FIELDS,
    "resources[].source",
  );
  assertDocumentedFields(
    manifest.excluded_tools,
    EXCLUDED_FIELDS,
    "excluded_tools",
  );
  assertDocumentedFields(
    manifest.excluded_tools.map((tool) => tool.source),
    EXCLUDED_SOURCE_FIELDS,
    "excluded_tools[].source",
  );
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br>")
    .replaceAll("\n", "<br>");
}

function code(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return `\`${String(value).replaceAll("`", "\\`")}\``;
}

function table(headers: string[], rows: unknown[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function countBy<T>(
  values: T[],
  key: (value: T) => string,
): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = key(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right));
}

function renderCountTable(rows: [string, number][]): string {
  return table(
    ["分类", "数量"],
    rows.map(([label, count]) => [code(label), count]),
  );
}

function renderFieldTable(fields: Record<string, string>): string {
  return table(
    ["字段", "说明"],
    Object.entries(fields).map(([field, description]) => [
      code(field),
      description,
    ]),
  );
}

function resourceIoCount(tool: NetworkToolManifest["tools"][number]): string {
  const io = tool.resource_io;
  return `C${io.consumes.length}/P${io.produces.length}/R${io.reads.length}/W${io.writes.length}`;
}

export function renderNetworkToolManifestReadme(
  manifest: NetworkToolManifest,
  options: { manifestFileName?: string } = {},
): string {
  validateDocumentationCoverage(manifest);
  const manifestFileName =
    options.manifestFileName ?? "network-tool-manifest.json";
  const distinctNames = new Set(manifest.tools.map((tool) => tool.name)).size;
  const toolsWithResourceIo = manifest.tools.filter((tool) =>
    Object.values(tool.resource_io).some((bindings) => bindings.length > 0),
  ).length;
  const missingOutputSchemas = manifest.tools.filter(
    (tool) => tool.output_schema === null,
  );
  const skillTools = manifest.tools.filter(
    (tool) => tool.tool_type === "skill_tool",
  );
  const conditionalTools = manifest.tools.filter(
    (tool) => tool.availability.status === "conditional",
  );
  const revision = manifest.source_revision;
  const warningText =
    manifest.warnings.length === 0
      ? "无。"
      : manifest.warnings.map((warning) => `- ${warning}`).join("\n");

  const sections = [
    "# Network Tool Manifest",
    "> 此文件由 `scripts/generate-network-tool-manifest-readme.ts` 根据 `" +
      manifestFileName +
      "` 自动生成，请勿直接编辑。",
    "这份 README 面向依赖关系图生成方，用来快速确认清单边界、统计口径和字段语义。JSON 是机器可读的事实来源；README 是它的可读索引。",
    "## 快速结论",
    table(
      ["指标", "值"],
      [
        ["Manifest 版本", code(manifest.manifest_version)],
        ["生成时间", code(manifest.generated_at)],
        [
          "源码版本",
          `${code(revision.branch)} / ${code(revision.commit)}${revision.dirty ? "（dirty）" : ""}`,
        ],
        ["Tool 记录数", manifest.tools.length],
        ["不同 Tool 名称数", distinctNames],
        [
          "Harness Tool",
          manifest.tools.filter((tool) => tool.tool_type === "harness_tool")
            .length,
        ],
        ["Skill Tool", skillTools.length],
        ["Resource 数", manifest.resources.length],
        ["带 Resource I/O 的 Tool", toolsWithResourceIo],
        ["缺少 output_schema 的 Tool", missingOutputSchemas.length],
        ["排除 Tool 数", manifest.excluded_tools.length],
        ["Warning 数", manifest.warnings.length],
        ["包含 MCP Tool", code(manifest.scope.include_mcp)],
      ],
    ),
    "注意：`tools.length` 是上下文化后的 Tool 记录数，不等于唯一名称数。同名 Tool（目前主要是 Profile Tool）可因 context/schema namespace 不同而有不同合约，建图应使用 `tools[].id` 作为节点 ID。",
    "## 范围与生成假设",
    table(
      ["项目", "值"],
      [
        ["Contexts", manifest.scope.contexts.map(code).join(", ")],
        ["MCP", "明确排除"],
        ["Permission mode", code(manifest.scope.assumptions.permission_mode)],
        ["Tool Search mode", code(manifest.scope.assumptions.tool_search_mode)],
        [
          "Tool Search loading",
          code(manifest.scope.assumptions.tool_search_loading),
        ],
        [
          "Prompt contract context",
          code(manifest.scope.assumptions.prompt_contract_context),
        ],
      ],
    ),
    "清单描述的是上述假设下由 Network 层实际组装并暴露的非 MCP Tool。它不是对 `src/tools` 目录或静态注册表的简单枚举。",
    "## 统计分布",
    "### 按 Context",
    renderCountTable(countBy(manifest.tools, (tool) => tool.context)),
    "### 按 Tool 类型",
    renderCountTable(countBy(manifest.tools, (tool) => tool.tool_type)),
    "### 按 Availability",
    renderCountTable(
      countBy(manifest.tools, (tool) => tool.availability.status),
    ),
    "### 按 Loading",
    renderCountTable(countBy(manifest.tools, (tool) => tool.loading)),
    "### 按源码类型",
    renderCountTable(countBy(manifest.tools, (tool) => tool.source.kind)),
    "### Resource 类型",
    renderCountTable(countBy(manifest.resources, (resource) => resource.kind)),
    "### Resource I/O 边",
    table(
      ["边类型", "数量"],
      [
        [
          code("consumes"),
          manifest.tools.reduce(
            (sum, tool) => sum + tool.resource_io.consumes.length,
            0,
          ),
        ],
        [
          code("produces"),
          manifest.tools.reduce(
            (sum, tool) => sum + tool.resource_io.produces.length,
            0,
          ),
        ],
        [
          code("reads"),
          manifest.tools.reduce(
            (sum, tool) => sum + tool.resource_io.reads.length,
            0,
          ),
        ],
        [
          code("writes"),
          manifest.tools.reduce(
            (sum, tool) => sum + tool.resource_io.writes.length,
            0,
          ),
        ],
      ],
    ),
    "## 如何用于建图",
    "1. 每条 `tools[]` 记录建立一个 Tool 节点，节点主键使用 `id`，不要只用 `name`。",
    "2. 每条 `resources[]` 记录建立一个 Resource 节点，主键使用 `id`。",
    "3. 从 `resource_io.consumes/produces/reads/writes` 建立四类 Tool—Resource 边；边上的 `when`、`produced_when`、`requirement`、`resolution`、`binding` 等属性应保留。",
    "4. `harness_tool` 与 `skill_tool` 在图中都作为 Tool；`tool_type` 和 `skill_binding` 只用于追溯来源或分组。",
    "5. `availability` 只处理平台/运行时门槛。业务资源是否具备，应根据 `input_schema` 和 `resource_io` 判断。",
    "6. 此 JSON 不声明 Tool—Tool 直接依赖边。若需要该类边，应由建图方根据 Resource 路径或其他规则派生，不能把数组顺序当作依赖顺序。",
    "I/O 缩写：`C` = consumes，`P` = produces，`R` = reads，`W` = writes。",
    "## Tool 索引",
    table(
      [
        "ID",
        "名称",
        "类型",
        "Context",
        "Availability",
        "Loading",
        "Resource I/O",
      ],
      manifest.tools.map((tool) => [
        code(tool.id),
        code(tool.name),
        code(tool.tool_type),
        code(tool.context),
        code(tool.availability.status),
        code(tool.loading),
        code(resourceIoCount(tool)),
      ]),
    ),
    "## Skill Tool 绑定",
    skillTools.length === 0
      ? "无。"
      : table(
          ["Tool ID", "Tool 名称", "来源 Skill", "入口模式"],
          skillTools.map((tool) => [
            code(tool.id),
            code(tool.name),
            code(tool.skill_binding?.skill_name),
            code(tool.skill_binding?.entry_mode),
          ]),
        ),
    "## Conditional Tool",
    conditionalTools.length === 0
      ? "无。"
      : table(
          ["Tool ID", "条件类型", "条件说明"],
          conditionalTools.flatMap((tool) =>
            tool.availability.conditions.map((condition) => [
              code(tool.id),
              code(condition.type),
              condition.description,
            ]),
          ),
        ),
    "## Resource 目录",
    table(
      ["ID", "Kind", "Scope", "Persistence", "Mutable", "Versioned", "说明"],
      manifest.resources.map((resource) => [
        code(resource.id),
        code(resource.kind),
        code(resource.scope),
        code(resource.persistence),
        code(resource.mutable),
        code(resource.versioned),
        resource.description,
      ]),
    ),
    "## 排除项",
    manifest.excluded_tools.length === 0
      ? "无。"
      : table(
          ["名称", "Context", "执行层", "原因"],
          manifest.excluded_tools.map((tool) => [
            code(tool.name),
            code(tool.context),
            code(tool.enforced_by),
            tool.reason,
          ]),
        ),
    "## Warnings",
    warningText,
    "## 合约缺口",
    missingOutputSchemas.length === 0
      ? "所有 Tool 都声明了 `output_schema`。"
      : `以下 Tool 的源码没有声明 \`output_schema\`，JSON 中保留为 \`null\`，生成器不会猜测：\n\n${missingOutputSchemas.map((tool) => `- ${code(tool.id)}`).join("\n")}`,
    "## 字段说明",
    "### 顶层字段",
    renderFieldTable(TOP_LEVEL_FIELDS),
    "### `source_revision`",
    renderFieldTable(SOURCE_REVISION_FIELDS),
    "### `scope`",
    renderFieldTable(SCOPE_FIELDS),
    "### `scope.assumptions`",
    renderFieldTable(SCOPE_ASSUMPTION_FIELDS),
    "### `tools[]`",
    renderFieldTable(TOOL_FIELDS),
    "### `tools[].skill_binding`",
    renderFieldTable(SKILL_BINDING_FIELDS),
    "### `tools[].availability`",
    renderFieldTable(AVAILABILITY_FIELDS),
    "### `tools[].availability.conditions[]`",
    renderFieldTable(CONDITION_FIELDS),
    "### `tools[].properties`",
    renderFieldTable(PROPERTY_FIELDS),
    "### `tools[].resource_io`",
    renderFieldTable(RESOURCE_IO_FIELDS),
    "### Resource binding",
    renderFieldTable(RESOURCE_BINDING_FIELDS),
    "`binding`、`when` 和 `produced_when` 的内部键是面向具体 Tool 合约的开放映射，不是全局固定字段；消费方应原样保留。",
    "### `tools[].source`",
    renderFieldTable(TOOL_SOURCE_FIELDS),
    "### `resources[]`",
    renderFieldTable(RESOURCE_FIELDS),
    "### `resources[].reference`",
    renderFieldTable(RESOURCE_REFERENCE_FIELDS),
    "### `resources[].source`",
    renderFieldTable(RESOURCE_SOURCE_FIELDS),
    "### `excluded_tools[]`",
    renderFieldTable(EXCLUDED_FIELDS),
    "### `excluded_tools[].source`",
    renderFieldTable(EXCLUDED_SOURCE_FIELDS),
    "## 自动生成边界",
    "以下内容从 JSON 自动计算：所有统计数字、Tool 索引、Skill 绑定、Conditional Tool、Resource 目录、排除项和 warnings。字段中文说明是维护在生成器中的稳定语义文档，因为 JSON 本身无法解释字段的业务含义。生成器会检查实际出现的字段是否已有说明；遇到未记录的新字段会失败，避免 README 静默过期。",
    "## 生成与校验",
    "推荐同时生成或校验 JSON 与 README：\n\n```bash\nbun run network-tools:artifacts\nbun run network-tools:artifacts:check\n```\n\n只处理已有 JSON 对应的 README：\n\n```bash\nbun run network-tools:readme\nbun run network-tools:readme:check\n```",
  ];

  return `${sections.join("\n\n")}\n`;
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const backendDir = resolve(scriptDir, "..");
  const args = process.argv.slice(2);
  const inputFile = resolve(
    flagValue(args, "--input") ??
      resolve(backendDir, "generated/network-tool-manifest.json"),
  );
  const outputFile = resolve(
    flagValue(args, "--output") ?? resolve(backendDir, "generated/README.md"),
  );
  const manifest = JSON.parse(
    await readFile(inputFile, "utf8"),
  ) as NetworkToolManifest;
  const next = renderNetworkToolManifestReadme(manifest, {
    manifestFileName:
      relative(dirname(outputFile), inputFile) || basename(inputFile),
  });

  if (args.includes("--check")) {
    let current: string | null = null;
    try {
      current = await readFile(outputFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (current !== next) {
      throw new Error(`Network Tool manifest README is stale: ${outputFile}`);
    }
    process.stdout.write(
      `${JSON.stringify({ mode: "check", input_file: inputFile, output_file: outputFile, tools: manifest.tools.length, resources: manifest.resources.length }, null, 2)}\n`,
    );
    return;
  }

  let current: string | null = null;
  try {
    current = await readFile(outputFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current !== next) {
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, next, "utf8");
  }
  process.stdout.write(
    `${JSON.stringify({ mode: "write", input_file: inputFile, output_file: outputFile, changed: current !== next, tools: manifest.tools.length, resources: manifest.resources.length }, null, 2)}\n`,
  );
}

if (import.meta.main) await main();
