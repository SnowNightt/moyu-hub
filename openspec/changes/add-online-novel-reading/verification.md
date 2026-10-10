# 实施验证记录

日期：2026-10-10。阶段：P0 来源验证；实施进度 1/45。在线功能整体未完成，当前阻塞为神凑原生搜索的 Cloudflare 验证。具体请求契约与样本见 [source-verification.md](source-verification.md)。

## 已执行验证

| 验证                  | 实际结果                                                         | 证据边界                                                                           |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 笔趣阁真实 Tauri HTTP | 三部作品，24/24 请求成功；章节标题与目录逐项一致                 | 搜索/作者/详情/目录/正文/封面协议，不是完整阅读 UI 或恢复流程                      |
| 神凑真实 Tauri HTTP   | 详情、目录、正文及一张图片可获取；两轮书名/作者搜索共 4/4 被拦截 | 搜索 0/4 通过，不能按元数据 GET 成功宣布来源完整通过                               |
| 独立探针编译          | 项目库编译及独立 EXE 链接成功，出现既有 linker stdout warning    | 常规 debug build 初次被正在运行的 EXE 锁定，未替换原应用二进制；不是正式安装包构建 |
| 现有阅读定向回归      | 2 个文件、6/6 测试通过，100%                                     | 内存 SQLite 与模拟原生命令测试，不验证真实在线功能                                 |

定向回归命令：

```powershell
pnpm exec vitest run src/features/reader/reader.test.ts src/platform/reader.test.ts
```

实际输出：`Test Files 2 passed (2)`，`Tests 6 passed (6)`，耗时 320ms。覆盖旧持久化约束/回滚、历史和书签保留、本地进度算法、导入事件顺序、位置写入失败/串行化、初始化重试和取消。没有将这 6 项当作在线适配器回归。

笔趣阁原生摘要另执行一致性断言：每部 8 个请求均为 200、无 challenge/坏 JSON；第 1/2/3 章标题与目录一致、作品名一致、正文非空，封面尺寸有效。神凑复核断言确认两项搜索仍为 403、`cf-mitigated: challenge` 且已使用表单请求头；这个断言确认阻塞证据，不意味着搜索通过。

## 文档与任务校验

以下命令在本轮文档更新后执行，严格规格、四份变更文档的格式和 diff 检查通过；9 份变更 Markdown 的 14 个本地相对链接全部存在。CLI 实施进度确认 1/45，其余 44 项未完成：

```powershell
openspec validate add-online-novel-reading --strict --no-interactive
openspec instructions apply --change add-online-novel-reading --json
pnpm exec prettier --check openspec/changes/add-online-novel-reading/source-verification.md openspec/changes/add-online-novel-reading/verification.md openspec/changes/add-online-novel-reading/design.md openspec/changes/add-online-novel-reading/tasks.md
git diff --check
```

任务 1.1 仅在来源记录交付后勾选；1.2/1.3/1.4 及后续任务保持未完成。文档格式、相对链接、任务状态及严格规格检查不替代功能验收。

## 未执行与未通过

- 神凑免账号登录的原生搜索、搜索结果解析/分页及三部完整链路未通过。
- 来源使用条件尚未完整核对，正式 Rust 图片下载/重定向/体积/尺寸校验未实施。
- 未注册正式 provider；在线标签、详情操作、阅读/书架/历史/首页、缓存和设置功能未实施。
- 未执行新数据库迁移；四格式非空旧库升级、回滚及跨层旧数据验收未执行。
- 未执行完整 Windows 桌面开发版/NSIS 安装版功能验收、断网/目录修订/缓存竞争/性能验收。
- 未运行应用全量测试，也没有因阶段被阻塞而将其余任务标为通过。

## 工作区与交付边界

- 本轮持久化变更仅包括此 OpenSpec 变更中的来源证据、实施记录、任务状态与已验证协议说明。
- 生产源码、Cargo.toml、正式 HTTP capability/CSP 和既有数据库迁移保持原状；没有主动结束用户原运行进程或替换其 EXE。没有破坏性修复或用户书库迁移。
- 用户原有 `AGENTS.md` 修改及未跟踪的 `docs/documents/` 保留，不纳入本轮提交。临时探针和隔离数据留在现有忽略目录。
- 按项目规则仅创建本轮文档变更的中文描述本地 commit，不推送、不归档，也不同步主规格为已实现状态。
