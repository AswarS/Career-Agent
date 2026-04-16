# Claude Code Rev 启动指南

## 适用目录

- 项目目录: `d:\code\claude-code-rev`

## 环境要求

- Node.js 24+
- Bun 1.3.5+

## 1. 检查环境

在项目目录执行:

```powershell
node -v
bun --version
```

期望输出示例:

- `v24.x.x`
- `1.3.x`

## 2. 安装依赖

```powershell
bun install
```

## 3. 验证版本

```powershell
bun run version
```

期望输出:

```text
2.1.88 (Claude Code)
```

## 4. 验证启动参数

```powershell
bun run dev --help
```

看到 `Usage: claude [options] [command] [prompt]` 即表示 CLI 启动正常。

## 5. 直接启动

```powershell
bun run dev
```

说明:

- 该命令会进入交互式终端界面。
- 如需中断可使用 `Ctrl + C`。

## 常见问题

### Q1: 提示找不到 bun

先安装 Bun（PowerShell）:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
irm https://bun.sh/install.ps1 | iex
```

安装后重开终端再执行 `bun --version`。

### Q2: 版本不是 2.1.88

确认你在 `d:\code\claude-code-rev` 目录执行，并运行:

```powershell
bun run version
```

如果仍不一致，先执行:

```powershell
bun install
```

再重试版本命令。
