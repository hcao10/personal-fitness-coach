# Cmine Fit 长期产品模块与交付状态

本文档描述当前模块化单体的真实边界。代码存在不等于外部供应商已经开通；未配置的能力必须在用户端隐藏。

## 产品主流程

1. 匿名用户在首页完成完整 INTAKE。资料只写入当前标签页的 `sessionStorage`。
2. `coach-core` 在浏览器内计算 BMR、TDEE、目标周期、训练结构、首日部分内容和安全提示；这一阶段不调用 AI、不写数据库。
3. 用户通过 Cmine ID 登录。OAuth 返回只携带 `resume=intake`，身体与伤病资料不进入 URL。
4. `/onboarding` 恢复匿名资料，用户确认免责声明并完成或跳过建档。
5. 服务端规则先确定安全边界，AI 路由再生成完整计划；所有模型结果再次经过 Schema 与业务规则验证。
6. 新计划先成为不可变草案，用户确认后才替换当前生效版本。
7. 今日训练、连续 Coach、饮食、进度与我的组成 Web/App 的五个长期模块。

## 单仓库模块

| 模块 | 位置 | 责任 |
|---|---|---|
| Web/PWA | `app` | 首页、建档、今日、Coach、饮食、进度、账户、定价与后台 |
| 原生 App | `apps/mobile` | Expo Router、Cmine PKCE、SQLite 离线队列、本地提醒（服务端推送开发中）、RevenueCat、HealthKit/Health Connect |
| 规则核心 | `packages/coach-core` | BMR/TDEE、训练编排、营养边界、安全规则；无网络与数据库依赖 |
| 领域逻辑 | `packages/domain` | 周度指标、停滞判断、调整边界和 Coach 安全信号 |
| API 契约 | `packages/api-contracts` | Web、App、Worker 共用的建档、Coach、复盘、计划与同步类型 |
| 离线同步 | `packages/sync-core` | 客户端 UUID、幂等键、实体版本和冲突输入校验 |
| 多语言 | `packages/i18n` | Web/App 共用产品导航与资源入口 |
| Worker API | `worker` | 身份、所有权、业务 API、AI 路由、账单、食品数据和运营后台 |
| 定时维护 | `cloudflare/automation` | R2 图片、缓存、会话、OAuth 临时状态清理和复盘到期任务 |

Worker 继续按 `auth`、`onboarding`、`training`、`coach`、`reviews`、`nutrition`、`billing`、`health`、`sync`、`notifications`、`admin` 组织。现阶段不拆微服务；只有 AI Gateway 与 Cron Worker 独立部署。

## 已连线的真实能力

- 匿名 INTAKE 规则预览、登录后恢复、分步建档和首份计划生成。
- Cmine ID Web 会话，以及面向 App Bearer Token 的 JWKS、issuer、audience、过期和撤销验证入口。
- 连续 Coach 会话、SSE 响应、操作建议卡、接受/拒绝和危险反馈拦截。
- 周度复盘、数据充分性判断、三周停滞条件、调整草案、差异确认、计划版本激活与历史追溯。
- Stripe Checkout/Portal/Webhook 与 RevenueCat Webhook 的统一能力权益模型。
- 饭菜图片候选识别、条码/搜索、份量确认、食品数据库计算和每日营养汇总。
- 移动设备注册、离线批量同步、游标增量、健康连接与摘要导入接口。
- 通知偏好、时区、安静时段、管理员指标、功能开关和维护运行记录。
- 每日 HMAC 维护任务，每批最多 100 条，重复调用幂等。

## 需要外部账户或商店配置后才能开放

| 能力 | 必需配置 | 未配置时行为 |
|---|---|---|
| Web 付费 | Stripe 产品/价格、Secret、Webhook | 隐藏购买按钮 |
| iOS/Android 内购 | App Store/Play 商品、RevenueCat 项目与 Webhook | App 不展示商品 |
| 移动登录 | Cmine ID Public Client、HTTPS Universal Link 回调 | App 显示未配置，不包含 Client Secret |
| 推送 | Expo/EAS 项目、APNs/FCM 凭据 | 仅保留本地通知与偏好 |
| HealthKit | Apple Developer 中为 bundle ID 开通 HealthKit | 不请求权限 |
| Health Connect | Play Console 数据安全声明与审核 | 不请求权限 |
| Google/Apple/微信登录 | 在 Cmine ID 中分别配置供应商凭据 | Fit 不显示独立登录入口 |
| 激励广告 | AdMob SSV 审核与公钥 | 用户端完全隐藏 |

## 数据与安全约束

- Coach 不能直接修改计划或建立正式记录；每个建议先成为操作卡。
- 疼痛达到 4/10 或持续加重时不能增加训练强度。
- 周度停滞要求至少三个有效训练周、完成率不低于 70%，且目标指标低于阈值。
- 单周总组数增幅不超过 10%，建议负重增幅不超过 5%。
- 计划版本不可变，同一周期只有一个生效版本，离线训练保留原版本关系。
- 健康数据只保存日级或训练级摘要，不覆盖手工数据、不用于广告。
- 饭菜图片只生成候选；用户确认份量后才由食品数据库计算营养，不宣传单图精确热量。
- Web Token 使用 HttpOnly Cookie；App Token 只存 SecureStore，永不写入 SQLite。
- RevenueCat 与 Stripe 各自是其渠道的订阅事实来源；任一渠道有效都保留 Pro 权益。

## App 开发构建

App 使用原生模块，不能用 Expo Go。开发时：

```bash
cd apps/mobile
npm install
npm run typecheck
npx expo prebuild
npx expo run:ios
# 或 npx expo run:android
```

在创建开发构建前，需要在 `app.json`/EAS 环境填入 Cmine 移动 Public Client ID 与 RevenueCat 公钥。任何服务端 Secret 都不得进入 App 包。

## 发布闸门

Web 发布要求构建、类型检查、Lint、契约测试和向前迁移全部通过。App 上架还必须完成：真实设备离线同步测试、Universal/App Link、购买/退款/恢复、健康数据部分授权与撤销、推送安静时段、隐私清单、账号删除和商店沙盒验收。
