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
| S1-6 | 教练安全门 | 正则快筛 + LLM 结构化 `safety_flag` 双层；模型判定高危时保留回答并追加停止/就医指引，同时剥离所有提升强度的动作提案（策略在 `packages/domain` 可公开审计） | ☑ 2026-08-08 |

## S2 仓库卫生（开源/协作前）

- ☑ 2026-08-08 构建产物核实：`dist/` 与 `.openai/*.tar.gz` **本就未被 git 跟踪**（审计误报），`.gitignore` 已正确覆盖
- ☑ 2026-08-08 fork 残留清理：删除上游演示页 `index.html`（14.2 MB）与 `setup.html`、`DATASET_README.md`；新增 `data/README.md` 说明数据集来源、许可与动作池再生流程。`data/exercises.json` 与 `images/`、`videos/` **保留**——它们是动作池的再生输入
- ☑ 2026-08-08 移动端标识出库：新增 `apps/mobile/app.config.js` 从 `EXPO_PUBLIC_*` 注入；`app.json` 中的真实 client_id 清空。**仍需你在 IdP 侧轮换旧 client id**
- ☑ 2026-08-08 wrangler.toml account_id 移除，两个边车 worker 已用登录态重新部署
- ☑ 2026-08-08 根 LICENSE 改为三段式：产品代码专有、数据集保留上游 MIT 署名、媒体归 Gym visual
- ☐ Prettier 全量格式化 + `.git-blame-ignore-revs`（新代码已按可读风格写，历史超长行待批量处理）
- ☐ git 历史仍含已删除的大文件与旧 client_id；如需公开主仓库须 squash 重建

## S3 真实环境验收清单

1. ☐ 生产 D1 应用迁移 **0008 → 0009 → 0010 → 0011**（顺序不可乱；0008 未跑之前 DB 里的虚构模型路由会短路所有 AI 生成。注意 `drizzle/meta/` 为空，无迁移 runner，须手工按序执行并自行记录）
2. ☐ 确认主 Worker 的四个绑定齐备：`DB`、`R2`、**`IMAGES`**（本轮才在 `vite.config.ts` 中声明，此前从未存在，拍照上传因此从未可用）、`ASSETS`
3. ☐ 配置密钥（hosting 环境）：`SESSION_SECRET`、`CMINE_CLIENT_ID`/`CMINE_CLIENT_SECRET`、`PUBLIC_ORIGIN`、**`ADMIN_EMAILS`（不配则任何账号都永远无法成为管理员）**、`MAINTENANCE_SECRET`（须与 automation worker 逐字节一致）、`CLOUDFLARE_AI_GATEWAY_URL`/`_TOKEN`（token 须与 ai-gateway 的 `INTERNAL_API_TOKEN` 一致）、`EXPO_ACCESS_TOKEN`、`REVENUECAT_API_KEY`、`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*`
4. ☐ 确认 `REVENUECAT_ALLOW_SANDBOX` **未设置**（设为 `"true"` 会让沙盒购买发放真实 Pro 权益）
3. ☐ Stripe 测试模式全链路：触墙→Checkout→webhook→权益→Portal 取消→降级；确认价格缓存拉到真实 Price
4. ☐ RevenueCat sandbox：购买→REST 回查→权益一致（无 API key 时 webhook 只记录不授权益，属预期）
5. ☐ 真机推送四类验证：cue 时间提醒 / 周日教练信 / 安静时段抑制 / 失效 token 清理
6. ☐ 试用流：新账号 7 天 Pro → 降级 → 复盘锁定态
7. ☐ 隐私说明与免责声明送执业律师审阅（页面当前自标"草案"）

## S4 功能补齐（按用户可感知度）

| # | 项目 | 工作量 | 状态 |
|---|---|---|---|
| F1 | 通知偏好 UI（web 账户页；API 已存在） | 0.5 天 | ☑ 2026-08-08 |
| F2 | 进步可视化：周训练量柱状图、主要动作 e1RM 曲线、体重趋势与计划调整次数（`/api/v1/progress/series` + progress 页内联 SVG） | 2–3 天 | ☑ 2026-08-08 |
| F3 | 移动端渲染 habit 数据（coach/home 已返回）+ 承诺编辑 | 1 天 | ☐ |
| F4 | 里程碑推送（教练信 newMilestones 接通） | 0.5 天 | ☑ 2026-08-08 |
| F5 | 试用到期前推送（第 5/6 天"还剩 2 天"） | 0.5 天 | ☑ 2026-08-08 |
| F6 | 移动端拍照/扫码 | 3 天（实测偏低） | ☑ 2026-08-09（待真机验收） |
| F7 | 多语言：基础设施 + 首页 + 语言解析持久化（阶段一） | 决策后 1 周 | ◐ 2026-08-09（见下方进度） |
| F8 | a11y：模态焦点陷阱、控件语义、对比度、字号缩放 | 2–3 天 | ☑ 2026-08-09（遗留一项设计决策，见下） |

## F7 多语言进度

采用方案：不引入 i18n 库（它们只解决 Web 那一份，且都用运行时缺键回退替换掉本项目赖以生存的编译期完整性保证），把 `packages/i18n` 泛化为三个运行时共用的唯一来源。

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 基础设施：`LOCALES` / `SHIPPABLE_LOCALES` 分离、`Localized<T>`、`pick()`、Accept-Language 协商、Intl 复数与日期、按命名空间的目录（zh 为类型模板） | ☑ |
| 2 | 首页全量迁移：112 处内联三元 + 74 键遗留 copy 表 → 统一词表（由可重跑的 codemod 完成） | ☑ |
| 3 | 语言解析与持久化：cookie + `users.locale` + Accept-Language；`<html lang>`/`dir`/元数据服务端解析；语言选择跨页面保持 | ☑ |
| 4 | 服务端错误消息按 code 本地化（客户端翻译，避免 Worker isolate 竞态） | ☑ |
| 5 | 其余产品页（today/coach/nutrition/progress/account/pricing/onboarding/exercises，约 1000 条） | ☐ |
| 6 | 移动端接入同一词表 | ☐ |
| 7 | LLM 提示与 `_zh`/`_en` 结构化 schema 泛化为按 locale | ◐ 2026-08-09（见下方分步） |
| 8 | 按语言的安全分诊 + 上线闸门测试 | ☑ 2026-08-09 |
| 9 | 停止把中文写进数据库（计划变更摘要、复盘解释、knowledge_articles 无 locale 列）、按语言的法律文档 | ☐ |

## 阶段 7：LLM 按 locale（分步）

核心结论一句话：**人审过的内容可以多语言；模型写的内容单语言 + 记录创作语言。**

由此推出的几条硬规则（都有对应的代码或测试保证）：

- 字段名不得编码语言。`summary_zh`/`summary_en` → `summary` + `content_locale`。
- 指令层一律英文，只有「输出语言指令 + 语域说明 + 术语表」按 locale 变化。翻译整份系统提示等于把每条安全规则复制 N 份，改一份就等于只改了一份。测试断言各 locale 的契约段逐字节相同。
- 语言核验以脚本比例为准，模型自报的 `content_locale` 只作交叉验证——模型若无视输出指令，同样会照抄它被告知的 locale。
- **切换语言时绝不机器翻译已存内容。** 对医疗相邻文本做无 schema、无安全复检的再生成，是这套设计里被否得最坚决的一条。
- **不回填历史 `plan_json` 的双语内容。** `users.locale` 可变，数据库没有诚实的办法判断当初哪一份是权威版本。

| 步骤 | 内容 | 状态 |
|---|---|---|
| L7-0 | 类型地基：`Localized` 别名收敛、`toLocale()` 取代 6 处内联三元、`MealCandidate` 三份定义归一到 api-contracts | ☑ 2026-08-09 |
| L7-1 | `worker/prompts/` 模块化（契约/输出指令/语域/术语表）+ locale 贯通 + `PROMPT_VERSION` 指纹测试 | ☑ 2026-08-09 |
| L7-2 | 脚本比例语言检测 + 迁移 0012（`locale`/`content_locale`/`prompt_version`）+ admin 漂移面板（仅观测） | ☑ 2026-08-09 |
| L7-3 | `coach_chat` 单语言化：schema 回显 `content_locale`、`coach_messages.content_locale`（迁移 0013）、证据优先于自述 | ☑ 2026-08-09 |
| L7-4 | `meal_vision` 单语言化：`nameZh`/`nameEn` → `name` + `contentLocale` | ☐ |
| L7-5 | `training_plan` 单语言化：先部署容错读取，同一次部署把缓存键改为 `sha256({profile, locale, promptVersion})` | ☐ |
| L7-6 | 停止把中文写进确定性字符串（计划变更摘要等）；客户端 locale 贯通（含移动端） | ☐ |
| L7-7 | 评测集：每个任务 × 每个 locale 的最小回归样本 | ☐ |

> L7-2 只观测不拦截是刻意的：在知道漂移率之前就重试，等于花钱重跑本来没问题的生成。admin 面板把「未检出」与「偏差」分列统计——文本太短无法判断是未知，不是出错。
>
> **原设计里的「流式先缓冲后嗅探」没有采纳。** 缓冲只有在「语言不对就不发」时才有价值，而现阶段语言处理是只观测不拦截的；那样做等于用真实的首字延迟，换一个根本不会执行的策略。回复完成后照样测量语言，遥测要的数据一条不少。理由写在 `worker/llm.ts` 流式分支的注释里。

## 待你决策的设计问题

**小字号体系**：`app/globals.css` 有 448 处字号声明，其中 **6px×1、7px×14、8px×136、9px×128、10px×71**，共 350 处在 11px 以下。已全部转为 `rem`（默认渲染像素级不变，但用户放大字号终于生效——此前 px 独占意味着浏览器字号设置完全无效，这才是真正的障碍）。**是否抬高这个字号下限属于视觉设计决策，需要你在真机上确认后再改**，代码层面不宜替你决定。

## Roadmap（指标验证后）

营养智能深化（中文食物库/拍照精度/训练日热量联动）→ 健康数据驱动（睡眠/HRV 进疲劳指数）→
习惯 A/B 实验框架与按用户事件埋点 → 开源仓库发布与动作池同步脚本化。

## 执行约定

- 每完成一项：勾选本文状态 → 在 UPDATES.zh-CN.md 追加条目 → 独立 commit。
- 所有改动过 CI 门禁（lint + typecheck + build + 行为测试）。
