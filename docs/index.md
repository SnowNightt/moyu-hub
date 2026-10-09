# 文档地图

本页是 MoyuHub 的工程文档入口。先读 [Agent 规则](../AGENTS.md)，再按任务选择文档。

| 任务                       | 入口                                        |
| -------------------------- | ------------------------------------------- |
| 项目用途、环境、启动和打包 | [README](../README.md)                      |
| 目录、命名和代码归属       | [项目规范](project-conventions.md)          |
| 当前模块、平台与数据边界   | [架构](architecture.md)                     |
| 准备变化、实现和提交       | [开发流程](workflows/development.md)        |
| 测试选择与交付验证         | [测试指南](testing.md)                      |
| 文档职责与同步规则         | [文档维护规则](documentation.md)            |
| 当前功能规格               | [OpenSpec 当前规格](../openspec/specs/)     |
| 活动功能变更               | [OpenSpec 进行中变更](../openspec/changes/) |

## OpenSpec 文档位置

本项目使用 `spec-driven` schema，初始化时使用 OpenSpec CLI 1.14.1；通过 `openspec init --tools none` 仅建立项目目录，继续使用已有的用户级 OpenSpec skills。

- [当前规格](../openspec/specs/)：默认路径 `openspec/specs/<domain>/spec.md`。
- [进行中变更](../openspec/changes/)：默认路径 `openspec/changes/<change-name>/`，包括 `proposal.md`、`design.md`、`tasks.md` 和规格增量 `specs/<domain>/spec.md`。
- [归档目录](../openspec/changes/archive/)：完成后默认保存到 `openspec/changes/archive/YYYY-MM-DD-<change-name>/`。
- [项目配置](../openspec/config.yaml)：schema、中文文档要求与项目约束。文件结构和工作流以本机 CLI 的实际输出为准。

活动变更名称使用小写英文和连字符，不预加日期；日期前缀由归档流程生成。初始化仅建立空的规格与变更目录，没有导入历史功能规格，也没有创建活动变更。首次功能工作需按 CLI instructions 建立相应规格，不将空目录视为现有功能缺失。

## 既有本地参考

根目录的 `MoyuHub_功能文档.md`、`MoyuHub_技术文档.md`、`MoyuHub_精简设计文档(1).md` 与 `MoyuHub_液态玻璃交互原型.html` 是本次需求、技术和设计输入；`docs/documents/` 保存已有架构、实施和验证材料，其中包括在线阅读来源评估。这些材料有的被 Git 忽略，有的尚未跟踪，克隆仓库时可能不存在。初始化保留其内容和路径，不批量纳入版本控制。

上述材料包含目标方案、阶段记录与未完成验证，不能整体视为已实现或已批准规格。迁移相关行为时在 OpenSpec 中核对用户要求、源码和测试；原文与当前实现冲突时记录差异。新工程文档从本页或已登记文档可达，不继续在旧目录新增功能提案。
