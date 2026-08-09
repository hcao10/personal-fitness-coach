# 更新日志（滚动）

> 与 [HARDENING_PLAN.zh-CN.md](HARDENING_PLAN.zh-CN.md) 配套：每项工作完成即在此追加条目，新条目在上。

## 2026-08-09

### F7 多语言阶段一：基础设施、首页迁移、语言真正可达

**一处更正**：此前我说「9 种语言是假的」并不准确。逐条计数核实后：`data/exercises.json` 确实含 **en/it/tr/es/ru/zh/hi/pl/ko 九种语言**，1324 条记录每条都有全部 9 种、覆盖率 100%、每种语言 7,710 个逐步对齐的步骤，且**没有一条是复制英文充数**。假的是**界面**——选择器提供 9 项而其中 7 项选了毫无变化。删掉那个选择器是对的，但当时把数据集也一并说成假的，是错的。这个平行语料是真实资产，也显著降低了后续加语言的成本。

**更大的发现**：英文其实也从未真正可用。`users.locale` 建号时写死 `'zh'` 且全仓库无一处更新，21 个界面里只有首页是语言感知的，而它的语言选择是组件本地 state，翻页即丢。所以 100% 的用户拿到中文 LLM 回复、中文推送、中文教练文案——**选择器一直是个摆设**。

- **基础设施**：`packages/i18n` 成为 Web、Worker、Expo 三个运行时共用的唯一来源。不引入 i18n 库——它们只解决 Web 那一份，且都会用运行时缺键回退替换掉本项目赖以生存的编译期完整性保证。`LOCALES`（能编译）与 `SHIPPABLE_LOCALES`（可展示）分离，语言选择器只读后者；中文目录是类型模板，其他语言 `satisfies Messages`，缺键多键都无法编译。
- **首页全量迁移**：112 处内联三元 + 74 键遗留 copy 表并入统一词表。两次迁移都由**可重跑、已入库的 codemod** 完成而非手工搬运——转写 186 条双语字符串正是引入静默错误的典型场景。codemod 正确跳过了唯一一处 BCP-47 语言标签（那是数据不是文案），其碰撞检测还抓出一个真实冲突：导航链接和段落标题都想叫 `nutrition`。
- **语言真正可达**：cookie + `users.locale` + Accept-Language 三级解析，服务端渲染时即确定，因此 `<html lang>`、`dir` 与页面元数据从第一个字节就正确（客户端纠正会让读屏在首屏念错语言）。新增 `PUT /api/v1/me/locale` 写入 `users.locale`——这是让 LLM 回复、推送和周教练信跟随用户选择的前提，它们都在没有浏览器的环境里运行。
- **服务端错误本地化**：`errorJson` 的第一个参数一直是稳定 code，所以本地化只是一次已存在键的查表。**翻译放在客户端**：Worker isolate 服务并发请求，任何存在服务端的「当前请求语言」都是竞态；这一点在实现中途发现并改正。
- **测试**：`tests/i18n.test.mjs` 覆盖类型表达不了的部分——键集一致、无空值、占位符集跨语言一致、非中文目录不是中文的原样复制、中文目录里没有漏译的英文句子。

### F6 移动端拍照识别与条码扫描

- **先修了一个会让整个功能无法工作的传输层缺陷**：`apps/mobile/src/api.ts` 在有 body 时无条件设置 `content-type: application/json`，这会破坏 multipart 边界——在此之前任何文件上传都发不出去。现在 `FormData` 保留自己的 content-type。
- **新增 `apps/mobile/src/meals.ts`**：上传前本地压缩（1600px / JPEG / q0.75）。这不是优化而是必需——iOS 默认返回 HEIC，既过不了服务端的 MIME 检查，也过不了转换后 2MB 的上限；在客户端解决，用户就不会等半天才收到失败。
- **拍照流程**：拍照或从相册选 → 上传 → 识别 → **候选确认屏** → 记录。确认屏是这个功能的诚实性边界，一步都不能省：显示每个候选的置信度与不确定性说明，克数输入框预填估算中点但**必须由用户确认**，没有匹配到食物库条目的候选会明确告知「无法计算热量」而不是猜一个数。这与网页版共用同一批端点，服务端零改动。
- **条码扫描**：`expo-camera` 内置扫码（EAN/UPC/Code128），用 ref 锁阻止 RN 相机对同一条码的连续重复触发；另提供手动输入条码的降级路径。
- **权限**：iOS/Android 相机与相册权限文案写明具体用途（Apple 会专门审查这一点），并且**拒绝后不走死路**——给出前往系统设置的入口，同时提示可改用扫码或搜索。
- **额度前置可见**：进入拍照前显示本周期剩余识别次数，额度用尽时直接说明可用积分兑换或升级，而不是让用户拍完才碰壁。
- **删除了那句「拍照与扫码请使用网页版（App 版开发中）」**——承诺兑现了才删。

### F8 无障碍

- **模态焦点管理**：新增可复用的 `app/lib/use-dialog.ts`——打开时焦点进入对话框、Tab 在内部循环、Escape 关闭、关闭后焦点回到触发元素。此前五个模态只有 `aria-modal` 属性，而它本身不做任何这些事：键盘用户按 Tab 会静默走到背后的页面里。已接入首页三个模态（安全同意、登录、广告）、动作目录详情与今日动作媒体。安全同意模态传 `null` 作为关闭回调——它必须被回答而不是被绕过，因此 Escape 不生效，但焦点仍被限制在内。
- **控件语义**：单选式按钮组（训练路径、性别、目标）此前只用 `class="active"` 表达选中，对读屏完全不可见，现改为 `role="radiogroup"` + `role="radio"` + `aria-checked`；日程 `role="tablist"` 补上对应的 `tabpanel`、`aria-controls` 与路线图式 `tabIndex`（此前 tab 不控制任何东西，关系是断的）；7 个滑块的数值从可访问名中移出并改用 `aria-valuetext`（此前读屏把「精力 3/5」整体当作标签朗读）；装饰性字形加 `aria-hidden`。
- **对比度**：逐个按元素**实际所在背景**测算而非套用估计值，修正 5 处未达 WCAG AA 4.5:1 的muted 文本（最差的 `.week-strip div` 仅 3.27:1），沿各自色相取最小达标值（均升至 4.54:1）。顺带纠正一处审计误报：`.preview-header` 的 `#a2a59e` 在深色底上实测 7.22:1，本来就合格，未改动。
- **字号可缩放**：`app/globals.css` 的 448 处字号全部由 px 转为 rem。默认 16px 根字号下渲染像素级不变，但**用户放大字号终于生效**——此前整份样式表只用 px，意味着浏览器字号设置被完全忽略，这才是真正的无障碍失败。转换由 `scripts/normalize-css-a11y.mjs` 完成，可重跑可审计。
- **移交给你的设计决策**：11px 以下的字号共 350 处（含 6px×1、7px×14、8px×136）。是否抬高这个下限属于视觉设计判断，需要你在真机上确认，代码层面不宜替你决定；已记入 HARDENING_PLAN。

## 2026-08-08

### 配置审计发现的 5 个缺陷修复（含对抗式复核后的二次修正）

先修了 5 个缺陷，然后派独立检查者逐条尝试推翻"已修复"。**5 条全部被推翻**，以下是复核后的最终状态：

- **AI 预算对饭菜识别不再是瞎的，但真正的洞是别处**。原修复只在整条调用成功时记账；复核指出 `/api/v1/meals/analyze` 是唯一没有限流的 AI 端点，且失败时退还配额——一张必然识别失败的照片可以无限重试，既真实计费又永远不累计预算。已补：该端点加限流（12 次/10 分钟）；成本记录移到 `searchFoods` **之前**（食物查询抛错会连带丢掉已计费的成本）；`estimatedCost` 在供应商不返回 token 用量时给出非零下限（此前注释宣称的"保守高估"对这种情况恰恰失效）；失败路径**不再**写 `generation_runs`——预算拦截与无可用路由从未接触供应商，把它们记成 AI 失败会让管理台的成功率在预算防线正常工作时反而下跌。
- **推送门禁保留，但里程碑持久化不再是投递的副作用**。原修复在推送未配置时提前返回，顺带停掉了周教练信里的 `habitSummary` 调用——而那正是 F4 用来为"从不打开 App 的用户"记录里程碑的路径。现在习惯与里程碑照常处理，只有发送被跳过，且消息不会丢（未标记已发，配好 token 后首次运行即补发）。automation worker 现在会打日志，永久跳过的 cron 不再看起来一切正常。
- **`IMAGES` 绑定在整个仓库里根本不存在**——这是最严重的一条。`.openai/hosting.json`、`vite.config.ts` 与生成的 `dist/server/wrangler.json` 都没有声明它，意味着**饭菜拍照功能在任何能构建出的环境里都从未工作过**；我加的守卫只是把误导性的 400 换成了诚实的 503。已在 `vite.config.ts` 真正声明该绑定，并让 `/api/health` 的 `vision` 要求视觉路由 + `R2` + `IMAGES` 三者齐备，另加 `imageTransform` 位与管理台对应模块行。
- **预算耗尽的 429 覆盖第三个入口并可区分**。教练对话 SSE 此前把"今日额度用尽"报成可重试的临时错误，用户点重试还会产生无回复的孤儿消息；现已按不可重试处理。两处预算 429 补上 `retry-after`（按 UTC 日切计算），与限流 429 的分钟级含义区分开；文案也从"请明天再试"改为如实说明按 UTC 日切重置。
- **`vision` 标志的注释被更正**：它此前声称是"UI 会显示一个必然失败的拍照入口"，但实际读取该字段的只有管理台。同时注明该函数看不到 admin 配置的 `ai_routes`，因此手工添加 OpenAI 视觉路由时会低报。
- **消除新引入的循环依赖**：`recordGenerationRun` 移出 `db.ts`（`db.ts` 本就 import `nutrition.ts`）到独立的 `worker/telemetry.ts`。
- **README 的 `/api/health` 字段列表这次列全了**（15 个能力位）——同一处文档在一天内第二次落后于代码，这次连同新增的 `push` 与 `imageTransform` 一并写清。

### F3 移动端习惯功能 + S2 仓库卫生
- **F3**：移动端进度页新增习惯卡（连续周数、最长纪录、累计训练、最新里程碑，并复述"缩短版同样算数"）；账户页新增训练承诺编辑（时间+地点），保存后本地提醒与服务端推送用的是同一个时间；复盘卡支持免费档锁定态展示。
- **移动端 a11y**：组记录的三个输入框补上 `accessibilityLabel`（此前读屏对每一组都只念"kg"，完全无法区分）。
- **S2 核实与清理**：
  - `dist/` 与 `.openai/*.tar.gz` 经核实**本就未被 git 跟踪**（审计误报），`.gitignore` 覆盖正确。
  - 删除上游演示页 `index.html`（14.2 MB）、`setup.html`、`DATASET_README.md`——它们是数据集的独立演示应用，与产品无关；新增 `data/README.md` 记录数据集来源、许可与动作池再生流程。`data/exercises.json`、`images/`、`videos/` 保留，它们是动作池的再生输入。
  - 移动端标识出库：新增 `app.config.js` 从 `EXPO_PUBLIC_*` 注入，`app.json` 中的真实 client_id 清空；未配置时 App 显示"未配置"而不是静默指向生产。**旧 client id 仍需你在 IdP 侧轮换。**
  - 根 LICENSE 重写为三段式：产品代码专有、数据集保留上游 MIT 全文与署名、媒体归 Gym visual 并指向 NOTICE.md。此前根 LICENSE 是上游作者的 MIT，与实际权属不符。
  - README 补上 `REVENUECAT_API_KEY`（不配则不发权益）与 `EXPO_ACCESS_TOKEN`（不配则不发推送）的说明，并订正 `/api/health` 的字段描述。
- **仍未处理**：git 历史仍含已删除的大文件与旧 client_id，公开主仓库前须 squash 重建；历史超长行的批量格式化待做。

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
