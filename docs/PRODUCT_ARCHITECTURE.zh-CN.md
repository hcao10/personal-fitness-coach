# FORMA Coach 产品与技术架构

## 1. 产品原则

FORMA 不让大模型直接“自由发挥”训练和热量建议。推荐链路是：

1. 结构化问卷收集身体数据、目标、经验、器械、时间、伤病与偏好。
2. 确定性规则层计算 BMR、TDEE、热量边界、周训练量与动作禁忌。
3. 动作检索层只从经过审核的动作库中选动作。
4. LLM 负责追问、解释、替换同类动作和把结构化计划写成自然语言。
5. 输出经过 JSON Schema、数值边界、安全规则和敏感人群规则二次校验。

因此，模型不可绕过热量下限、伤病限制、训练量上限或紧急停止提示。

## 2. 版本边界

### FORMA Open

面向个人、开发者和小团队，目标是五分钟内完成部署。

- 匿名使用；个人资料默认只保留在当前设备
- 可审计的 BMR/TDEE/宏量营养计算
- 2–6 天一周训练计划
- 1,324 个动作与 9 种语言动作说明
- 本地规则引擎默认可用
- 可选 OpenAI-compatible 接口，支持本地小模型或自选模型服务
- 不包含官方账号、支付、广告、权益、运营后台

### FORMA Pro

面向商业运营，由官方托管。

- Cmine ID 主登录，后续可接 Apple、Google、微信
- 用户画像、计划版本、训练记录、围度与进度长期保存
- 对话 Coach、动态周计划、动作替换、训练后反馈
- 订阅、积分、广告奖励、权益和限额
- 风险分层、内容审核、提示词/模型版本追踪
- 多语言运营内容、A/B 实验、客服与审计

开源版与商业版共享无状态的 coach-core；账号、数据、付费和运营能力不放入开源核心。

## 3. 目标工程结构

    apps/
      open-web/             匿名、自托管产品
      pro-web/              商业用户端
      admin/                运营与安全审核
    services/
      coach-api/            问卷、计划、记录、对话
      billing-api/          订阅、权益、支付回调
      rewards-api/          广告验证与积分账本
    packages/
      coach-core/           指标、训练量、周期、动作选择规则
      exercise-catalog/     动作数据、翻译、媒体与检索
      auth-client/          Cmine ID 与其他 OIDC 适配器
      contracts/            JSON Schema 与 API 类型

当前仓库先以单应用验证产品交互；拆包时保持 coach-core 无网络、无数据库依赖。

## 4. 核心数据模型

- users：Cmine sub、语言、时区、状态
- profiles：身高、体重、性别、出生年、活动量、器械、伤病、隐私同意版本
- goals：目标类型、目标体重/围度、开始日期、建议周期、状态
- plans：输入快照、规则版本、模型版本、计划 JSON、风险等级
- workout_sessions：计划日、完成状态、RPE、疼痛反馈、训练时长
- measurements：体重、围度、体脂（可选）、记录时间
- subscriptions：产品、套餐、状态、支付渠道、当前周期
- point_ledger：不可变积分流水、来源、幂等键、余额快照
- ad_rewards：广告网络、展示 ID、服务端验证状态、奖励流水 ID
- consents：免责声明、隐私政策、营销授权的版本与时间

身体与健康相关字段应按敏感数据处理：最小化采集、分级权限、加密、导出与删除能力必须从第一天设计。

## 5. API 轮廓

    GET    /v1/auth/providers
    GET    /v1/me
    PUT    /v1/me/profile
    POST   /v1/plans/preview
    POST   /v1/plans
    GET    /v1/plans/:id
    POST   /v1/plans/:id/adapt
    POST   /v1/workouts/:id/complete
    POST   /v1/workouts/:id/feedback
    GET    /v1/rewards/balance
    POST   /v1/rewards/ads/claim
    POST   /v1/billing/checkout
    POST   /v1/webhooks/ads/:network
    POST   /v1/webhooks/billing/:provider

plans/preview 可匿名调用并限速；保存、积分、订阅与历史数据必须登录。

## 6. Cmine ID 接入

已按 Harmony Home 的规范预留：

- Issuer：https://identity.chwjh.com
- Authorization Code + PKCE S256
- Scope：openid profile email
- 回调：/auth/cmine/callback
- 使用随机 state 防止 CSRF

当前开源前端适配器适用于 Public Client 演示。商业版应使用服务端回调：

1. 服务端生成 verifier、challenge、state，并把短期状态放入 HttpOnly Cookie。
2. 回调验证 state 后在服务端交换 token。
3. 用 JWKS 校验签名、iss、aud、exp；敏感接口可做撤销检查。
4. 创建自有短期会话 Cookie；刷新令牌只在服务端加密保存并轮换。
5. 业务授权只信任服务端会话，不信任浏览器传入的用户 ID 或套餐。

其他身份平台通过同一个 AuthProvider 接口加入，不把供应商逻辑散落到业务页面。

## 7. 订阅与广告积分

### 订阅

权益服务只返回能力，例如 plan.generate.monthly、coach.chat.daily、history.export，业务代码不直接判断套餐名。支付回调必须验签、幂等并可重放。

### 广告积分

浏览器“看完了”不是发积分依据。推荐流程：

1. 客户端向服务端申请一次广告展示 nonce。
2. 广告 SDK 播放激励广告。
3. 广告网络向服务端发送签名回调。
4. 服务端验证签名、时间、用户、展示 ID 和奖励类型。
5. 以 network + impression_id 作为幂等键写入不可变积分账本。
6. 余额由账本求和或经校验的余额快照得到。

积分兑换需要每日上限、设备/账号风控、退款/撤销流水和人工审计，不直接修改一个 points 数字。

## 8. 安全规则

- 未满 16 岁默认不生成热量缺口；未成年人策略按运营地区复核
- 孕产期、进食障碍、严重慢病、胸痛/晕厥、急性损伤转人工/医疗建议
- 不建议极端热量缺口、快速减重、脱水或药物方案
- 每周减重速度默认不超过体重的约 0.5%–1%，并受最低热量边界限制
- 新手从较低周组数开始，每次只增加重量、次数或组数中的一个变量
- 疼痛反馈触发动作停止与替代，不用“坚持一下”覆盖
- 保存输入快照、规则版本、模型版本和最终输出，支持复盘与召回

## 9. 推荐里程碑

1. MVP：当前规则计划、免责声明、动作动画、双语 UI、Cmine 适配器。
2. 账号版：服务端 Cmine 会话、用户画像、计划保存、训练完成记录。
3. Coach 版：结构化 LLM 输出、RAG 动作库、周复盘与自动调节。
4. 商业版：订阅权益、广告积分账本、风控、运营后台。
5. 专业版：教练协作、可穿戴设备、营养记录与医疗/法律分地区审核。
