# Steam 响应样本

采集日期：2026-10-03。公开商店内容，无登录信息、Cookie、个人游戏库或 API Key。只用于测试，正式服务不引用这些文件。

- `featured.json`：`/api/featuredcategories?cc=cn&l=schinese`。
- `detail.json`：`/api/appdetails?appids=620&cc=cn&l=schinese`。
- `unavailable.json`：同一详情地址，AppID 为 `999999999`，服务端返回 `success:false`。
- `search.json`：`/search/results/?term=portal&category1=998&start=0&count=20&infinite=1&cc=cn&l=schinese`。
- `genre-action.json`：同一搜索地址，将 `term` 换为 `tags=19`。
- `genre-filters.html`：`/search/?cc=cn&l=schinese` 中八种类型对应的原始筛选器起始标签，删去其他无关内容。

实测 `json=1` 返回 `desc/items`，因此使用 `infinite=1` 获取带总数的 HTML 分页结果。精选从 `new_releases` 读取新品，特惠从 `specials` 读取，热销从 `top_sellers` 读取；价格数字以最小货币单位保存。当前封面和截图样本来自 `shared.akamai.steamstatic.com` 与 `shared.fastly.steamstatic.com`。介绍中的其他外链、视频、第三方评分链接不挂载到页面。

## 完整促销分页样本

同日补采：`deals.json` 为 specials=1 的首页，`deals-page2.json` 为 page=2 的第二页，`deals-action-page2.json` 额外加入 tags=19。均使用 category1=998、infinite=1、cc=cn、l=schinese。前两份采集时 count=20，接口实际返回 25 条；动作第二页显式使用 count=25。第二页响应 start=25，首页 start=0。

重要修正：之前的 start 参数被服务端忽略，旧采集说明仅记录当时请求，不证明分页有效。现在正式请求统一使用 page=N&count=25；本地测试验证第 1、2 页首项不同、类型组合成功与默认顺序保留。
