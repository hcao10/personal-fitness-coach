# 生产发布与回滚：Model Hub 教练

2026-10-23，生产入口 `https://fit.chwjh.com`，Worker `cmine-fit`，生产 D1 `cmine-fit-db`。正常 Cmine ID 登录保持不变；未将验收 Worker 或测试登录入口部署到生产。

## 已执行的数据库迁移

首次发布前保存 D1 Time Travel bookmark 和完整 SQL 导出，文件均位于 Git 忽略的 `.wrangler/releases/2026-10-23T12-15-20.451Z/`。随后应用 `0016_coach_runtime.sql` 与 `0017_coach_model_hub.sql`，迁移后确认无待执行项。

两条迁移新增单次训练覆盖、revision、教练轮次、模型调用、Hub 请求和执行审计。不删除已有用户、计划或训练记录。界面完善的后续发布也另存生产基线与恢复点；最终发布记录位于 `.wrangler/releases/2026-10-23T13-00-42.851Z/release.json`。

这些本地目录包含私有数据库快照，不应提交 Git 或上传为公共构建产物。仓库中的验收报告只保留必要的请求与结果证据。

## 模型配置

生产 Worker 持有健身项目独立 `MODEL_HUB_API_KEY`；管理员密钥只在本机运维进程读取，不进入 Worker。独立 App 为 `cmine-fit`，授权任务为 `fitness.coach@1`，模型别名为 `openai-fast`。适配器固定请求 `https://ai.chwjh.com/v1/infer`，没有其他供应商的自动回退。

真实登录浏览器验收共发生三次 Hub 推理：读取训练、生成变更预览、最终回答。确认前无覆盖记录；确认后 revision 从 0 变为 1，只有一条成功执行记录。今日训练从四个动作、30 分钟变为三个动作、预计 19 分钟；周模板与其他训练日的摘要哈希保持一致。Hub 管理用量确认三次成功，费用 1627 micros；供应商 token 数未公开，未当作零统计。

详见 `acceptance/coach-production-2026-10-23.json`。界面后续发布没有重新请求模型。

## 常规回滚

每次发布同时上传一个兼容相同数据库结构的维护版本。该版本保留登录、训练覆盖、动作详情和记录查询，暂停新教练推理与调整确认；拒绝建议仍可执行。通过 `COACH_RUNTIME_PAUSED=true` 实施，不能只关闭前端按钮。

发布脚本实际把该版本部署到生产并验证 `schemaReady=true`、`coachChat=false`，随后才启用正常版本。SQLite/HTTP 集成测试还验证了：维护期间已有预览和训练读取保留，不调用付费模型、不写入调整，恢复后仍可确认原预览。

先预览回滚目标：

```powershell
node scripts/rollback-production.mjs .wrangler/releases/2026-10-23T13-00-42.851Z/release.json --dry-run
```

发生故障时执行：

```powershell
node scripts/rollback-production.mjs .wrangler/releases/2026-10-23T13-00-42.851Z/release.json --execute
```

该操作不会降级或恢复 D1。避免直接退回不认识单次训练覆盖的旧代码，否则页面可能暂时显示模板而隐藏用户已接受的调整。

## 紧急数据库恢复

Time Travel 仅用于数据库损坏或错误数据写入的事故。先停止相关写入，确定要恢复的时间点及期间新增数据的处理方式，再从对应本地发布记录读取 bookmark：

```powershell
npx wrangler d1 time-travel restore DB --bookmark <发布记录中的bookmark> --config wrangler.jsonc
```

数据库恢复会覆盖恢复点之后的数据，不能作为普通代码回滚，也没有为“测试回滚”执行该破坏性操作。完整 SQL 快照作为另一份本地恢复依据保留。D1 保留窗口以账户实际配置为准。

## 发布工具

`release-production.mjs prepare` 保存基线、恢复点、导出并应用迁移；`publish <directory>` 核对生产未被并发改动，上传完整网站与维护版本，验证维护状态，再启用正常版本。配置使用构建生成的 `dist/server/wrangler.json`，包含静态资源和生产绑定。

`verify-client-secrets.mjs` 检查网页构建中是否包含本机模型或管理员凭据。`verify-production-coach.mjs` 只读核对已经由真人登录完成的操作，不创建测试会话、不生成训练、不调用模型、不代替用户确认。
