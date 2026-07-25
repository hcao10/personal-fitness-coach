# FORMA Coach

一套可拆成 **开源轻量版** 与 **商业托管版** 的 AI 健身教练产品基础。

当前仓库已经包含一个可运行的产品 MVP：

- 首次使用健康免责声明与风险确认
- 身高、体重、年龄、性别、目标、经验、器械与每周训练天数引导
- Mifflin–St Jeor 基础代谢估算、TDEE、热量差、目标周期与宏量营养建议
- 减脂、增肌、塑形、手臂线条、力量五类目标计划
- 2–6 天/周训练编排，自动适配徒手、哑铃或完整健身房
- 真实动作缩略图与 GIF 示范
- 中英产品界面，以及 9 种动作内容语言入口
- Cmine ID OIDC + PKCE 登录适配器；Apple、Google、WeChat 适配槽位
- 订阅与“看广告得积分”的交互原型
- 响应式桌面/移动界面与社交分享卡片

> 当前版本的计划由可审计的规则引擎生成，方便开源自托管与安全验证。生产商业版可在同一结构化输出协议后接入 LLM，让模型负责解释、问答和个性化表达，而不绕过热量与安全规则。

## 本地运行

需要 Node.js 22.13 或更高版本。

    npm install
    npm run dev

构建：

    npm run build

## Cmine ID

复制 .env.example 为 .env.local，在 [Cmine ID 开发者中心](https://identity.chwjh.com/developers) 注册 Public OIDC Client，并精确登记回调地址：

    https://你的域名/auth/cmine/callback

然后设置：

    NEXT_PUBLIC_CMINE_CLIENT_ID=你的_client_id

当前开源演示使用 Authorization Code + PKCE，将短期访问令牌放在 sessionStorage，不申请 refresh token。商业版应改为服务端回调、HttpOnly 会话 Cookie、令牌轮换与服务端授权检查。

## 两个版本

| 能力 | FORMA Open | FORMA Pro |
|---|---:|---:|
| 自托管与无账号使用 | ✓ | — |
| 基础指标与一周计划 | ✓ | ✓ |
| 本地 / OpenAI-compatible LLM | 可选 | ✓ |
| Cmine ID 与第三方登录 | 适配器 | ✓ |
| 历史计划、围度、训练记录 | — | ✓ |
| AI 对话 Coach | 基础 | ✓ |
| 订阅、广告积分、权益 | — | ✓ |
| 运营、风控与实验 | — | ✓ |

完整的服务边界、数据模型、API 与盈利设计见 [产品架构](docs/PRODUCT_ARCHITECTURE.zh-CN.md)。

## 安全与免责声明

本项目输出的是一般性健身和营养信息，不构成医疗诊断、治疗、康复或个体化医疗建议。正式运营前请由目标市场的律师、医生/运动医学专家和注册营养专业人士共同复核。

详见 [健康免责声明草案](docs/LEGAL_DISCLAIMER.zh-CN.md)。

## 动作数据

仓库保留了原始 1,324 个动作数据集、图片、GIF 和 9 种语言动作说明。原数据集说明见 [DATASET_README.md](DATASET_README.md)，媒体署名与使用条件见 [NOTICE.md](NOTICE.md)。

代码与数据许可请见 [LICENSE](LICENSE)；动作媒体 © Gym visual，须遵守原媒体条款。
