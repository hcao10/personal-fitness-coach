# 更新日志（滚动）

> 与 [HARDENING_PLAN.zh-CN.md](HARDENING_PLAN.zh-CN.md) 配套：每项工作完成即在此追加条目，新条目在上。

## 2026-08-08

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
