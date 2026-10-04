# Workbench Profile 方案

状态：第一版已实现，2026-10-04。本文件保留产品口径；以下为落地时的工程调整。

- 持久化采用串行、原子替换的版本化 JSON 账本 `bridge/.activity/activity-v1.json`，以 requestId / segmentId 去重，替代按月追加日志；当前本机工作流规模下更便于一致性恢复。
- Focus 共享控制器位于应用层 Context，浏览器历史与 outbox 使用 IndexedDB。恢复检查点为 15 秒，页面隐藏/离开时额外写入一次；后台页签的定时器约每分钟才唤醒一次，因此超过 150 秒未获得检查点才判定为中断并暂停，缺口列为待确认。中断、刷新恢复与手动暂停都只把最后检查点之前的时间写入 Calendar 与账本。补记与撤销已经接入。
- 单个浏览器来源用 Web Locks 选定一个计时页签；其他页签能查看历史，需要回到拥有计时器的页签操作计时。不同浏览器的重叠区间仍由 Bridge 取并集。
- 两类统计随 Profile 一同启用，共用 Tracking since。前端与 Bridge 复用同一组纯聚合函数，前端叠加本地待同步及实时 Focus；API 仍提供聚合与分页的日明细。
- Focus 校验与聚合并入 `bridge/activity-store.mjs` 和 `shared/activity.mjs`，未单独建立 `bridge/focus-activity.mjs`。事件以 segmentId + revision 标识，未另设 eventId / sourceId。`POST /profile/focus/events` 逐项返回 accepted / rejected，被拒记录留在本机且不阻塞 outbox；`GET /profile/identity` 仅返回 bridgeId 供同步使用。
- 计时中的会话跨午夜继续（账本按日拆分）；暂停状态下跨日则清零 Today 计时，与刷新页面一致。
- 当前未自动导入既往 Calendar 历史。供应商响应格式参照 [Claude streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) 与 [Gemini token usage](https://ai.google.dev/api/tokens)。

## 1. 产品定位与第一版范围

新增个人使用概览 Profile，沿用用户提供的 Codex 信息结构：Lifetime tokens、Peak tokens、Longest chat、Current streak、Longest streak，以及 Token activity 的 Daily / Weekly / Cumulative 切换。

第一版同时包含 Focus 专注时间概览，重点回答“今天专注了多久、每天投入多少、是否持续投入”。Profile 使用 Focus / AI activity 两个页签，默认打开 Focus，各自保留图表范围；两类连续天数分别计算。

用户提供的 2.9bn、170.3m、1h 46m、1 day、12 days 仅作为排版与格式参考，不作为 Workbench 的真实数据。本文定义 Workbench 自己的统计口径，不假定与 Codex 的内部算法相同。

第一版统计当前本地 Bridge 的 Workbench AI 工作流与 Focus 计时记录。界面说明“This Mac”，AI 页另注明 Workbench AI workflows，避免让人误认为汇总了所有设备、供应商账号或 Codex 的使用量。同一 Bridge 配对的不同浏览器共用已同步统计；第一版不新增账号系统或跨设备同步。

## 2. 页面与入口

- 右上角现有 `DR` 头像按钮改为打开 Profile；侧栏底部新增 Profile 入口。
- 使用现有模块切换机制，新增 `profile` 模块；Connections 保留现有独立入口。
- 顶部显示本地显示名、首字母头像、当前页签的统计起始日期，以及“This Mac”。显示名首次为空时使用 Researcher，不推断用户身份。
- Focus 页突出 Today focus，搭配累计、日均、单日峰值与两个 Focus streak 指标，下方提供 Focus activity 图表和每日明细。
- AI activity 页中部五项指标：Lifetime tokens 更突出，其余四项并列；窄屏自动换行。
- 两类 activity 均提供 Daily / Weekly / Cumulative 分段控件，时间范围为 30D / 90D / 1Y / All；Focus 默认 Daily + 30D，AI 默认 Daily + 90D。
- 延续当前米白背景、深绿文字与绿色强调色；数字使用等宽字体，图表减少装饰。
- 第一版不加入排行榜、公开分享、成本估算或研究成就体系。

布局草图（占位符不是实际统计）：

```text
Profile
[头像] Researcher                      Edit name
This Mac · Tracking since <date>
[Focus | AI activity]

Focus 页：
<today>             <total>              <average>
Today focus         Total focus          Daily average · Selected range
<daily peak>        <days>               <days>
Best focus day      Current focus streak Longest focus streak

Focus activity
[Daily | Weekly | Cumulative]      [30D | 90D | 1Y | All]
                 每日专注时长图表
日期             专注时长          计时段数        同步状态
<date>           <duration>        <count>         <status>

AI activity 页：

<total>       <daily peak>    <duration>     <days>      <days>
Lifetime      Peak tokens    Longest chat  Current     Longest
tokens        in one day                   streak      streak

Token activity
[Daily | Weekly | Cumulative]      [30D | 90D | 1Y | All]

                 活动图表

<range total> tokens · <active days> active days
Usage coverage: <reported>/<all> requests
```

## 3. AI 五项指标的统计口径

| 指标 | 第一版定义 | 边界处理 |
| --- | --- | --- |
| Lifetime tokens | 从统计启用日起，所有实际模型调用中已确认的 token 总量 | 含有已确认用量的失败/取消调用；缺失用量不当作 0，也不用限额预留值代替 |
| Peak tokens | 固定统计时区内，单个自然日的最大已确认 token 总量 | 副标题写明 In one day，悬停显示日期；数据不完整时注明 Known usage |
| Longest chat | 同一 conversationId 从首个请求开始到最后一次成功回复结束的最大时间跨度 | 至少有一次成功回复；包括轮次间思考时间，明确不是专注时长；继承现有会话过期/重开语义 |
| Current streak | 连续至少完成一次 AI 回复的自然日数量 | 今天尚未使用时允许从昨天往前计算；今天与昨天均无成功回复则为 0；打开页面不算活跃 |
| Longest streak | 历史上最长的连续 AI 活跃自然日数量 | 与 Current streak 使用同一日期和活跃规则 |

统计时区第一次初始化时取 Bridge 所在系统的 IANA 时区并持久化，后续旅行或浏览器时区变化不自动改写历史。第一版只展示该时区；后续若支持修改，需要按新时区重算全部聚合。

用量按请求终止时间归入日期；成功回复按完成时间计入活跃日。跨午夜请求不按 token 流片段拆分。失败/取消但已有用量的调用影响 token 统计，不增加 streak。

短数值采用 k / m / bn，例如 2.9bn；完整整数通过悬停及可访问文本提供。单复数正确显示 1 day / 12 days。

## 4. Token activity

- Daily：每日柱状图；完整采集日没有调用时补零，采集前的日期显示未统计，不能显示成已知零值。
- Weekly：按统计时区、周一开始的自然周求和；范围边界不足一周时标明部分周。
- Cumulative：累计折线/面积图；选择最近 90 天时，保留范围开始前的历史累计基线，不将累计重新归零。
- 图表切换及时间范围只改变图表和图表摘要，顶部五项始终显示全部历史。
- 悬停或键盘聚焦显示日期/周范围、精确 token 数、请求数和用量完整度。
- 日、周或累计桶内存在未知用量时明确提示；未知请求不静默当零。
- 第一版可使用轻量 SVG 实现，配套可访问的数据表，不需要引入大型图表依赖。

## 5. 现有代码依据

- `app/page.tsx`：现有头像按钮打开 Connections，且页面已经使用 ModuleKey 切换模块，适合接入 Profile。
- `app/types.ts`：ModuleKey 尚无 profile；WorkflowResult 只简要声明 total_tokens。
- `bridge/server.mjs`：`runModel`、`streamModel` 返回 usage，`/ai/run` 与 `/ai/stream` 是主要接入点。
- `aiQuota` 使用内存 Map 保存限额数据，Bridge 重启后重置，不适合作为终身统计来源。
- conversations 也只保存在内存中，当前采用 30 分钟不活动过期及数量上限，不能当作持久化历史。
- 现有流式处理直接用最新 usage 替换旧值；Claude 分支只提取 message_delta，实施时需要覆盖起始与后续用量帧的合并，防止输入量遗漏。
- 没有发现可直接恢复完整历史 token 使用量的持久化账本；默认从功能启用日开始记录。
- `app/components/panels/FocusPanel.tsx`：浏览器保存当前 elapsed、startedAt 和待同步 pending；暂停、切换任务、倒计时完成与跨日会生成 FocusCalendarBlock，同步成功后从 pending 移除，没有独立历史账本。
- 当前 Focus 计时逻辑位于 Dashboard 下的面板组件内，进入 Profile 后该组件会卸载。实施时需把计时状态与生命周期提升到应用根部的共享控制器，让 Today 和 Profile 读取同一计时状态。

## 6. 数据设计与调用链

建议新建 `bridge/activity-store.mjs` 与 `bridge/usage-normalizer.mjs`，将统计存储、聚合和供应商适配从 server.mjs 分离。

### 本地存储

默认使用 `bridge/.activity/` 保存版本化本地统计文件，并加入 `.gitignore`。设置文件保存显示名、统计起始时间及固定统计时区；请求记录采用追加事件日志，按月分文件。缓存聚合可重建，原始调用事件作为统计依据。

最小字段：

```text
schemaVersion, eventId, requestId, conversationId
startedAt, finishedAt, status
provider, model, command
inputTokens, outputTokens, totalTokens
cachedInputTokens, reasoningTokens
usageQuality: reported | partial | unknown
```

所有 token 字段允许 null；null 表示未知。缓存输入、推理 token 保留为明细，不能直接再次叠加到已包含它们的总量。供应商归一化规则应在实施时依据各官方 API 文档及响应样本确认。

不记录提示词、回复正文、论文标题、邮件内容、API key 或配对凭据。

### 写入规则

1. 实际发起模型调用前生成 requestId、记录 started；同一会话沿用 conversationId。
2. 在模型适配层合并供应商用量，区分累计快照与增量，不能把每帧累计值相加。
3. 在成功、失败和取消路径统一保存终态及已收到的用量；不能仅在前端收到 done 后记账，也不能只在输出验证成功后记账。
4. 每个真实供应商调用有独立 requestId；重复处理同一终态不得重复计数，用户实际重试产生的新调用则单独统计。
5. 首版排除 Connections 中的模型连接测试，页面注明范围为 Workbench AI workflows。
6. 串行写入队列防止事件交错；终态去重。Bridge 重启时恢复未结请求为 interrupted/unknown；损坏的尾行隔离并提示数据不完整，不能静默重置账本。
7. 统计写入失败不把已经成功的 AI 回复改成失败；显示统计异常，有限重试，并避免对缺失记录宣称完整统计。

继续保留现有限额机制，但不将它与 Profile 的历史账本混用。

### Bridge API

- `GET /profile`：显示名、AI/Focus 各自统计起始时间、时区、两类汇总、覆盖率、采集健康状态。
- `PATCH /profile`：第一版仅修改显示名，限制长度与字符输入。
- `GET /profile/activity?metric=tokens|focus&view=daily|weekly|cumulative&range=30d|90d|1y|all`：返回服务端聚合桶及完整度；Focus 同时返回范围日均值。
- `POST /profile/focus/events`：批量接收计时区间与检查点，按事件 ID 去重、按区间版本更新，返回逐项确认结果。
- `GET /profile/focus/days?from=YYYY-MM-DD&to=YYYY-MM-DD&cursor=...`：返回分页的每日时长、计时段数和记录完整度。

以上接口复用现有准确来源校验和 bearer 配对认证。云端 Worker 不保存个人统计。Profile 独立加载，不依赖 Obsidian vault 能否读取。AI 总量由 Bridge 计算；Focus 已同步历史也由 Bridge 汇总，浏览器额外展示去重后的本地待同步区间和正在进行的临时时长，并明确状态。

打开 Profile 时获取数据，AI 调用结束后失效刷新；跨浏览器在重新进入页面/窗口重新获得焦点时刷新，无需高频轮询。

### Focus 时间统计与记录规则

| 指标 | 定义 |
| --- | --- |
| Today focus | 统计时区内今日已保存的计时区间并集，加上去重后的本地待同步和当前运行区间；临时部分标注 Recording / Pending sync |
| Total focus | 从 Focus 统计启用日起，所有已保存计时区间的并集总时长；与临时今日时长明确区分 |
| Daily average | 所选范围内已保存时长 ÷ 范围内从开始采集至今天的自然日数，包含已知零时长日；今日标注未结束，不包含未来日期或采集前日期 |
| Best focus day | 历史单日已保存专注总时长的最大值，附日期 |
| Current focus streak | 每天已保存专注时间至少 1 分钟的连续天数；今天未达到时从昨天向前计算，今天与昨天都不满足则为 0 |
| Longest focus streak | 历史最长连续满足上述条件的天数；不要求当天使用 AI |

时长以秒存储并累计，最后统一格式化为 2h 35m；非零但不足一分钟显示 <1m，不能对每段先取整。这里的专注时间表示用户主动启动计时器的有效记录时长，不声称测量了实际注意力。

Focus activity 的 Daily 展示每日柱状图，Weekly 展示自然周总时长，Cumulative 展示累计专注时长并保留历史基线。纵轴使用时长，悬停/键盘聚焦显示精确时长及计时段数。每日明细按日期倒序显示，支持查看某日的区间起止时间；第一版不依赖保存任务正文。范围内无记录的已知完整日为 0，采集前或存在未恢复区间的日期标明未知/不完整。日均存在缺失记录时标注“基于已记录时长”。除 Daily average 外，其余卡片不随范围选择变化。

区间处理：

1. 每次开始/恢复计时生成稳定的 segmentId；暂停结束当前区间，恢复新建区间；Reset 仅重置当前显示，不删除已保存历史。
2. 切换目标先结束旧区间，再启动新区间；暂停和休息时间不计入。暂停后无需完成整个任务，该计时段即可进入统计。
3. 跨午夜按固定统计时区把区间拆到各日。例如 23:40–00:20 分别计入两天各 20 分钟；时长用 UTC 时间差计算，日界线按 IANA 时区，避免夏令时错误。
4. 倒计时结束时间限制在“该段开始 + 剩余计划时长”，避免后台定时器延迟执行导致超计时；用户主动继续后才建立新的不限时区间。
5. 切换 Workbench 模块、切到其他应用或页面正常后台运行时继续计时。建议每 30 秒保存恢复检查点；遇到关闭、崩溃、系统休眠或明显的检查点断档，不直接把整段间隔算入。恢复时保留截至最后可信检查点的记录，提示继续计时或确认补记缺口，未经确认的缺口标为不完整。无需把“页面隐藏”本身判定为暂停。
6. 同一浏览器多标签使用单一计时所有者与广播同步，避免各自重复生成区间；Bridge 汇总时对不同浏览器产生的重叠区间也取并集，每一分钟最多计一次。每日计时段数按去重后的 segmentId 统计，跨日区间在涉及的各日均算一个段，不将它称为完成任务数。
7. 确认补记需带固定事件 ID 与用户确认标志，可撤销该补记并重算，不能静默填充未知时长。

### Focus 持久化与 Calendar 解耦

新增 `app/lib/focus-store.ts`（共享计时状态、本地恢复与同步队列）和 `bridge/focus-activity.mjs`（校验、持久化与区间聚合）。Focus 使用 `bridge/.activity/` 下独立事件日志，共享 Profile 时区，但保留自己的 trackingSince。

最小事件字段为 `schemaVersion, eventId, segmentId, revision, sourceId, startedAt, endedAt, checkpointAt, status, quality`。事件不携带任务名称或正文；sourceId 是随机浏览器实例标识。跨区间更新使用递增 revision，服务端拒绝旧版本覆盖新版本，并验证时间范围、未来时间及数据长度。

本地 IndexedDB outbox 先持久化事件，再提交 Bridge；仅在 Bridge 确认写入后删除对应待同步事件。当前配对的 Bridge 实例使用稳定的非敏感 ID 标识，同步队列绑定该 ID，避免切换到其他 Bridge 后误合并。Calendar 另有独立确认状态，两条同步链路不能互相清除队列。

桥接断开时计时器继续工作、区间保存在当前浏览器，Profile 展示“待同步”；恢复连接后幂等补传。未配对时的记录保留为本地记录，首次配对时提示归入当前 Mac。Calendar 不可用或未授权也必须正常累计 Focus。同步完成后以 Bridge 返回版本替换本地覆盖层，避免一次时长在今日卡片中算两遍。

已有 FocusCalendarBlock 的稳定 id 可用作迁移去重依据，但历史 localStorage 的 elapsed 可能在切换目标时被清零，不能代表整日总量。第一版不自动从 Calendar 的标题反推历史时长；有效的待同步区间可迁移，已在 Calendar 中的旧记录需后续单独设计导入和去重。迁移前记录与新功能启用后的完整统计覆盖期必须分别标记。

## 7. 状态与历史处理

- 新用户：提示 Start your first AI workflow；已知没有调用时显示 0 tokens、0 days，Longest chat 显示 —。
- 历史用户：显示 Tracking since <date>，不通过文字长度、现有笔记或限额估算历史 token。
- 有调用但没有可靠 usage：token 指标显示 — / 已确认部分及覆盖率，不伪装为完整 0。
- 未配对或 Bridge 离线：展示连接入口；本地可用的旧画面若继续显示，必须标注上次更新时间。
- 统计存储异常：显示可重试错误及数据不完整状态，不能用初始化零值覆盖旧统计。
- Focus 新用户：Today/Total 为 0，Best day 为 —，提供 Start focus 入口；没有 AI 使用记录不影响 Focus 页面。
- Focus 正在运行：Profile 今日卡片实时变化，Today 与 Profile 共用状态；待同步记录、检查点断档和历史确认值区分显示。

后续若确有历史供应商导出数据，再单独设计校验、去重与导入来源标记，不纳入首版。

## 8. 实施顺序与验收

**阶段一：统计基础。** 实现跨供应商用量归一化、请求事件账本、终态去重和重启恢复，接入 run/stream 的成功及异常路径；同时提取共享 Focus 计时控制器，完成计时区间账本、浏览器 outbox 与 Calendar 同步解耦。

**阶段二：聚合 API。** 完成时区分桶、AI 汇总与 streak、Focus 区间并集与跨日分割、Focus 汇总与独立 streak，以及两类 Daily/Weekly/Cumulative 聚合和每日 Focus 明细。

**阶段三：Profile 界面。** 新增 `ProfileModule.tsx`、入口、类型、客户端读取与样式；实现 Focus / AI activity 页签、响应式指标卡、图表、每日明细和各类空/异常状态。

**关键验收：**

- 固定供应商响应样本验证流式与非流式 token 归一化，缓存和推理量不重复累计。
- 重复终态不重复计数，实际重试独立计数；取消及失败时保留已知用量。
- Bridge 重启后累计数据不丢失，未结请求不变成成功请求。
- 固定时钟测试今天未使用、昨天有使用、断签、跨年、夏令时和跨午夜请求。
- Daily 与 Weekly 对相同范围求和一致；Cumulative 保留历史基线；Peak 等于历史每日最大值。
- 同一 Bridge 的两个浏览器读取一致，图表筛选不改变 Lifetime 指标。
- Bridge 离线、vault 不可用、缺失 usage、写入异常有准确界面状态。
- Focus 暂停/恢复、切换任务与 Reset 不丢失历史也不重复累计；跨午夜按实际秒数分配到各日。
- 多标签、不同浏览器的重叠区间只计一次；outbox 重试与重复 Calendar 回执不会增加时长。
- Calendar 未授权和 Bridge 离线仍可本地计时，补传后统计一致；Bridge 绑定变化不会误同步记录。
- 从 Today 切到 Profile 后计时继续，回到 Today 后状态一致；倒计时回调延迟不会超额累计。
- 关闭/崩溃/休眠恢复不自动累计未知间隔；检查点恢复、确认补记及撤销可重算。
- Focus 日均包含已知零值日、排除采集前和未来日期，Focus streak 独立于 AI streak。
- 完成实现后运行仓库 lint 与 npm test，并验证桌面、窄屏和键盘图表操作。

## 9. 第二版候选

在基础统计稳定之后，可增加模型/工作流分布、年度 Focus 活动热力图、可选每日专注目标与达标率。阅读完成数、日志天数可作为后续 Research activity 指标，使用专门的持久化事件口径。Focus 时间统计已纳入第一版。
