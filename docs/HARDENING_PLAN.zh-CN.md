# 上线前硬化与补齐计划

> 建立于 2026-08-08。P0–P4 重建（止血/动作池/自适应引擎/习惯系统/试用定价）已完成；
> 本文覆盖剩余工作。进度同步记录在 [UPDATES.zh-CN.md](UPDATES.zh-CN.md)。

## S1 安全硬化（上线阻塞，第 1 周）

| # | 项目 | 内容 | 状态 |
|---|---|---|---|
| S1-1 | schema 漂移 | `food_import_runs`/`food_portions` 补进 `db/schema.ts`（`entitlements` 经核实原已存在，审计误报）；`drizzle-kit generate` 不再产出破坏性 DDL | ☑ 2026-08-08 |
| S1-2 | 全站限流 | D1 固定窗口限流（`rate_limits` 表 + 0011 迁移，DB 不可用时 fail-open）：auth start、AI 计划、Coach 消息、图片上传、食物/动作搜索、consents、三个 webhook、export；策略集中在 `RATE_RULES` | ☑ 2026-08-08 |
| S1-3 | AI 预算 | `assertAiBudget` 增加 per-user 日限（`ai_user_daily_hard_usd` 默认 $1，admin 可调）；`ai_daily_warning_usd` 越线每日一次记录并写入 `ai_budget_warning_last` | ☑ 2026-08-08 |
| S1-4 | 权限硬化 | admin 只能经 `ADMIN_EMAILS` 显式授予且登录永不降级/覆盖（IdP role 仅记录参考）；export 限流 3 次/日+日志；`DELETE /me` 需输入 DELETE 确认短语 | ☑ 2026-08-08 |
| S1-5 | 请求边界 | 带会话 cookie 的写请求缺失 Origin 即拒绝（Bearer/无凭据客户端豁免）；移动端 token 验证 60s 缓存；USDA key 移入请求头；`/api/health` 不再暴露 providers/model/reasoning | ☑ 2026-08-08 |
| S1-6 | 教练安全门 | 正则快筛 + LLM 轻量分类双层；命中返回安全话术而非静默短路 | ☐（第 2 优先级） |

## S2 仓库卫生（开源/协作前）

- ☐ `dist/`、`.openai/*.tar.gz` 移出 git；fork 残留大文件清理（需评估是否 squash 重建历史）
- ☐ 移动端 `app.json` 真实 client_id 移入 EAS 环境并在 IdP 轮换旧 id
- ☑ wrangler.toml account_id 已移除（2026-08-08，两个边车 worker 已用登录态重新部署）
- ☐ 根 LICENSE 改为专有声明（开源仓库已独立正确授权）
- ☐ Prettier 全量格式化 + `.git-blame-ignore-revs`

## S3 真实环境验收清单

1. ☐ 生产 D1 应用迁移 0008–0010
2. ☐ 配置密钥（hosting 环境）：`EXPO_ACCESS_TOKEN`、`REVENUECAT_API_KEY`、`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*`
3. ☐ Stripe 测试模式全链路：触墙→Checkout→webhook→权益→Portal 取消→降级；确认价格缓存拉到真实 Price
4. ☐ RevenueCat sandbox：购买→REST 回查→权益一致（无 API key 时 webhook 只记录不授权益，属预期）
5. ☐ 真机推送四类验证：cue 时间提醒 / 周日教练信 / 安静时段抑制 / 失效 token 清理
6. ☐ 试用流：新账号 7 天 Pro → 降级 → 复盘锁定态
7. ☐ 隐私说明与免责声明送执业律师审阅（页面当前自标"草案"）

## S4 功能补齐（按用户可感知度）

| # | 项目 | 工作量 | 状态 |
|---|---|---|---|
| F1 | 通知偏好 UI（web 账户页；API 已存在） | 0.5 天 | ☐ |
| F2 | 进步可视化：e1RM 曲线、累计吨位、体重趋势叠加计划版本标记（progress 页） | 2–3 天 | ☐ |
| F3 | 移动端渲染 habit 数据（coach/home 已返回）+ 承诺编辑 | 1 天 | ☐ |
| F4 | 里程碑推送（教练信 newMilestones 接通） | 0.5 天 | ☐ |
| F5 | 试用到期前推送（第 5/6 天"还剩 2 天"） | 0.5 天 | ☐ |
| F6 | 移动端拍照/扫码（或正式从 roadmap 移除承诺） | 3 天 | ☐ |
| F7 | 产品页 i18n 决策：仅中文（删英文选择器）或补全英文 | 决策后 1 周 | ☐ |
| F8 | a11y：模态焦点陷阱、对比度、字号 | 2–3 天 | ☐ |

## Roadmap（指标验证后）

营养智能深化（中文食物库/拍照精度/训练日热量联动）→ 健康数据驱动（睡眠/HRV 进疲劳指数）→
习惯 A/B 实验框架与按用户事件埋点 → 开源仓库发布与动作池同步脚本化。

## 执行约定

- 每完成一项：勾选本文状态 → 在 UPDATES.zh-CN.md 追加条目 → 独立 commit。
- 所有改动过 CI 门禁（lint + typecheck + build + 行为测试）。
