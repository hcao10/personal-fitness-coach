# Cmine Fit

Cmine Fit 是一套包含自主轻量版与专业增强版的 AI 健身教练产品。当前仓库已经不是纯前端演示：它包含 Cloudflare Worker API、D1 数据库迁移、服务端身份会话，以及通过 OpenAI Responses API 生成并校验训练计划的完整链路。

## 已实现

- Cloudflare D1：用户、会话、训练档案、AI 计划、免责确认与积分账本
- Cmine ID：Authorization Code + PKCE，服务端回调，哈希会话标识与 HttpOnly Cookie
- AI 计划：OpenAI Responses API + Structured Outputs，模型编排一周动作、组次、休息、教练提醒与饮食建议
- 安全规则：BMR、TDEE、热量、宏量营养与周期由确定性代码计算；模型只能从允许的动作库选择，服务端复核器械、训练日、组次、次数和休息范围
- 管理后台：从生产 D1 读取用户、计划、免责确认和有效会话数，并显示外部服务真实配置状态
- 前端：完整资料采集、生成状态、动作指导、AI 计划来源标记与中英文界面
- 契约测试：覆盖无密钥状态、输入校验、LLM 结构化响应、训练周表改写和 D1 数据表

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
- `CMINE_ISSUER`：默认 `https://identity.chwjh.com`
- `CMINE_CLIENT_ID`：Cmine ID 应用 client_id
- `CMINE_CLIENT_SECRET`：仅 Confidential Client 需要

Cmine ID 需精确登记每个生产域名的回调：

    https://你的域名/api/auth/cmine/callback

## 两种产品路径

| 能力 | Cmine Fit 自主版 | Cmine Fit 专业版 |
|---|---:|---:|
| 自托管 | ✓ | — |
| 基础指标与安全规则 | ✓ | ✓ |
| LLM 训练计划 | 可接本地或兼容模型 | OpenAI 结构化生成 |
| Cmine ID 与服务端会话 | 可选 | ✓ |
| 档案与计划历史 | 可选 | D1 持久化 |
| 管理与服务状态 | — | ✓ |

完整架构见 [产品架构](docs/PRODUCT_ARCHITECTURE.zh-CN.md)，健康与法律边界见 [免责声明草案](docs/LEGAL_DISCLAIMER.zh-CN.md)。

## 安全边界

本项目输出一般性健身和营养信息，不构成医疗诊断、治疗、康复或个体化医疗建议。正式运营前仍需目标市场的法律、运动医学和营养专业人士复核。
