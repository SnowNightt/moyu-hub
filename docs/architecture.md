# 架构

本文记录初始化时核对源码得到的工程边界；用户行为规格由 OpenSpec 维护。技术输入中的目标方案与当前代码不完全一致，以下明确区分。

## 运行结构

```text
React 页面 / 业务组件
  → AppServices 中的模块 provider / repository
    → TypeScript 请求、解析、缓存与平台适配器
      → Tauri HTTP → Steam 商店
      → Tauri SQL → SQLite
      → Rust reader commands → 用户文件与阅读数据

Settings store → Zustand persist → Tauri Store
AppLayout / desktop adapter → Tauri Window、Tray、Windows 原生窗口
```

[main.tsx](../src/main.tsx) 启动应用，[services.tsx](../src/app/services.tsx) 显式组装服务，[router.tsx](../src/app/router.tsx) 使用 Hash Router，适用于浏览器预览和打包 WebView。`AppLayout` 承载导航、全局播放器容器及 Steam 详情宿主；首页通过聚合 provider 复用已注册模块。

Vite 开发服务器使用 `127.0.0.1:1420`，发布时只提供构建后的静态资源；正式服务不依赖开发服务器中间件。浏览器运行时 `createAppServices()` 返回空服务，窗口能力禁用，设置走独立的 localStorage；这条路径用于布局预览。

## 当前接入状态

| 模块         | 当前工程实现                                                    | 待完成部分                                  |
| ------------ | --------------------------------------------------------------- | ------------------------------------------- |
| 应用壳、设置 | 六项导航、主题、偏好持久化、Windows 窗口与托盘                  | 其他平台、Windows 11 与跨屏专项验证         |
| Steam        | `SteamProvider`、商店请求、解析、共享缓存与详情                 | 第三方协议变化时定向修正与真实桌面回归      |
| 首页         | `HomeProvider` 聚合 Steam 与本地阅读摘要                        | 音乐、小黑盒注册后的摘要接入                |
| 本地阅读     | `ReaderRepository`、Rust 四格式导入、按需正文/图片、SQLite 数据 | 具体支持边界由相关规格和回归核对            |
| 网易云音乐   | provider、页面、播放器容器与状态框架                            | api-enhanced 请求、登录、播放引擎和真实数据 |
| 小黑盒       | provider 与页面框架                                             | 数据来源和真实适配器                        |
| 在线阅读     | `OnlineReaderProvider` 与界面框架                               | 来源协议验证、适配器与在线内容接入          |

音乐目标来源已选择独立的 api-enhanced HTTP 服务，但当前没有注册音乐 provider 或配置其 HTTP 权限。在线阅读已有本地来源评估，部分链路未通过；评估并不代表 `onlineReader` 已接入或相关方案已完成。本次初始化不选择新的来源或迁移业务数据。

## 数据与存储边界

- Steam 的 [api.ts](../src/features/steam/api.ts) 构造请求，[parsers.ts](../src/features/steam/parsers.ts) 将商店 JSON/HTML 映射为内部模型；页面只消费 provider。商店协议与搜索 HTML 不保证长期稳定，fixture 用于离线解析回归。
- [createSteamProvider.ts](../src/features/steam/createSteamProvider.ts) 共享请求和内存缓存，[remoteCache.ts](../src/platform/remoteCache.ts) 提供 SQLite 缓存。请求取消、离线旧数据标记和清理后的旧请求回填由适配器处理，首页复用同一服务。
- [database.ts](../src/platform/database.ts) 通过 SQL 插件建立 `sqlite:moyuhub.db` 连接；Rust 的 [lib.rs](../src-tauri/src/lib.rs) 注册 `0001_steam.sql` 和 `0002_reader.sql`。阅读器 Rust 层通过 SQLx 处理阅读数据事务。
- [platform/reader.ts](../src/platform/reader.ts) 封装 `reader_select`、`reader_api`、`reader_asset`。Rust [reader 模块](../src-tauri/src/reader/mod.rs) 负责选择令牌、导入任务、解析、文件访问与资源读取，不向页面开放任意文件路径读取。
- 阅读库表包括 `library_items`、`reader_chapters`、`reader_resources`、`reading_progress` 和 `bookmarks`；历史由进度记录提供，未使用旧 `recent_items` 表。正文和图片按需读取，图片通过 Blob URL 交给前端并按生命周期释放。
- [storage.ts](../src/platform/storage.ts) 封装 Tauri Store 与浏览器 localStorage，偏好通过 Zustand persist 异步恢复和串行写入。真正退出前等待设置与阅读进度写入；导入的取消清理由现有阅读生命周期处理。

当前本地导入采用 Rust Dialog 和原生命令读取文件，没有安装通用 File System 插件；技术输入中的 Dialog + File System 是目标描述。`FileGateway` 和通用 `CacheRepository` 为预留契约，当前服务没有将它们注册为可用功能。

## 桌面边界

[tauri.conf.json](../src-tauri/tauri.conf.json) 规定 960 × 600 逻辑像素固定窗口，禁用调整尺寸、最大化与原生装饰/阴影；窗口初始化期间隐藏。窗口位置持久化只使用 `POSITION`，不恢复旧尺寸。

Windows 的 `frameless_window.rs` 处理非客户区，`rounded_window.rs` 根据 DPI 裁剪 18px 圆角，`desktop_blur.rs` 在 UI 线程维护 DWM 共享背景与 DirectComposition 模糊。背景接口包含未公开 API；失败时回退系统材质，再回退可读底色。浏览器不能验收该效果。已有本机 Windows 10 22H2 验证记录属于历史证据，Windows 11、不同 GPU 和跨屏行为仍需对应环境验证。

[desktop.mjs](../scripts/desktop.mjs) 使用 `.build-tmp/` 管理构建临时文件；开发运行和 debug 构建将应用数据隔离到 `.runtime-data/`，普通发布使用系统应用目录。开发数据不得混入发布包。

## 接入后续模块

沿用 provider → 平台适配器的边界，在 `createAppServices()` 注册真实实现，更新相应 HTTP capability、CSP、测试和 OpenSpec 变更。不因页面框架存在就标注服务可用，不通过前端或安装包携带共享服务密钥。

工程规则见[项目规范](project-conventions.md)，真实桌面与发布验证见[测试指南](testing.md)。
