# 生涯规划助手前端

这个仓库是生涯规划 Agent 应用的前端项目，用来展示对话工作台、用户画像、工作画布和 API 适配层。

如果你只是想看项目能跑成什么样，不需要先读具体代码。按下面命令启动即可。

## 这个仓库负责什么

- Vue 前端应用壳体
- 左侧导航、会话页、画像页、工件页、设置页
- 对话消息展示，包括 markdown、折叠 reasoning、多 agent 名称/颜色、图片、视频和本地文件附件
- 工作画布宿主，包括 `html` 工件和受信任 `url` 工件
- 前端 mock 数据、API client、上游 payload 适配合同
- 前端状态、加载态、错误态和本地验证流程

这个仓库不负责：

- 后端业务逻辑
- agent 推理、prompt 编排和工具调用
- artifact 生成逻辑
- 数据库、对象存储、实时推送服务
- 启动或守护外部 Node 应用

后端和 agent 的二次开发由上游 `claude-code-rev` 仓库负责。

## 常用文件夹

- `src/app`：应用入口、路由和整体壳体。
- `src/pages`：会话、画像、工件、设置等页面。
- `src/modules`：按功能拆分的 UI 模块，例如 conversation、profile、artifacts、navigation。
- `src/services`：前端 API client、mock client、上游合同适配。
- `src/stores`：Pinia 状态管理。
- `src/types`：核心类型定义。
- `src/styles`：全局样式和主题 token。
- `public/mock-media`：本地图片、视频 fixture。
- `public/mock-node-canvas`：旧的同源 URL 工件 fixture。
- `tests/work-canvas`：工作画布本地验证说明和 Node fixture。
- `docs`：英文实现文档、规格、测试策略和交接日志。
- `docs/zh`：中文审查和团队同步文档。

## 本地运行

安装依赖后启动前端：

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

浏览器打开：

```text
http://127.0.0.1:4173/
```

默认 mock 会展示到 `thread-008`，包括周计划、职业方向、模拟面试、代码题、二次函数可视化、图片和视频消息。

当前输入区支持选择图片和文件。第一版只做本地预览和本地草稿消息，不会上传到服务端；等后端上传接口稳定后再接真实上传链路。

## 外部应用示例展示

外部应用示例用于验证“前端只接收 URL，然后嵌入工作画布”的路径。

默认约定外部示例仓库位于前端仓库同级目录：

```text
../app_examples
```

如果你的路径不同，修改下面命令里的 `APP_EXAMPLES_DIR`。

终端 1：启动静态 HTML 示例。

```bash
APP_EXAMPLES_DIR="../app_examples"
python3 -m http.server 4320 --directory "$APP_EXAMPLES_DIR/bounce-game"
```

终端 2：启动 Node 示例。

```bash
APP_EXAMPLES_DIR="../app_examples"
cd "$APP_EXAMPLES_DIR/derivative-game"
npm start
```

终端 3：启动前端，并注入示例 URL 和 iframe allowlist。

```bash
npm run dev:app-examples -- --host 127.0.0.1 --port 4173
```

然后打开：

- `http://127.0.0.1:4173/threads/thread-009`：静态 HTML 示例。
- `http://127.0.0.1:4173/threads/thread-010`：Node 示例。

注意：前端只负责消费 URL，不负责启动外部项目。真实后端接入后，也应由后端提供可嵌入的 HTTP URL。

## 验证命令

普通改动至少运行：

```bash
npm run test
npm run build
```

如果改了工作画布、iframe、会话动作或外部 URL 示例，还应进行浏览器手动验证。

## 给新 AI / 新协作者的阅读顺序

如果没有任何历史上下文，建议按这个顺序读：

1. `README.md`：英文快速入口，给通用开发 agent 看。
2. `CLAUDE.md`：给 Claude Code / 无上下文大模型的执行规则。
3. `README_zh.md`：中文展示和运行说明。
4. `docs/career-agent-spec.md`：英文实现规格。
5. `docs/zh/career-agent-spec.md`：中文规格审查版。
6. `docs/frontend-implementation-plan.md`：阶段计划和当前实现边界。
7. `docs/frontend-testing-strategy.md`：什么时候必须加测试。
8. `docs/zh/team-sync.md`：需要人类和后端 / agent 团队确认的事项。
9. `docs/zh/pr-workflow.md`：中文 PR 和 Copilot 审查流程。
10. `tests/work-canvas/README.md`：工作画布与外部应用示例的本地验证方法。

## 当前判断

这份中文 README 只负责“能看懂、能运行、知道边界”。如果要修改具体功能，仍应以 `docs/career-agent-spec.md`、`docs/frontend-implementation-plan.md` 和代码内类型合同为准。
