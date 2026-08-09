# Cmine Fit

Cmine Fit 是一套包含自主轻量版与专业增强版的 AI 健身教练产品。当前仓库包含 Cloudflare Worker API、D1/R2 数据、服务端身份会话、可切换 AI 路由、训练与营养记录、权益、账单和管理控制台，不是纯前端演示。

## 已实现

- Cloudflare D1/R2：用户、会话、训练档案、AI 计划、测量、训练反馈、餐食、图片、权益、用量、账单事件、积分、生成记录与管理审计
- Cmine ID：Confidential Client、Authorization Code + PKCE S256、JWKS 签名验证、令牌撤销联动、哈希会话标识与 HttpOnly Cookie
- 可切换 AI：Cloudflare Workers AI 为默认低成本路由；同时支持 OpenAI Responses API 与任意 OpenAI-compatible/Qwen/Ollama/vLLM 服务
- 成本控制：按能力计量、30 天额度、24 小时同输入复用、日/月预算硬限制、失败重试和一次供应商升级
- 安全规则：BMR、TDEE、热量、宏量营养与周期由确定性代码计算；模型只能从允许的动作库选择，服务端复核器械、训练日、组次、次数和休息范围
- 饮食记录：拍照候选识别、条码扫描、Open Food Facts/USDA 搜索、份量确认和确定性营养计算；不把照片估计伪装成精确热量
- Stripe：Checkout、Customer Portal、签名 Webhook、事件幂等、订阅乱序保护与能力权益；未配置时购买入口隐藏
- 用户中心：今日训练、RPE/疼痛反馈、计划历史、身体趋势、营养汇总、会员与额度、积分流水、数据导出与账号删除
- 管理后台：用户与留存、订阅与退款、AI 成本/延迟/失败切换、饭菜识别质量、模型路由、预算额度、公告和审计
- PWA：移动端导航、Web App Manifest 与可安装能力
- 原生 App：`apps/mobile` 已提供 Expo Router 五模块、Cmine PKCE、SecureStore、SQLite 离线队列、RevenueCat、训练提醒（本地提醒 + 服务端推送：按用户承诺的 cue 时间发送训练提醒与周日晚教练信，尊重安静时段；需配置 Expo 推送与每小时 cron）、HealthKit 与 Health Connect 开发构建；商店能力按供应商配置启用
- 长期 Coach：连续会话、SSE、用户确认操作卡、周度复盘、停滞判断、不可变计划版本、差异确认和回退数据链路
- 契约测试：覆盖无密钥状态、跨站写入、管理员权限、AI 路由、结构化响应、支付签名与营养确认边界

未配置外部凭据时，产品不会伪装成已经调用 AI 或已经登录。完整计划只在 LLM 成功生成并通过服务端校验后展示。

## 本地运行

需要 Node.js 22.13 或更高版本。

    npm install
    npm run dev

验证：

    npm run lint
    npm test

## 生产环境变量

通过部署平台的 secret/env 管理设置，不要写入仓库：

- `SESSION_SECRET`：随机会话签名密钥
- `OPENAI_API_KEY`：OpenAI API 密钥
- `OPENAI_MODEL`：无默认值，必须显式填写 OpenAI 当前目录中的真实模型 ID；留空则 OpenAI 路由不参与
- `OPENAI_REASONING_EFFORT`：默认 `medium`
- `CLOUDFLARE_AI_GATEWAY_URL` / `CLOUDFLARE_AI_GATEWAY_TOKEN`：内部 Workers AI binding 网关；生产默认路由
- `AI_COMPAT_BASE_URL` / `AI_COMPAT_API_KEY`：可选 OpenAI-compatible 或自托管 Qwen/Ollama/vLLM
- `AI_COMPAT_TEXT_MODEL` / `AI_COMPAT_VISION_MODEL`：兼容服务的文本与视觉模型名
- `USDA_API_KEY`：可选；未配置时仍使用 Open Food Facts
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRICE_MONTHLY`、`STRIPE_PRICE_YEARLY`：启用真实 Web 订阅
- `STRIPE_TAX_ENABLED`：是否让 Stripe Checkout 自动计税
- `ADMOB_SSV_KEY_URL`：激励广告服务器签名验证密钥来源
- `CMINE_ISSUER`：默认 `https://identity.chwjh.com`
- `CMINE_CLIENT_ID`：Cmine ID 应用 client_id
- `CMINE_CLIENT_SECRET`：Confidential Client 密钥
- `PUBLIC_ORIGIN`：生产环境固定为 `https://fit.chwjh.com`
- `ADMIN_EMAILS`：逗号分隔的 Cmine Fit 管理员引导名单；仅在 Cmine ID 已验证登录后授予产品管理员角色
- `REWARD_AD_PROVIDER`：未接激励广告时留空，前端不会显示假入口
- `REVENUECAT_WEBHOOK_SECRET` / `REVENUECAT_PROJECT_ID`：移动订阅回调与项目标识
- `REVENUECAT_API_KEY`：**授予权益前必须配置**——RevenueCat webhook 不带签名，服务端会用 REST API 回查订阅状态；未配置时 webhook 只记录事件、不发放任何权益
- `CMINE_MOBILE_CLIENT_IDS`：允许访问 Fit API 的 Cmine ID Public Client ID 列表
- `MAINTENANCE_SECRET`：Sites 与每日清理 Worker 共用的 HMAC Secret；`cmine-fit-automation` Worker 用它调用每日维护与每小时通知任务
- `EXPO_ACCESS_TOKEN`：服务端推送（训练提醒、周教练信、试用到期提醒）所需；未配置时不发送任何服务端推送，`/api/health` 的 `push` 报 `false`，每小时任务会记录 `notifications_skipped` 并照常维护里程碑数据

移动端标识由构建环境注入（`apps/mobile/app.config.js`），不写入仓库：
`EXPO_PUBLIC_CMINE_CLIENT_ID`、`EXPO_PUBLIC_API_ORIGIN`、`EXPO_PUBLIC_CMINE_ISSUER`、
`EXPO_PUBLIC_REVENUECAT_APPLE_KEY`、`EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY`。
未配置 client_id 时 App 会显示未配置，而不是指向生产环境。

Cmine ID 需精确登记每个生产域名的回调：

    https://fit.chwjh.com/api/auth/cmine/callback

生产健康检查为 `/api/health`，返回下列布尔能力位（供应商、模型名与推理档位
不对未登录者暴露，完整信息在管理后台）：

`database`、`storage`、`imageTransform`、`planner`、`vision`、`llm`、`cmine`、
`foodData`、`billing`、`mobileBilling`、`mobileAuth`、`mobileLinks`、`push`、
`rewardAds`、`maintenance`。

其中 `vision`（饭菜识别）要求视觉路由、`R2` 与 `IMAGES` 三者同时具备才报 `true`；
`push` 仅在配置了 `EXPO_ACCESS_TOKEN` 时为 `true`。未接入的能力保持 `false`，
用户端也不会显示对应入口。

## 两种产品路径

| 能力 | Cmine Fit 自主版 | Cmine Fit 专业版 |
|---|---:|---:|
| 自托管 | ✓ | — |
| 基础指标与安全规则 | ✓ | ✓ |
| LLM 训练计划 | 可接本地或兼容模型 | 可切换路由与结构化生成 |
| Cmine ID 与服务端会话 | 可选 | ✓ |
| 档案与计划历史 | 可选 | D1 持久化 |
| 饭菜识别与营养记录 | 可自行接模型 | 视觉候选 + 数据库计算 |
| 用量、权益与账单 | — | ✓ |
| 管理与服务状态 | — | ✓ |

无状态规则已抽离到 [`packages/coach-core`](packages/coach-core)，该包按
Apache-2.0 授权，不依赖账号、数据库或网络。仓库其余部分继续遵循仓库根
许可证，专业版的账号、历史、进度、运营、权益与长期 Coach 能力不属于
`coach-core`。

完整架构见 [产品架构](docs/PRODUCT_ARCHITECTURE.zh-CN.md)，当前模块和发布闸门见 [长期产品模块](docs/LONG_TERM_PRODUCT_MODULES.zh-CN.md)，健康与法律边界见 [免责声明草案](docs/LEGAL_DISCLAIMER.zh-CN.md)。

## 安全边界

本项目输出一般性健身和营养信息，不构成医疗诊断、治疗、康复或个体化医疗建议。正式运营前仍需目标市场的法律、运动医学和营养专业人士复核。
