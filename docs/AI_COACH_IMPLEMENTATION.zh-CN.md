# AI 教练前两个切片：实现与验收

更新：2026-10-23。当前状态：已发布到生产。外部 Cmine ID 真实登录、浏览器提问与确认、ai.chwjh.com 真实推理、生产 D1 写入及重新加载验证已完成；兼容新数据库的维护回滚版本也已实际部署验证。Hub 独立 App、任务授权、适配与证据见 [接入记录](MODEL_HUB_COACH_INTEGRATION.zh-CN.md)。

最终本地检查：构建、TypeScript、lint 均通过；加入 Hub 接入后全量测试 214 项通过，包含原 13 项 SQL/HTTP 教练集成测试、6 项 Hub 集成测试和1项运维注册测试。

## 实现边界

- 模型层：`worker/ai/coach-model.ts`，固定版本 AI SDK 7；OpenAI 使用 Responses，兼容服务使用 Chat Completions。保留旧计划生成和图片识别接口，避免同时迁移所有任务。
- 运行层：`worker/coach/runtime.ts`。最多 4 次模型决策和 6 次工具调用，读取真实用户上下文、训练组历史、审核知识，生成结构化回复。模型没有 SQL、任意 HTTP 或业务确认权限。
- 上下文：`worker/coach/context.ts` 与 `session.ts`。服务器解析当前用户、本地日期、有效计划版本和当天 occurrence；客户端场景不能指定其他用户。知识检索复用原模块。
- 预览：`previewChange()` 计算具体的换动作、缩短训练或负荷倍率。动作实例由 occurrence 和序号定位，预览包含真实 before/after；时长明确为估算，不能满足时返回错误。
- 执行：`worker/coach/execute.ts`，确认时复算并检查版本/日期/revision。发生训练记录后拒绝重写，写入 occurrence 覆盖、revision、审计和执行回执在一个 D1/SQLite batch 内完成。周模板不变。
- 对话：`worker/coach/turns.ts` 与 `send.ts`。每轮独立绑定输入、回复和 attempt；完成的请求可精确重放；失败需要显式重试；取消传给上游；仅在校验和落库完成后发送回复正文。
- 前端：上下文通过 Dock → URL → Coach 请求传递；失败重试复用 mutation ID，sessionStorage 支持刷新后恢复；确认按钮有进行中状态；确认结果链接到实际今日训练。Today 读取覆盖后的动作，记录接口也接受换入的动作；负荷倍率会显示在训练播放器里。
- 观测：每次模型 HTTP 调用独立写 `coach_model_attempts`，保留 request ID、用量和费用估算。失败或未知用量显式记录，不把它当零成本。额度消费按数据库实际 affected rows 判定，避免并发抢最后一个额度时重复成功。

会话摘要通过 Worker `waitUntil` 更新，不再阻塞本轮回复。首期仍复用原摘要和知识检索实现；后台索引、记忆候选治理、全局预算预留、专业评测平台和主动跟进不是本次已完成项。

## 数据迁移与配置

新增 `drizzle/0016_coach_runtime.sql`，包括 occurrence 覆盖与 revision、对话轮次、模型调用和单次训练变更审计；Hub 接入另有 `0017_coach_model_hub.sql`。本次在独立远端验收 D1 应用了全部迁移，没有修改生产 D1。正式部署新代码之前仍需确认并应用生产缺失迁移。

本地可按项目现有 Wrangler 流程运行：

```powershell
npx wrangler d1 migrations apply DB --local
```

真实模型验收从环境或被 Git 忽略的 `.dev.vars` 读取凭据，任选一种：

```dotenv
# OpenAI：明确指定实际有权限使用的模型，支持 Responses + tools + structured output
OPENAI_API_KEY=...
OPENAI_MODEL=...

# 或兼容服务：base URL 通常以 /v1 结尾
AI_COMPAT_BASE_URL=...
AI_COMPAT_API_KEY=...
AI_COMPAT_TEXT_MODEL=...
```

Cloudflare 可沿用现有 AI account/token 或 gateway 配置，所选模型仍需支持工具调用和结构化输出。路由配置存在只表示已配置，不代表模型质量或上游健康已经验收。Chat 任务读取显式配置，不在普通聊天时自动查询模型目录选择第一项。

## 三种验证不能混称

### 1. 实际 SQL 与 SDK 协议集成

```powershell
npm run test:coach
```

`tests/helpers/coach-harness.mjs` 应用所有 SQL 迁移，创建隔离合成账户和真实训练记录，通过生产 API handler 的会话认证、限流和 SSE 发送消息。数据库是 Node 内置 SQLite，没有查询正则匹配或预制 DB 返回值。

`coach-wire-server.mjs` 明确是协议测试服务：请求通过本机 HTTP 和实际 AI SDK；Chat Completions / Responses 的工具调用与 tool output 均验证。它不是一个语言模型，也不能证明模型会理解用户。

13 项集成测试覆盖：

1. 读取资料 → 工具循环 → 预览 → 并发确认 → home 读取实际结果。
2. 精确重放，不再次联系供应商或产生重复回复。
3. 模型失败后重试原 turn，不串用前一轮 assistant。
4. 他人/陈旧上下文在模型调用前拒绝。
5. 不存在的事实 ID 或 proposal ID 不输出到客户端。
6. 两份预览并存时，旧 revision 不覆盖已确认变更。
7. 预览后记录真实训练组，禁止重写当天训练。
8. 换动作后通过实际训练记录接口写入换入动作，周模板不变。
9. 取消上游、持久化取消状态并退回产品额度。
10. 历史工具读取 SQL 中真实组数/重量数据。
11. OpenAI Responses 工具 call ID 保持一致，`store=false`。
12. 事务中途故障会整体回滚，再次执行可成功。
13. 并发消费额度及跨账户操作隔离。

其中若干测试同时验证多个相关断言，以上按验收能力归纳；准确测试名称与数量以运行器输出为准。

### 2. 实际浏览器与业务闭环

```powershell
npm run qa:coach:browser
```

打开 `http://127.0.0.1:4317/__fixture/login`。该服务只监听本机，使用构建后的实际 UI、生产 handler 和隔离 SQLite；模型端仍是明确标注的协议服务。不会读写生产 D1。登录捷径只存在于该 QA 脚本，生产代码没有测试登录路由。

本次已用 Playwright 操作真实页面：输入“今天只有20分钟，请调整今天训练”，检查预览，点击确认，再进入 Today。确认后页面显示 2 个动作、5 组、估算 20 分钟；当天 revision 递增，其他 occurrence 和周模板不变。还修正了原成功提示把当天直接更新误说成“计划草稿待确认”的问题。

### 3. 真实模型验收

```powershell
npm run verify:coach:live
```

此命令直接使用配置的真实供应商，使用隔离账户的实际 SQLite 记录作为输入，要求模型读取上下文并生成可确认的20分钟调整，随后确认、读取结果并校验周模板未改变。不会回退到协议服务或规则回复。

缺少凭据时以退出码 2 和 `LIVE_COACH_NOT_RUN` 结束，不显示通过或跳过后成功；通过后输出脱敏报告到 `.wrangler/live-coach-report.json`，包含模型与 request ID、用量及验收结果，不包含密钥。数据样本是合成测试账户，模型调用是真实的，这两者明确区分。

早期本机无凭据时该命令返回 `LIVE_COACH_NOT_RUN`。随后先复用云端已有 OpenAI Secret 完成独立远端验收，再完成 ai.chwjh.com 的独立 App、任务授权和真实模型闭环。当前证据见 [Hub 接入记录](MODEL_HUB_COACH_INTEGRATION.zh-CN.md)；此前缺凭据状态已解除，仍没有模型质量横评胜出结论。

### 4. 已完成：Model Hub + 真实远端 Worker/D1

运行 `npm run hub:acceptance`，通过独立 `cmine-fit` App 和 `fitness.coach@1`，真实完成资料读取、20 分钟预览、用户确认、远端 D1 写回和 home 读取。Hub 管理端确认 3 次成功调用、0 次失败、估算费用 $0.001615。重复确认和原 turn 重放不新增变更或调用；周模板及其他日期不变。[脱敏报告](acceptance/coach-hub-live-2026-10-23T11-43-07-007Z.json) 记录逐步 UUID、任务版本、模型别名和 Hub 侧用量。

此次运行的是生产业务模块组成的专用验收入口，数据是隔离合成账号的真实 D1 记录。验收版本只通过指定版本头和短期凭据访问，正常生产版本保留 100% 流量。结束后已移除验收版本、删除 Hub 测试账号与临时 D1。当时的隔离验收不包含外部 Cmine 登录或 Hub 浏览器组合。后续已在生产真实登录账号完成这条组合链路，见 [生产发布与回滚](PRODUCTION_RELEASE.zh-CN.md) 及 `acceptance/coach-production-2026-10-23.json`。

## 仍需验证与后续

- 补英文、多轮更正和不同工具组合的真实模型评测，比较实际质量、费用与延迟。
- 正式发版仍需生产迁移、代码和 Secret 配置，并验收外部 CMine 登录及经过 Hub 的实际浏览器流程。隔离环境中的真实模型、Worker 和远端 D1 闭环已完成。
- 完成专业教练评审与更广泛的真实模型评测后再开放大范围使用。事实 ID 有效和 schema 合法不等于自然语言结论一定正确。
- 后续再做后台知识索引、结构化记忆治理、全局预算预留和可恢复的跨天跟进。本次保留清楚的模块接口，没有安装多个 agent 编排框架。
