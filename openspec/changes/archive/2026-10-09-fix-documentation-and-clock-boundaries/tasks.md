# Tasks

## 1. 文档导航

- [x] 1.1 修正 README 正式链接，将历史记录标为可选本地材料；按 Git 文件清单验证所有相对链接可在克隆后解析。

## 2. 共享时钟

- [x] 2.1 提取 Clock，切换两个页面到共享出口并更新 UI、架构与测试指南；验证时钟显示、分钟更新和卸载清理，确认没有跨模块页面导入。

## 3. 集成检查

- [x] 3.1 运行首页导航回归、类型与修改文件格式检查、文档链接检查和 OpenSpec 严格校验，记录结果并检查 diff。

## 验证结果

- `pnpm exec vitest run src/shared/ui/Clock/Clock.test.ts src/features/steam/navigation.test.ts`：2 个文件、7 项测试通过，通过率 100%。覆盖时钟日期/24 小时时间显示、分钟切换、StrictMode 卸载清理及首页/Steam 导航。
- `pnpm typecheck`、修改文件的 `prettier --check`、`git diff --check` 和 OpenSpec 严格校验通过。
- 一次性链接检查：61 个相对链接、3 个锚点全部有效，正式入口均指向 Git 已跟踪文件或本次新增组件。
- 一次性模块导入检查：107 个相对导入中没有跨模块页面依赖。
- 无破坏性修复；不修改用户数据、数据库或原生能力。未运行全量测试或真实桌面验收。

## Workflow follow-up

- 验证通过后归档本次工程变更，不修改功能规格；仅提交本次文件，创建本地 commit，不推送。
