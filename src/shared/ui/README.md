# 公共组件

统一从 `src/shared/ui/index.ts` 导入。组件不调用服务、不读取全局 store、不访问 Tauri。

Clock 供首页和小黑盒的页面标题区复用，不从任一页面模块导出。

| 组件         | 用途与关键属性                                         | 默认与状态                                                          |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Button       | 原生按钮属性；`variant` 为 primary/secondary/text/icon | secondary、type=button；hover/focus/active/disabled                 |
| Panel        | 玻璃内容区域；原生 section 属性、className             | ui-glass + ui-panel                                                 |
| SectionTitle | title、icon/brand、action                              | 区域标题和可选操作                                                  |
| EmptyState   | title、description、icon、compact                      | 不含假数据的空或未接入说明                                          |
| ResourceView | state、children(data)、retry、label、empty             | 未接入/加载/错误/成功四态；成功数据为空由 children 处理             |
| Tabs         | items、value、onChange                                 | 受控；方向键、Home/End、焦点和 aria-selected                        |
| SearchBox    | placeholder、value、onChange、onSubmit                 | 受控；Enter 提交、清空按钮                                          |
| Switch       | label、checked、onChange、disabled                     | 受控原生 checkbox；role=switch                                      |
| Slider       | label、value、onChange、min/max/step、disabled         | 0～100、step=1；受控原生 range                                      |
| Dialog       | title、open、onClose、children、wide                   | 原生 dialog；焦点约束、Esc、外部点击、关闭按钮                      |
| PageHeader   | title、subtitle、right                                 | 原型页面标题区域                                                    |
| Pagination   | page、totalPages、onChange                             | 无有效页数显示 `— / —` 并禁用翻页                                   |
| Clock        | 日期与时间展示，无公开属性                             | 系统本地时间；中文月日/星期与 24 小时时分，每秒刷新，卸载清理定时器 |

```tsx
import { Button, Dialog, Panel, ResourceView, Tabs } from '../../shared/ui';

<Panel>
  <Tabs items={[{ value: 'shelf', label: '书架' }, { value: 'history', label: '历史' }]}
    value={tab} onChange={setTab} />
  <ResourceView state={resource} label="书架" retry={reload}>
    {(items) => <BookList items={items} />}
  </ResourceView>
  <Button variant="primary" onClick={() => setOpen(true)}>导入本地</Button>
</Panel>
<Dialog title="本地导入" open={open} onClose={() => setOpen(false)}>
  <ImportContent />
</Dialog>
```

样式由组件目录内的普通 CSS 维护，例如 [Button.css](Button/Button.css)、[Panel.css](Panel/Panel.css) 与 [Clock.css](Clock/Clock.css)，由 [应用样式入口](../../app/styles.css) 统一加载。组件与共享工具类使用 `ui-` 前缀，主题变量位于 `shared/styles/tokens.css`。`className` 接收调用方带页面/业务前缀的布局类；组件内部外观留在组件 CSS，页面覆盖留在对应页面 CSS。Button 的 variant 值仍是 primary/secondary/text/icon，实际渲染为 `ui-button-*`；Link 可复用这些类。

新增业务行为应通过回调接入，不能把 Tauri 或特定模块的请求层移入公共组件。

时钟用法：`<PageHeader title="首页" right={<Clock />} />`，其中 Clock 和 PageHeader 均从公共出口导入。
