# 健身教练接入 Model Hub

当前状态：接入分支 `codex/fitness-model-hub` 已完成适配与真实云端验收。独立 `cmine-fit` App、`fitness.coach@1` 及专属 key 已配置；真实模型经过 ai.chwjh.com 完成今日训练调整。已发布到生产并经过外部 Cmine ID 真实登录和浏览器确认验收；全量 216 项测试、构建、类型与 lint 检查通过。最终发布、恢复点和维护回滚见 [生产发布说明](PRODUCTION_RELEASE.zh-CN.md)。

证据：[真实闭环及 Hub 用量](acceptance/coach-hub-live-2026-10-23T11-43-07-007Z.json)、[真实 Hub 权限检查](acceptance/coach-hub-policy-2026-10-23.json)。

注册 400 的原因是任务 ID `fitness.coach_step` 含下划线，被当前 Hub 注册器拒绝；Schema、提示词和工作上限均通过实际校验。改用 `fitness.coach` 后成功注册，版本为 1；未修改任何已注册的不可变定义或其他 App 配置。

## 模块与调用链

```text
已验证的健身会话 → 教练运行层 → AI SDK Model Hub 适配器 → ai.chwjh.com/v1/infer
                       ↑                   ↓
                 服务器工具执行 ← 结构化工具请求
                       ↓
              实际训练预览 → 用户确认 → occurrence 原子写入
```

- `packages/integrations/src/model-hub/coach-task.ts`：不可变 `fitness.coach` v1，包含可信指令及有界输入/输出 Schema。使用固定字段和可空参数，不使用 Hub 禁止的组合 Schema。
- `worker/ai/model-hub-client.ts`：固定 HTTPS 目的地、服务端应用密钥、哈希用户标识、禁止重定向、超时和响应大小限制。没有用户可指定的 URL。
- `worker/ai/model-hub-context.ts`：把当前 SDK 消息中的工具结果转换为有界资料，剔除周模板、图片资源和重复动作元数据。历史/知识样本有明确截断标记；当前用户指令和预览不会被悄悄剪短。每一步发送前按 UTF-8 字节检查 8KB 上限。
- `worker/ai/model-hub-model.ts`：实现 SDK 的非流式 provider 协议，将结构化决策转回现有工具调用或最终回答。工具参数和最终回答再次经过宿主校验。Hub 不执行工具、不写训练数据。
- `drizzle/0017_coach_model_hub.sql`：每次实际 Hub 决策的 UUID、输入哈希、任务版本、模型别名、决策种类及结果。先持久化 UUID，再发送；`requestID` 与 `Idempotency-Key` 相同。同一已完成 turn 仍由健身 D1 精确重放，不重复付费。

启用 `MODEL_HUB_API_KEY` 后，教练路由只走 Hub，不会在限流、撤权或超时后自动回退到其他供应商。显式用户重试创建新的 attempt；网络不确定结果不会自动重发。Hub 公共协议没有 token 用量，所以本地用量保持 null、费用保持保守估算，真实用量到 Hub 管理 API 核对。

资料读取、事实 ID 验证、风险规则、训练预览、revision 检查、幂等确认和写回沿用现有业务模块。账号导出会带上 Hub 元数据；删除先请求 Hub 删除，再删除本地账号，外部删除未成功时保留本地账号以便恢复。会话摘要暂不发送到 Hub，因为尚未注册单独摘要任务；旧的未授权摘要调用不会绕道其他任务。

## 开通真实 App 与任务

按接入工作单，管理员密钥保留在维护方文件 `~/.config/anybite/model-hub-admin.key`，脚本只在本机进程内读取；也可由运维进程临时注入 `MODEL_HUB_ADMIN_KEY`。不要把管理员密钥复制到项目 `.dev.vars`、业务 Worker 或聊天。项目 `.dev.vars` 只保存本项目应用 key 和模型别名。

先只读核对当前模型与 App，再指定实际启用的模型别名：

```powershell
npm run hub:provision -- --inspect
$env:MODEL_HUB_COACH_MODEL = '<实际启用别名>'
npm run hub:provision -- --install-worker-secret
```

凭据和模型别名就绪后，也可以直接运行完整流程：

```powershell
npm run hub:acceptance
```

该命令依次执行真实注册/授权、云端 secret 版本上传、临时 D1 迁移、0% 验收版本部署、真实模型闭环和 Hub 管理端用量核对。推理只尝试一次；只有只读版本传播检查会重试。无论成功或失败，都会尝试恢复原部署、删除临时 Hub 用户和数据库，并记录清理结果。检测到他人部署时不会覆盖它。凭据缺失时以退出码 2 明确返回 `HUB_ACCEPTANCE_NOT_RUN`。

该脚本只创建/检查 `cmine-fit` App 和 `fitness.coach` v1，不改 anyBite 的 key、任务或 Harmony Worker。新 App 的初始验收上限：100 次/月、单用户 $0.20/日、App $2/日、12 RPM、同用户并发 1。它们是测试配置，不是已验证商业容量。应用日预算按 Hub 的 16 分片工作，不能把整个 App 日预算当单用户可用余额。

新 App 先以禁用状态创建，任务和密钥准备完成后才启用。已有同名 App 若不允许所选模型，脚本停止而不是覆盖已有策略；既有禁用 App 只有匹配本轮初始化记录时才允许继续开通。相同版本任务修改会由 Hub 拒绝；需要改指令或 Schema 时升级版本。应用密钥一次性返回后保存到 Git 忽略的 `.dev.vars`，再通过 stdin 传给 `wrangler versions secret put MODEL_HUB_API_KEY`，不会写入命令参数或日志。该命令只上传 secret 版本，不切换正常生产流量。keyID 等非敏感信息记录在 `.wrangler/model-hub/provisioning.json`。

可直接查看准备注册的完整定义：

```powershell
npm run hub:provision -- --definition
```

## 真实云端验收

沿用 [远端验收工作流](COACH_REMOTE_ACCEPTANCE.zh-CN.md)，创建全新的独立 D1，本次初始化加上 `--hub`：

```powershell
npx wrangler d1 create cmine-fit-coach-acceptance-<new-suffix>
node scripts/prepare-remote-coach.mjs <new-db-id> cmine-fit-coach-acceptance-<new-suffix> --hub
npx wrangler d1 migrations apply DB --remote --config .wrangler/coach-acceptance/wrangler.json
npx wrangler versions upload --config .wrangler/coach-acceptance/wrangler.json --tag coach-hub-acceptance
```

记录验收前真实生产版本 ID，以 100% 保留原生产版本，验收版本 0%；具体命令见远端工作流。验收入口在 Hub 模式只把专属 Hub key 交给业务模块，不传直连 OpenAI key。独立合成测试账号每次验收建立一次，账号标识在运行中保持不变，不通过换身份重试或绕过额度。

```powershell
$env:COACH_ACCEPTANCE_VERSION = '<本次上传的版本 ID>'
npm run verify:coach:remote -- --models
$env:COACH_ACCEPTANCE_MODEL = '<任务已授权的模型别名>'
npm run verify:coach:remote -- --seed
npm run verify:coach:remote
```

必须实际通过：上下文读取、生成 20 分钟预览、确认两次只执行一次、home 返回真实覆盖、周计划和其他日期不变、原 turn 重放不新增 Hub 请求；报告中的 provider 必须为 `model_hub`，任务版本、模型别名和 UUID 必须可追踪到 Hub。成功报告随后复制到 `docs/acceptance/`，不能以协议测试的记录代替。

成功或失败后都恢复原生产部署，清理隔离账号的 Hub 元数据、临时 D1 和本地验收凭据，保留脱敏报告与独立 App 配置。上线仍需单独的生产迁移和配置发布；验收版本不应分配真实用户流量。

## 本次真实结果与验证边界

- 持久 App ID：`cmine-fit`。唯一任务授权：`fitness.coach@1`，模型别名 `openai-fast`，验收时管理端实际映射为 OpenAI `gpt-5.6-luna`。这记录实际配置，不表示模型排名或永久映射。
- 专属应用 key 保存在 `.dev.vars` 和 Cloudflare `cmine-fit` 的 `MODEL_HUB_API_KEY` Secret 版本；仅有一个活跃的健身应用 key。keyID 及配置元数据在脱敏闭环报告中。管理员 key 只读取维护方文件，没有复制到项目或 Worker。
- 真实 Hub 三次推理：`get_training_context → preview_session_change → answer`。Hub 管理用量：3 次调用、0 次失败、估算 1615 USD micros，即 $0.001615；不是供应商账单承诺。公共协议不返回 token，因此本地字段保持 null。
- 真实远端 D1：预览阶段 revision 不变；确认后今天为 20 分钟、2 个动作、5 组、revision 1。重复确认只写一条审计/执行记录；周模板和其他日期与基线完全一致。重放原 turn 不新增 Hub 调用。
- 正常生产版本始终保留 100% 流量，验收通过带短期凭据的 0% 版本运行。结束后移除验收版本、删除测试用户的 Hub 元数据、删除临时 D1 及本地短期凭据。原生产版本健康检查为 200；没有对生产 D1 应用新增迁移。
- 额外真实权限检查：App key 访问管理 API 返回 403，未授权食材任务返回 403、未授权模型返回 403、任务版本 2 返回 409；管理端确认这些检查产生 0 次付费调用。检查账号已删除。复验命令为 `npm run hub:verify-policy`。

`cmine-fit` 是交付后继续使用的独立 App，其正式 key 和授权保留；临时测试身份与资源已经清理。生产已应用 `0016`/`0017`，并部署完整网站、业务代码及专属 Secret。发布前保存了数据库快照和 Time Travel 恢复点。

## 本地回归与后续

新增 6 项 HTTP/SQLite 集成测试覆盖工具循环、真实数据写回、UUID 与精确重放、拒绝/失败不自动回退、证据伪造拦截、8KB 字节限制、身份和删除/导出，以及 Schema 子集边界。HTTP 对端明确是 scripted protocol fixture，不是语言模型。

另有一项实际 HTTP 运维脚本测试覆盖 App 先禁用再启用、任务授权、密钥不输出、重复执行不签发新 key，以及拒绝使用其他 App 的 key。合计全仓库 214 项通过。

已补充完成生产发布、外部 Cmine ID 真实登录、经过 Hub 的真实浏览器确认与今日结果持久化验收。尚未完成：英文及更多工具组合评测、排队中撤权/共享额度的大规模远端测试、专业训练建议质量评审。这些不由本次单条真实闭环替代。缺凭据时脚本仍明确失败，不会伪造已开通或已验收结果。
