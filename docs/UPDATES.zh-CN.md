# 更新日志（滚动）

> 与 [HARDENING_PLAN.zh-CN.md](HARDENING_PLAN.zh-CN.md) 配套：每项工作完成即在此追加条目，新条目在上。

## 2026-08-08

### S1-6 教练安全门双层化 + F1/F2/F4/F5 功能补齐
- **教练安全门第二层**：教练对话的结构化输出新增 `safety_flag`（high_risk / category / detail），由模型识别正则漏掉的改写表达（"my knee is a 7 out of 10"）。命中时**保留回答**（对正在描述疼痛的人静默丢弃回复没有帮助）并追加停止训练与就医指引，同时剥离所有会提升训练强度的动作提案；事件记入 `coach_evaluation_runs`（`safety_passed=0`）。策略函数 `actionsAllowedUnderRisk` 放在 `packages/domain`，与其他安全规则同处一地且可公开审计。
- **测试**：新增 `tests/safety-rules.test.mjs`，其中一条测试**显式记录正则层的已知盲区**（改写表达不触发），把这个限制固化为可见事实而不是假设。
- **F1 通知偏好 UI**：账户页新增通知偏好卡（五类推送开关 + 安静时段）。这套 API 与调度器早已生效，此前缺的只是入口。
- **F4 里程碑推送**：周教练信改为调用 `habitSummary`，因此里程碑对**从未打开过 App 的用户**也会被记录并在信中宣布一次。
- **F5 试用到期提醒**：试用结束前 2 天当地 19:00 推送一次（仅限仍在试用、未订阅、允许 billing 通知的用户）——决策发生在还拥有能力时，而非默默失去之后。
- **F2 进步可视化**：新增 `GET /api/v1/progress/series`（周训练量/组数/训练次数、主要动作 Epley e1RM 时间序列与变化率、体重趋势、计划版本节点）；progress 页用内联 SVG 渲染，无图表库、无外部请求，所有图形都带等价文字描述供读屏使用。数据全部来自实际记录的组数，不做平滑。
- 开源仓库 `cmine-fit-open` 同步 `actionsAllowedUnderRisk`/`INTENSITY_RAISING_ACTIONS` 及对应测试（6/6 通过）。

### S1 安全硬化全部完成（S1-1 至 S1-5）
- **schema 漂移**：`food_portions`/`food_import_runs` 补进 `db/schema.ts`；`entitlements` 核实原已存在（审计误报），`drizzle-kit generate` 不再有破坏性 diff。
- **全站限流**：新增 `worker/modules/rate-limit.ts`（D1 固定窗口，DB 不可用 fail-open，策略集中于 `RATE_RULES`）+ 迁移 0011；覆盖 auth start、AI 计划生成、Coach 消息、图片上传、食物/动作搜索、匿名 consents、三个 webhook、数据导出；每日维护任务自动清理过期计数。
- **AI 预算按用户拆分**：单用户日上限 `ai_user_daily_hard_usd`（默认 $1，admin 可调）——单个账号无法再烧穿全站预算；`ai_daily_warning_usd` 越线每日一次记录告警标记。
- **权限硬化**：产品 admin 只能经 `ADMIN_EMAILS` 显式授予且登录永不降级/覆盖（IdP role 仅作参考记录）；`/api/v1/export` 限流 3 次/日并记日志；`DELETE /me` 必须输入 DELETE 确认短语（前端改为输入框确认）。
- **请求边界**：带会话 cookie 的写请求缺失 Origin 直接拒绝（Bearer/无凭据客户端豁免，防 header 剥离型 CSRF）；移动端 Bearer 验证加 60 秒缓存（消除每请求 JWKS+userinfo+两次 DB 写的放大）；USDA key 从 query string 移入请求头；`/api/health` 不再向未登录者暴露 providers/模型/reasoning 配置。

### Cloudflare 配置（S2 部分完成）
- 部署 `cmine-fit-automation`：每小时通知 cron（`3 * * * *`）与每日维护 cron 双触发生效。
- 部署 `cmine-fit-ai-gateway`：移除虚构模型后的 allowlist 上线。
- 两个 wrangler.toml 的硬编码 `account_id` 移除，本地部署改走 wrangler 登录态；CI 需设 `CLOUDFLARE_ACCOUNT_ID`。
- 已确认密钥在位：automation 的 `MAINTENANCE_SECRET`、ai-gateway 的 `INTERNAL_API_TOKEN`。
- 待人工配置（hosting 环境变量）：`EXPO_ACCESS_TOKEN`、`REVENUECAT_API_KEY`、`STRIPE_*`。
