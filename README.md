# MoyuHub

基于 **Tauri 2 + React + TypeScript + Vite** 的桌面工作台。已搭建应用架构、全页面框架和基础桌面能力，并接入 Steam 商店模块与首页推荐、SQLite 远程缓存。

界面依据当前 `MoyuHub_液态玻璃交互原型.html` 的应用部分。窗口为 **960 × 600 逻辑像素**，不能调整尺寸或最大化。保留原型的浅色/深色玻璃、绿色配色、鱼形标志、侧栏、页面比例与沉浸阅读布局。正式应用没有原型的山景背景。

按用户后续要求关闭原生窗口阴影，并去除浅色、深色应用外层的 CSS 外阴影；保留玻璃边缘高光和内部卡片层次。

Windows 原生窗口使用与页面一致的 18px 圆角裁剪；DPI 改变时重新计算物理像素区域。Windows 10 使用遵守圆角区域的原生 Blur，避免 Acrylic 背景从四个圆角外露出矩形尖角；Windows 11 保留 Acrylic。

Windows 同时关闭标题栏和阴影时，仅移除系统样式仍可能留下经典标题栏。原生启动流程同时关闭 DWM 非客户区绘制、拦截非客户区绘制消息，并过滤后续样式重写，避免系统标题栏与应用顶部重叠；窗口完成初始化后再显示。

## 运行

已验证的开发环境：Node.js 24、pnpm 11、Rust stable、Visual Studio 2022 C++ 工具链、WebView2。

```sh
pnpm install
pnpm dev                    # 浏览器预览：http://127.0.0.1:1420
pnpm desktop:dev            # Tauri 开发窗口，自动启动前端服务器
pnpm build                  # 类型检查 + 前端构建
pnpm test                   # 设置、Steam、阅读器服务与 SQLite 测试
pnpm desktop:build          # Windows 发布构建 + NSIS 安装包
pnpm tauri build --debug --no-bundle  # 本地可执行调试版本
```

`pnpm dev` 和 `pnpm desktop:dev` 不应同时占用 1420 端口。浏览器中窗口置顶、最小化与关闭按钮禁用，避免用网页状态冒充操作系统能力。

Windows 命令包装器 `scripts/desktop.mjs` 使用项目内 `.build-tmp/` 作为构建临时目录。开发运行及 `--debug` 构建使用独立的 `.runtime-data/` 数据目录；普通发布构建使用 Tauri 的系统应用数据目录。两者均不进入版本控制，开发偏好不会混入发布版。

## 已搭建范围

- 主布局：六项导航、窗口拖动区、置顶/最小化/关闭控件、全局播放器容器。
- 首页：音乐、继续阅读、Steam、小黑盒区域。
- 音乐：搜索、歌单/歌曲列表、最近播放、歌词、账号登录弹窗、播放队列弹窗。
- Steam：中国区简体中文精选、热销、特惠类型筛选与分页、八类浏览、名称搜索及分页、应用内详情与截图、离线数据回退。
- 小黑盒：推荐/讨论/最近浏览、搜索、帖子详情、图片弹窗、评论区域。
- 阅读器：TXT/EPUB 小说、CBZ/图片文件夹漫画本地导入，书架分类搜索、引用/复制、章节目录、分页/滚动、漫画按需图片、进度恢复、书签、历史与首页继续阅读。在线来源仍未接入。
- 设置：主题、不透明度、模糊强度、窗口偏好、音量和阅读偏好持久化。缓存用量未接入时显示 `—`。

Steam 与首页共用请求和缓存。已移除首页最近使用及 Steam 最近浏览，不采集或写入游戏浏览记录。阅读器使用本地 SQLite，正文和图片通过 Rust 按需读取；音乐登录/播放、小黑盒和在线阅读仍未接入。未接入的业务动作禁用，正式服务不填入测试作品或假进度。

本地导入默认引用原文件，可选择复制到应用书库。TXT 支持编码预览和手动选择；漫画支持 JPEG、PNG、WebP。EPUB 首版支持文字正文、基础强调、插图和内部目录链接，不支持 DRM、固定版式和图片型 EPUB。移出书架不会删除原始文件；清理缓存保留托管原件、进度和书签。详细规则、实现差异和验收见 [阅读器实施记录](docs/documents/reader-implementation.md)。

## 架构与后续接入

详见 [架构说明](docs/documents/architecture.md)。各模块的 `provider.ts` 定义数据契约；在 `src/app/services.tsx` 注册真实实现。页面不拼接第三方 URL、不解析第三方响应、不直接调用原生文件或数据库插件。

桌面启动通过 `createAppServices()` 注册 Steam、首页聚合、HTTP 与 SQLite 远程缓存；无需 Steam API Key。HTTP 仅允许 Steam 商店指定路径，图片 CSP 使用 Steam CDN 白名单。普通浏览器预览保留明确的未接入状态，测试 fixture 不进入正式服务。详细实现与待人工验收项见 `docs/documents/steam-implementation-plan.md` 和验证记录。

玻璃材质始终开启。“窗口不透明度”下面的“模糊强度”滑杆可独立调节真实桌面背景模糊，并自动保存。0% 为最弱玻璃，100% 为最强，默认 40%。Windows 原生实现使用 DWM 共享背景与 DirectComposition 高斯模糊；背景接口属于未公开 API，当前已在本机 Windows 10 22H2 验证。能力不可用时禁用滑杆，回退系统 Blur / Acrylic；系统材质也不可用时保留可读底色。浏览器预览不模拟原生桌面模糊。

## 验证

构建、运行与界面检查记录见 [阶段验收记录](docs/documents/verification.md)。浏览器布局验收不等于真实桌面玻璃效果验收；Windows 11 未在本机验证。

## 项目规范与 OpenSpec

开发前先读 [Agent 规则](AGENTS.md)和[文档地图](docs/index.md)。工程规范包括开发流程、当前架构、代码约定、测试指南和文档维护规则；功能规格与变更统一在 [OpenSpec](openspec/config.yaml) 中维护。

项目已通过 `openspec init --tools none` 初始化，使用 `spec-driven` schema，仅生成 OpenSpec 目录，继续使用已有用户级 OpenSpec skills。本次初始化未导入历史功能规格、未创建活动变更，原有需求和设计材料保留为输入。新功能从 `openspec new change change-name` 开始，完整流程见[开发流程](docs/workflows/development.md)。
