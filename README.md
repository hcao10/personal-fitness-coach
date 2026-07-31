# Cmine Fit

Cmine Fit 是一套包含自主轻量版与专业增强版的 AI 健身教练产品。当前仓库已经不是纯前端演示：它包含 Cloudflare Worker API、D1 数据库迁移、服务端身份会话，以及通过 OpenAI Responses API 生成并校验训练计划的完整链路。

## 已实现

- Cloudflare D1：用户、会话、训练档案、AI 计划、身体测量、训练反馈、免责确认、积分账本、生成记录与管理审计
- Cmine ID：Confidential Client、Authorization Code + PKCE S256、JWKS 签名验证、`iss`/`aud`/`exp`/`sub` 校验、已验证邮箱、哈希会话标识与 HttpOnly Cookie
- AI 计划：OpenAI Responses API + `gpt-5.6` + Structured Outputs，模型编排一周动作、组次、休息、安排理由、教练提醒与饮食建议
- 安全规则：BMR、TDEE、热量、宏量营养与周期由确定性代码计算；模型只能从允许的动作库选择，服务端复核器械、训练日、组次、次数和休息范围
- 用户中心：今日训练、计划历史、身体资料、测量趋势、完成率、连续训练、积分流水、数据导出与账号删除
- 管理后台：用户与计划指标、AI 成功率和错误、用户停用/恢复、服务状态、免责声明与功能开关、操作审计
- PWA：移动端导航、Web App Manifest 与可安装能力
- 契约测试：覆盖无密钥状态、跨站写入、管理员权限、输入校验、LLM 结构化响应、训练周表改写和 D1 数据表

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
- `OPENAI_MODEL`：默认 `gpt-5.6`
- `OPENAI_REASONING_EFFORT`：默认 `medium`
- `CMINE_ISSUER`：默认 `https://identity.chwjh.com`
- `CMINE_CLIENT_ID`：Cmine ID 应用 client_id
- `CMINE_CLIENT_SECRET`：Confidential Client 密钥
- `PUBLIC_ORIGIN`：生产环境固定为 `https://fit.chwjh.com`
- `ADMIN_EMAILS`：逗号分隔的 Cmine Fit 管理员引导名单；仅在 Cmine ID 已验证登录后授予产品管理员角色
- `REWARD_AD_PROVIDER`：未接激励广告时留空，前端不会显示假入口

Cmine ID 需精确登记每个生产域名的回调：

    https://fit.chwjh.com/api/auth/cmine/callback

生产健康检查为 `/api/health`。正式启用前要求 `database`、`llm`、`cmine`
为 `true`；广告尚未接入时 `rewardAds` 保持 `false`。

## 两种产品路径

| 能力 | Cmine Fit 自主版 | Cmine Fit 专业版 |
|---|---:|---:|
| 自托管 | ✓ | — |
| 基础指标与安全规则 | ✓ | ✓ |
| LLM 训练计划 | 可接本地或兼容模型 | OpenAI 结构化生成 |
| Cmine ID 与服务端会话 | 可选 | ✓ |
| 档案与计划历史 | 可选 | D1 持久化 |
| 管理与服务状态 | — | ✓ |

无状态规则已抽离到 [`packages/coach-core`](packages/coach-core)，该包按
Apache-2.0 授权，不依赖账号、数据库或网络。仓库其余部分继续遵循仓库根
许可证，专业版的账号、历史、进度、运营、权益与长期 Coach 能力不属于
`coach-core`。

完整架构见 [产品架构](docs/PRODUCT_ARCHITECTURE.zh-CN.md)，健康与法律边界见 [免责声明草案](docs/LEGAL_DISCLAIMER.zh-CN.md)。

## 安全边界

本项目输出一般性健身和营养信息，不构成医疗诊断、治疗、康复或个体化医疗建议。正式运营前仍需目标市场的法律、运动医学和营养专业人士复核。
