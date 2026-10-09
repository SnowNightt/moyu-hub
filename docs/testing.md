# 测试与验证

## 环境与已有工具

采用 README 已记录的 Node.js 24、pnpm 11、Rust stable、Visual Studio 2022 C++ 工具链和 WebView2；pnpm 的精确版本见 `packageManager`。部分 SQLite 测试使用 Node 内置 `node:sqlite`，不能按普通浏览器测试运行。

[vitest.config.ts](../vitest.config.ts) 默认使用 Node 环境，仅匹配 `src/**/*.test.ts`；需要 DOM 的现有测试通过文件指令选择 jsdom。测试就近放置。未配置 ESLint、持久化 Markdown 链接检查、Playwright/E2E 或 CI 文档检查，不能将这些检查写成已通过。

## 按改动选择检查

以下命令从项目根目录运行；选择相关行，不默认执行全表或全量测试。

| 改动范围                             | 定向验证                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steam 请求、解析或缓存               | `pnpm exec vitest run src/features/steam/parsers.test.ts src/features/steam/createSteamProvider.test.ts src/platform/http.test.ts src/platform/database.test.ts` |
| Steam 详情、分页、来源导航或首页聚合 | `pnpm exec vitest run src/features/steam/navigation.test.ts src/features/steam/SteamScreenshotCarousel.test.ts`                                                  |
| 阅读进度、历史、书签、导入状态或仓库 | `pnpm exec vitest run src/features/reader/reader.test.ts src/platform/reader.test.ts`                                                                            |
| 设置字段、持久化校验或迁移           | `pnpm exec vitest run src/features/settings/model.test.ts`                                                                                                       |
| 原生模糊调用调度                     | `pnpm exec vitest run src/platform/latestTask.test.ts`                                                                                                           |
| Rust 阅读解析与仓库逻辑              | `cargo test --manifest-path src-tauri/Cargo.toml reader::`                                                                                                       |
| Windows 圆角                         | `cargo test --manifest-path src-tauri/Cargo.toml rounded_window::`                                                                                               |
| Windows 无边框                       | `cargo test --manifest-path src-tauri/Cargo.toml frameless_window::`                                                                                             |
| Windows 模糊计算                     | `cargo test --manifest-path src-tauri/Cargo.toml desktop_blur::`                                                                                                 |
| TypeScript 类型、公开契约或前端接线  | `pnpm typecheck`                                                                                                                                                 |
| 前端构建、静态资源或 Vite 配置       | `pnpm build`                                                                                                                                                     |
| Rust/Tauri 注册、权限或配置          | `cargo check --manifest-path src-tauri/Cargo.toml`，涉及前端时同时检查类型                                                                                       |
| 工程规范与 OpenSpec 配置             | 下文的文档检查，不运行应用测试                                                                                                                                   |

每项可进一步缩小到单个测试文件或 Rust 测试名。`pnpm test` 是现有全量前端测试入口，只在实际改动需要时使用；结构化数据测试不等于真实 Tauri 插件或用户文件系统验收。

## 文档与 OpenSpec 检查

新增工程文档使用已有 Prettier 检查，显式列文件以免改写历史材料：

```powershell
pnpm exec prettier --check AGENTS.md docs/index.md docs/workflows/development.md docs/documentation.md docs/testing.md docs/project-conventions.md docs/architecture.md openspec/config.yaml
git diff --check
openspec doctor --json
openspec list --json
openspec list --specs --json
```

核对所有新增或修改的 Markdown 相对链接：按所在文档目录解析路径并检查文件/目录存在；锚点需匹配实际标题。PowerShell `Test-Path -LiteralPath` 可检查目标路径。必需导航不依赖忽略文件，新文档从地图可达。当前没有持久化自动链接检查脚本，任务中运行的一次性检查需在交付时说明。

核对命令来自 `package.json`、安装的 OpenSpec `--help` 或 Cargo，并核对测试文件存在；检查工程文档没有另建功能规格或提案。CLI `doctor` 需要读取结果中的健康状态，不能仅看退出码。

存在功能变更时使用 `openspec validate change-name --strict --no-interactive`；根据任务范围可校验对应规格。初始化后的空目录只能说明没有变更/规格可校验，不能报告功能规格全部通过。

## 浏览器、桌面与发布验收

纯布局变化可用 `pnpm dev` 检查浏览器预览。真实窗口用 `pnpm desktop:dev`；两者不要同时占用 1420 端口。窗口置顶、关闭/托盘、透明背景、圆角/DPI、背景模糊和本地文件选择必须在实际桌面验证。

需要验证原生命令及调试包时使用 `pnpm tauri build --debug --no-bundle`。发布变化使用 `pnpm desktop:build` 生成 NSIS 安装包，并在前端开发服务器关闭时验收独立运行。debug 使用 `.runtime-data/`，发布使用系统数据目录，数据隔离也需验证。

针对受影响行为检查加载、空结果、错误/重试、取消、离线缓存、重启持久化与正常退出。远程服务实测与离线 fixture 回归分别记录。Windows 原生效果需记录系统版本、DPI 和运行模式，跨平台或 Windows 11 未执行就明确标为未验证。
