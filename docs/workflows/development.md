# Agent 开发流程

工程规范由 [AGENTS](../../AGENTS.md) 与 [文档地图](../index.md) 管理；功能规格、提案、设计和任务由 OpenSpec 管理。

## 1. 阅读上下文

检查工作区与已有修改，再读相关[项目规范](../project-conventions.md)、[架构](../architecture.md)、OpenSpec 当前规格和活动变更、代码与测试。没有相应规格时，参考已有需求材料并核对实际实现，说明哪些是目标、哪些是现状。纯分析任务不编辑文件。

## 2. 准备 OpenSpec 变更

功能新增、行为变化与需要记录的修复使用已有用户级 OpenSpec skills，或使用安装的 CLI。项目没有生成 `.agents/skills/` 或其他项目级工具集成，因此不要假设每种客户端都有 `/opsx:*` 命令。

以下 PowerShell 示例中的 `change-name` 需替换为实际变更名：

```powershell
openspec list --json
openspec list --specs --json
openspec new change change-name
openspec status --change change-name --json
openspec instructions proposal --change change-name --json
```

根据 `status` 的依赖顺序，逐项读取 `instructions specs`、`instructions design` 和 `instructions tasks` 并生成对应文件。使用 CLI 返回的模板、输出路径与校验要求；中文描述保留 schema 要求的标题和结构。不要在 `docs/` 再建 Spec、提案、ADR 模板或另一套状态。

阅读并核对变更与用户要求。用户明确确认的变化无需重复询问；Agent 提出的行为变化或影响结果的歧义先澄清，不能把未回复当作批准。原需求中的“记住窗口大小”与当前固定尺寸窗口等差异，留给相关变更明确处理，初始化不替用户决定。

## 3. 实现与验证

```powershell
openspec validate change-name --strict --no-interactive
openspec instructions apply --change change-name --json
```

按已审阅的变更实现，在同一变更中更新设计、规格增量和任务进度。配置了新的服务时同步适配器、服务注册、HTTP 权限、CSP 和测试；窗口与 Rust 改动按目标 Windows 环境验收。按[更新矩阵](../documentation.md#更新矩阵)维护工程文档，按[测试指南](../testing.md)选择受影响测试与检查。

记录实际执行的命令、结果与未验证事项。CLI 规格校验不能替代 TypeScript、Rust、数据库或真实桌面验证。

## 4. 同步、归档与交付

完成实现和验证后，读取归档 instructions 并使用 OpenSpec 工作流同步当前规格、归档变更：

```powershell
openspec instructions archive --change change-name --json
openspec archive change-name
```

需要提前同步规格、暂不归档时使用已有的 OpenSpec sync skill。遵守实际 instructions，不跳过未完成任务或验证来宣布完成。

提交前检查相关 OpenSpec、工程文档和 `git diff`，仅暂存本次文件或变更块并创建本地 commit。未经用户明确允许不推送。交付说明结果、文档更新、验证和 commit；Bug 修复同时说明复现、原因、预期结果、解决办法与关键代码。
