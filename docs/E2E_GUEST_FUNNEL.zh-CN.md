# 核心闭环验收脚本（未登录 · 未配置 LLM）

这份脚本描述本轮验收实际执行过的路径。它的用途有两个：把"已闭环"这句话绑定到一组
可以重跑的具体步骤上；以及在没有浏览器自动化依赖的情况下，说明哪一部分由 CI 覆盖、
哪一部分需要人工执行。

- CI 覆盖：`tests/guest-funnel.test.mjs` 用真实状态机跑完同一条路径（不渲染 DOM）。
- 人工执行：下面的步骤在真实浏览器里跑通。仓库当前没有 Playwright/Puppeteer 依赖，
  加入它会引入一次浏览器下载和一个新的 devDependency，本轮没有做；这是已知的验收缺口。

## 前置状态

`npm run dev` 之后 `GET /api/health` 应当返回：

```
database=true  storage=true  foodData=true
cmine=false    llm=false     schemaReady=false
missingTables=["users","sessions","profiles",...]
```

即：数据库已连接但迁移未执行，账号与模型都没有配置。这正是本轮要保证可用的环境。

若需要完整的账号能力，本地执行：

```bash
npx wrangler d1 migrations apply DB --local
```

## 步骤与预期

| # | 操作 | 预期 |
|---|---|---|
| 1 | 打开 `/` | 首屏只有一个主 CTA「开始制定我的计划」；未配置 Cmine ID 时不显示登录按钮 |
| 2 | 打开 `/onboarding` | 进入本地模式并说明原因；**不出现无限 loading** |
| 3 | 第 1 步选目标与经验 | 出现「这一步改变了什么」：每周组数区间与目标 RIR |
| 4 | 第 2 步填性别/年龄/身高/体重/日常活动 | 出现 BMR、每日热量、蛋白质、建议周期 |
| 5 | 第 3 步选天数/时长/器械/地点 | 出现训练日数、单次时长、动作数 |
| 6 | 第 4 步填限制并勾选安全确认 | 出现被替换的动作数与数据完整度 |
| 7 | 点「生成我的计划」 | 跳转 `/plan`，标签为「安全规则计划」而非 AI，状态为「草案」 |
| 8 | 阅读「为什么这样安排」 | 每条都能与页面上的数字对上；填写的限制被原样引用 |
| 9 | 点开某个动作 | 大图 + GIF 同时加载；分步要领、呼吸、常见错误、停止条件齐全 |
| 10 | 按 → / ← | 在当天动作之间切换 |
| 11 | 按 Esc | 弹层关闭，焦点归还，页面滚动恢复 |
| 12 | 点「接受并开始」 | 状态变为「已生效」，`localStorage.cmine_fit_plan_v1.status === "active"` |
| 13 | 打开 `/today` | 首屏是今天的训练与「开始训练」；**不出现无限 loading** |
| 14 | 点「开始训练」并逐组打勾 | 进入专注模式，组数进度更新，出现组间休息计时 |
| 15 | 点「完成并记录」 | 只问三个问题：整体难度、疼痛、是否完成 |
| 16 | 疼痛拉到 ≥4 | 立刻出现不提高强度的警告 |
| 17 | 提交 | 立刻给出下一步；疼痛 ≥4 时为「恢复」而非任何进阶 |
| 18 | 打开右下角 Coach | 徽标为「规则回答」；动作/计划类问题有实质回答 |
| 19 | 在 Coach 里输入自由提问 | 未配置模型时给出「这个问题需要 AI 教练」并列出不需要模型也能回答的问题；**不出现点了没反应的发送按钮** |
| 20 | 打开 `/coach` | 同样进入规则模式，不跳转到不存在的登录 |

## 视口

桌面与 390×844 两个视口都要跑一遍第 13–17 步。移动端额外检查：

- `document.documentElement.scrollWidth === window.innerWidth`（无横向滚动）；
- 主 CTA 未被底部导航或 Coach 悬浮入口遮挡；
- Coach 悬浮入口位于底部导航之上，两者不重叠。

## 本轮实测结果（2026-08-30）

全部 20 步通过。抽样数据：

- 第 4 步：`Around 1768 kcal at rest, a 2740 kcal daily target, 131 g of protein, over a 12-week cycle.`
- 第 9 步：`0289-SpYC0Kp.jpg` 与 `.gif` 均 `naturalWidth === 180`，5 条数据集步骤。
- 第 17 步：疼痛 6/10 → `Use the recovery version next time, around 90% of the sets, with the load unchanged.`
- 移动端 390×844：`scrollWidth === 390`，主 CTA 324×58 未被遮挡，Coach 入口 710–758px，底部导航 778–844px。
