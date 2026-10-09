# Proposal

## Why

各页面和共享组件样式集中在 reference.css、shell.css，并包含多轮适配覆盖，难以定位与维护。用户已确认采用普通 `.css` 加类名前缀，按页面和组件拆分。

## What Changes

- 页面、业务组件和公共 UI 的样式迁入各自目录中的普通 CSS 文件。
- 业务类名按 home/music/steam/heybox/reader/settings 前缀区分，应用壳使用 app 前缀，共享组件和工具类使用 ui 前缀。
- 移除 CSS Modules 和集中式 reference.css；全局保留设计变量、基础规则与桌面环境材质规则。
- 保持既有布局、明暗主题、交互状态、运行环境与业务行为；同步工程规范和样式接线回归。

## Capabilities

### New Capabilities

无。纯样式组织重构，`.openspec.yaml` 声明 `skip_specs: true`。

### Modified Capabilities

无。不调整用户行为要求。

## Impact

涉及 src/app、六个 feature、shared/ui、shared/styles、样式相关测试及工程文档。不新增依赖，不修改 provider、平台权限、存储或原生窗口实现。浏览器视觉回归与真实 Windows 桌面材质验收分别报告。
