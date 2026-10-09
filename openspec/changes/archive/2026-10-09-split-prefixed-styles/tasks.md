# Tasks

## 1. 样式归属与前缀迁移

- [x] 1.1 拆分全局、公共组件、应用壳与业务样式，迁移 className 和动态模式类名；检查 CSS 文件归属、选择器和声明完整性，无 .module.css 与 reference.css 引用。
- [x] 1.2 更新样式关联的 Clock、首页/Steam 导航测试选择器并执行时钟、导航、轮播定向回归，确认行为保持。
- [x] 1.3 同步项目规范、架构中的样式归属、公共 UI 说明与测试指南，检查 Markdown 链接及 Prettier。

## 2. 集成验证

- [x] 2.1 对比八个路由在明暗主题下的浏览器尺寸和计算样式，检查弹窗、主题切换与页面导航；记录浏览器和真实桌面验证边界。
- [x] 2.2 执行 pnpm typecheck、pnpm build、OpenSpec 严格校验与 git diff --check，核对最终 diff 和验证记录。

## Workflow follow-up

- 完成验证后按 CLI instructions 归档；纯重构无规格增量。
- 只提交本次改动，保留 docs/documents/ 中原有未跟踪材料，不推送。

## Validation results

- `pnpm exec vitest run src/shared/ui/Clock/Clock.test.ts src/features/steam/navigation.test.ts src/features/steam/SteamScreenshotCarousel.test.ts`：3 个文件、10 个测试全部通过（100%）。验证时钟更新/清理、首页与 Steam 导航、详情、特惠分页/筛选及截图轮播。
- `pnpm typecheck`、`pnpm build`：通过；未添加依赖或修改锁文件。
- 浏览器对照：16 个缺省状态组合和 36 个隔离 fixture 场景通过，详见 design.md。未执行真实 Windows/Tauri 桌面验收。
- 一次性静态检查：897 条选择器规则及声明完整保留、215 个类名映射唯一；32 个前端 AST 除 className、CSS 导入和 Button 发出的类名映射外保持一致。
- 修改范围内 Prettier 检查、38 个 Markdown 相对链接/锚点检查、`git diff --check` 通过。`openspec doctor --json` 显示 healthy=true；变更严格校验通过。
- 纯样式组织重构，无破坏性业务修复；原有未跟踪文档保留，测试脚本与 fixture 留在忽略目录中。
