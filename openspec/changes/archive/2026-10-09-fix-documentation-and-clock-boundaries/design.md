# Design

## Context

问题动机见 [proposal.md](proposal.md)。实际历史目录为 `docs/documents/`；三个 README 链接目标均被 `.gitignore` 排除。首页的 Clock 仅使用 React 局部状态和定时器，没有业务依赖。

## Goals / Non-Goals

**Goals:** README 在干净克隆中可导航；首页与小黑盒通过共享出口复用现有时钟，避免页面之间的依赖。

**Non-Goals:** 不修改历史材料的 Git 管理策略，不搬迁或重写历史文件，不调整样式、时区、刷新频率、业务数据或原生窗口。

## Decisions

- README 指向已跟踪的 `docs/architecture.md`、`docs/testing.md`，历史记录以可选本地代码路径列出。仅改成新目录链接仍会在克隆后失效，批量提交历史材料则会扩大范围。
- Clock 原样移动到 `src/shared/ui/Clock/index.tsx` 并通过 UI barrel 导出，两个页面只更换导入。共享 UI 继续不访问 Tauri、store 或业务服务，不新增全局计时 store。
- 使用 jsdom 和假定时器验证显示、分钟更新与卸载清理，同时运行既有首页导航回归；链接检查依据 Git 跟踪文件而非只检查本机存在。

## Risks / Trade-offs

- [提取时钟时遗漏计时器清理或更改显示] → 原样移动实现，验证分钟切换和卸载后没有残留定时器。
- [本地历史记录无法在克隆后打开] → 明确标为可选本地材料，正式导航只依赖仓库内指南。
