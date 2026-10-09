# Proposal

## Why

README 的三个文档链接指向 `docs/documents/` 中被 Git 忽略的历史材料，克隆仓库后失效。小黑盒通过首页页面模块复用时钟，违背模块之间不直接依赖页面的工程约定。

## What Changes

- README 使用已跟踪的架构与测试指南作为入口，历史实施和验收记录保留为可选本地路径。
- 将现有 Clock 提取到共享 UI，通过公开出口供首页和小黑盒消费，保留显示格式、样式及每秒刷新行为。
- 更新共享组件说明、工程指南和定向回归验证。

## Capabilities

### New Capabilities

无。本次仅修正文档并重构现有组件，`.openspec.yaml` 设置 `skip_specs: true`。

### Modified Capabilities

无。页面行为、外部接口、用户数据与原生能力不变。

## Impact

涉及 README、共享 UI、首页、小黑盒和相关工程指南；不新增依赖，不修改数据库迁移或历史本地材料。无破坏性变化。
