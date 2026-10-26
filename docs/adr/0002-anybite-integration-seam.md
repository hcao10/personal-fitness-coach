# ADR 0002 · Anybite 集成接缝（契约优先，默认关闭）

- 状态：已采纳（本轮只落地契约与 disabled adapter）
- 日期：2026-08-30
- 相关：`packages/integrations/anybite`、`ADR 0001`

## 背景

相邻仓库 `anybite` 目前只有规划文档，没有可联调的应用或服务。其规划文档明确：

- anyBite 不做卡路里追踪 App，营养只到"菜谱级粗宏量"（`00_product_brief_and_scope.md` §3 Non-goals）；
- `Goal` 实体在 S2-A 的模型与 API 中**不存在**身高、体重、活动水平和训练数据字段，
  这些延后到 V1.x 的独立 `HealthProfile` + Health opt-in（`04_domain_model_and_state.md` §5.2）；
- `WorkoutCompleted` 被登记为 V1.x 的外部事件（`05_api_command_event_contracts.md` Event Catalog）；
- Consent 以 `purpose` 枚举授予，`health_data_use` 是其中一项，撤销要传播到派生投影
  （`04` §Consent、`03_system_architecture.md` §5.2）。

因此本轮任何"已连接"的表述都是不诚实的。

## 决定

### 数据所有权

| 数据 | 事实来源 | 方向 |
|---|---|---|
| 训练计划、身体目标、训练完成 | Cmine Fit | Fit → Anybite |
| 饮食决策、Meal Outcome | Anybite | Anybite → Fit |

Fit 不接收原始食材、菜谱或家庭成员数据；Anybite 不接收身高、体重、伤病描述或 Coach 对话原文。

### 最小化字段

只有两个版本化载荷，定义在 `packages/integrations/anybite/src/contracts.ts`：

- `NutritionGoalSnapshot`：目标枚举、热量区间、蛋白目标、饮食限制、locale、timezone、
  `sourcePlanVersion`。**不含**身高、体重、年龄、性别、伤病。
- `MealOutcomeSummary`：日级热量与蛋白（各自带 confidence）、记录餐数、`sourceRevision`。
  **不含**具体食物、图片、时间戳级明细。

`subjectId` 是 pairwise 假名（`sha256(fitUserId + integrationSalt)` 的前 32 位十六进制），
不是 email、不是 Cmine sub。两侧未来即使共用登录体系也不因此默认互通。

### 冲突策略

- 每条载荷携带 `schemaVersion`、`sourceRevision`、幂等键 `idempotencyKey`；
- 接收方按 `(subjectId, localDate)` 做 last-write-wins，比较 `sourceRevision`（单调递增字符串），
  较旧的修订被丢弃而不是覆盖；
- 传输失败保留 `lastError`，`lastSyncedAt` 只在成功后推进 —— 失败不得表现为"已同步"。

### Consent

独立于登录与其它同意书：`AnybiteConsent { purpose: "nutrition_goal_share" | "meal_outcome_import" }`，
可分别授予与撤销。撤销后 adapter 立即回到 `disconnected` 且不得再发送任何载荷。

### 本轮实现边界

- 端口 `AnybiteIntegrationPort` + 唯一实现 `DisabledAnybiteAdapter`，状态恒为
  `{ status: "unsupported", reason: "no_peer_service" }`；
- UI 只在账户页显示只读的"尚未连接"，没有按钮、没有开关；
- 未来接入真实 adapter 的接入点是 `createAnybiteAdapter(config)`：传入 baseUrl + consent 存储
  即可返回一个 HTTP 实现，端口签名不变。

## 后果

- 好处：契约先于实现冻结，两侧可以独立推进；不会出现"先连上再补隐私"的顺序。
- 代价：本轮没有任何可演示的联通效果。这是刻意的。
