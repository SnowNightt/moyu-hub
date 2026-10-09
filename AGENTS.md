# Agent 开发规则

## 工作边界

- 开始任务先读[文档地图](docs/index.md)，再按任务阅读相关工程规范、OpenSpec、代码、测试和 `git status`。用户只要求分析或方案时不编辑文件。
- 保留已有用户修改；只提交本次改动。每组相关改动完成后创建本地 Git commit，未经用户明确允许不推送。
- 实现保持直接、清晰，不增加无依据的抽象、防御或兜底。不将计划能力、测试 fixture 或原型演示当作正式实现。
- 沿用 Tauri 2、React、TypeScript、Vite 和 pnpm；目录与依赖方向遵循[项目规范](docs/project-conventions.md)，系统边界见[架构](docs/architecture.md)。

## 功能与文档

- 功能新增、行为变化和需要记录的修复遵循[开发流程](docs/workflows/development.md)，使用 `openspec/` 管理规格、提案、设计和任务。不要在 `docs/` 建立平行 Spec、变更目录或提案模板。
- 当前规格在 `openspec/specs/`，活动变更在 `openspec/changes/`，项目约束在 `openspec/config.yaml`。使用 CLI 的 schema 与 instructions，不手写另一套模板。
- 用户已明确确认的具体要求无需重复批准；影响结果的关键行为歧义先澄清。未回复不算同意，当前代码也不能直接充当正确需求。
- 按[文档更新矩阵](docs/documentation.md#更新矩阵)同步工程文档。原有本地需求、设计和实施材料只是历史输入，后续功能约定在 OpenSpec 中维护。

## 验证与交付

- 代码行为变化和 Bug 修复编写或更新相关测试，按[测试指南](docs/testing.md)运行受影响测试和适用文档检查，不默认运行全量测试，返回时告诉我测试了哪些功能，通过率如何，是否有破坏性修复。
- 浏览器预览、单元测试与真实桌面验收分别报告；不将浏览器玻璃效果或模拟原生命令写成 Windows 验证结果。
- 交付前检查相关 OpenSpec 文档和 diff；只提交本次代码、测试及文档，说明实际验证、未验证事项和本地 commit。
- 修复 Bug 时说明复现方式、原因、预期行为、解决办法、回归结果与关键修复代码。
