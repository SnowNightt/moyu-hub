# 项目规范

## 技术与目录

沿用 [package.json](../package.json) 和 [Cargo.toml](../src-tauri/Cargo.toml) 中的实际依赖：Tauri 2、React、TypeScript、Vite、React Router、Zustand、SQLite，包管理器为 `pnpm@11.7.0`。前端通过 pnpm 管理，Rust 通过 Cargo 管理；提交对应锁文件，不混用其他包管理器。

| 目录                                                      | 归属                                                |
| --------------------------------------------------------- | --------------------------------------------------- |
| `src/app/`                                                | 应用布局、Hash Router、服务组装、全局异常与窗口状态 |
| `src/features/{home,music,steam,heybox,reader,settings}/` | 模块页面、业务组件、provider、模型与模块逻辑        |
| `src/shared/ui/`                                          | 通用展示组件，按组件目录组织，经 `index.ts` 导出    |
| `src/shared/styles/`                                      | 设计变量、基础规则、共享工具类与桌面环境材质样式    |
| `src/shared/lib/`                                         | 资源状态、加载器和通用纯逻辑                        |
| `src/platform/`                                           | 运行环境、HTTP、SQLite、缓存、设置与原生命令适配    |
| `src-tauri/src/`                                          | Tauri 注册、Rust 阅读解析及 Windows 窗口实现        |
| `src-tauri/migrations/`                                   | SQLite 版本化迁移                                   |
| `src-tauri/capabilities/`                                 | 当前使用的插件权限与 HTTP 范围                      |
| `scripts/desktop.mjs`                                     | 桌面开发与构建包装入口                              |
| `docs/`、`openspec/`                                      | 工程指南、功能规格与变更，职责见文档维护规则        |

`demo/`、本地原型和 `docs/documents/` 是已有参考输入，不是正式应用入口。`node_modules/`、`dist/`、`src-tauri/target/`、`src-tauri/gen/`、`.build-tmp/`、`.runtime-data/` 和 TypeScript 构建缓存不提交。

## 模块依赖

页面和业务组件通过模块 `provider.ts` 契约或专属设置 store 消费数据，真实服务在 [services.tsx](../src/app/services.tsx) 组装。页面不拼第三方 URL、解析远端响应、直接导入数据库/文件插件或调用 `invoke`。来源请求与解析放模块适配器，平台能力封装在 `src/platform/`。

首页通过 `HomeProvider` 聚合其他模块摘要；模块之间优先依赖 provider 类型和纯模型，不直接互相依赖页面。共享 UI 只接收属性与回调，不依赖 feature、Tauri、Zustand 或应用服务。平台层可使用必要的业务契约，不引用页面；`platform/reader.ts` 对阅读偏好的现有依赖是当前实现边界，不为追求抽象另建空层。

`FileGateway` 等预留接口未注册，不意味着已有实现。未接入服务保持缺省值，UI 使用资源状态说明未接入，不将假数据或 fixture 填入正式服务。

## 命名、样式与类型

- React 组件用 PascalCase `.tsx`，工具、provider、store 和模型沿用 camelCase `.ts`；测试与被测逻辑就近放置为 `.test.ts`。Rust 模块使用 snake_case `.rs`。
- TypeScript 使用现有 strict 配置，公开契约显式定义，类型导入使用 `import type`；不绕过类型检查解决数据源变化。
- 遵循 [.prettierrc.json](../.prettierrc.json)：单引号、尾逗号、100 列。使用普通 `.css` 配合类名前缀，不使用 CSS Modules；公共视觉变量沿用 `tokens.css`。
- 视觉调整依据已确认原型的应用部分及用户后续要求，保留真实桌面玻璃与清晰前景；不将原型背景包装成桌面材质。
- 稳定通用组件通过 `shared/ui/index.ts` 导出并更新 [UI 说明](../src/shared/ui/README.md)。不提前拆出未被其他项目使用的 UI 包。

### 样式归属

页面 CSS 与对应 `Page.tsx` 同目录，例如 [HomePage.css](../src/features/home/HomePage.css)；独立业务组件使用同名 CSS，例如 [Player.css](../src/features/music/Player.css)、[GameCard.css](../src/features/steam/GameCard.css)。共享 UI 样式放各组件目录，例如 [Button.css](../src/shared/ui/Button/Button.css)。页面负责布局及其对共享组件的覆盖，组件负责自身基础视觉与状态。

业务类名使用 `home-`、`music-`、`steam-`、`heybox-`、`reader-`、`settings-` 前缀；应用壳使用 `app-`，共享组件和工具类使用 `ui-`。共享状态使用 `ui-active`、`ui-compact` 等有前缀的类，并在所属组件选择器内限定，不能单独声明全局 `.ui-active` 外观。不同用途的类名保持唯一，不因添加前缀合并不同选择器。动态类名同样带前缀，例如 `reader-${mode}`；业务状态值保持原有定义。

全局样式仅维护 [tokens.css](../src/shared/styles/tokens.css) 的主题变量、[base.css](../src/shared/styles/base.css) 的基础规则、[utilities.css](../src/shared/styles/utilities.css) 的共享排版/表单/图片类和 [shell.css](../src/shared/styles/shell.css) 的桌面环境材质规则。页面样式不使用裸标签全局选择器；标签规则需由所属前缀类限定。

[styles.css](../src/app/styles.css) 是应用样式组装入口，由 `main.tsx` 导入，统一加载全局、共享 UI、应用壳、业务组件与页面样式，避免组件导入顺序隐式决定级联。播放器控件与空状态末尾加载的原因在入口中说明。新增样式文件需在入口登记；同一归属中的基础、固定窗口适配及明暗主题覆盖在该文件内维护。普通 CSS 不会因导入位置自动隔离，不能依靠页面切换卸载 CSS。

## 状态、数据与权限

路由、页签、搜索、筛选和页码由 Router 管理；展示状态留在组件；跨页面播放器与偏好使用既有 Zustand store。书架、阅读进度、书签和缓存由仓库及 SQLite 管理，不再维护第二份持久化业务数据。

异步加载保留取消、过期响应处理与错误状态。设置持久化沿用字段白名单、迁移与串行写入；新增字段同步默认值、校验、迁移和相关测试。清缓存、取消任务和真正退出需遵守现有写入及资源清理边界。

新增数据库变化使用新迁移并在 Rust 中注册；不修改已发布迁移及其校验值。`0001_steam.sql` 的旧 `recent_items` 表为升级兼容保留，不恢复已经取消的 Steam 浏览历史业务，也不擅自清除用户数据。

第三方响应、HTML、EPUB 和用户文件均经过对应解析边界，不直接执行或插入不可信内容。HTTP capability 和 CSP 随真实接入按需扩展，不能以通配符全域开放解决请求失败。服务密钥、Cookie、登录令牌不进入仓库、前端包或日志；音乐会话存储方案待相应功能变更确定。
