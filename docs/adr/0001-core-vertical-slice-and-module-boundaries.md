# ADR 0001 · 核心纵切片与模块边界

- 状态：已采纳
- 日期：2026-08-30
- 影响范围：`app/`、`worker/`、`packages/`

## 背景

产品此前把营销页、建档表单、计划预览、登录、同意弹窗、训练完成和广告逻辑全部放在
`app/coach-app.tsx`（447 行 / 41 KB，二十余个本地状态），把 102 个路径判断放在
`worker/api.ts`（1383 行 / 90 KB），把全部样式放在 `app/globals.css`（122 KB）。
后果不是"文件太大"，而是三条具体的用户失败：

1. 未配置 Cmine ID 时 `/onboarding`、`/today`、`/coach` 永久停在 loading 或显示无效控件；
2. 首页与 `/onboarding` 各自维护一份资料草稿，用户被要求填两遍；
3. 计划生成后只在营销页右栏展开一部分，没有"这是我的计划"这一屏。

## 决定

### 1. 核心纵切片优先于目录整理

只重构一条路径：`输入 → 计划 → 动作 → 训练 → 反馈 → 下一步`。
先抽出 API client、共享契约、状态机和可复用 UI，再迁移页面；不为对齐目录结构而搬运
与该路径无关的代码（后台、计费、广告、营养识别、知识库保持原位）。

### 2. 模块边界

| 层 | 位置 | 允许依赖 |
|---|---|---|
| 纯领域与状态机 | `packages/product-state` | `packages/coach-core`、`packages/i18n` 的类型 |
| 动作数据与指导 | `packages/exercise-catalog` | `packages/coach-core` |
| 集成契约 | `packages/integrations/*` | 无 |
| 传输与能力 | `app/shared/api` | `packages/*` |
| 特性 | `app/features/*` | `app/shared/*`、`packages/*` |
| 页面 | `app/*/page.tsx` | `app/features/*` |

`packages/product-state` 与 `packages/exercise-catalog` 不得引入 React、fetch 或数据库，
因此可以被 `node --test` 直接加载并断言 —— 这是本轮"每个状态都有出口"能被自动验证的前提。

### 3. Guest / Account 双模式是一等能力，不是降级提示

`Profile`、`Plan`、`Workout` 三个领域各有一个接口和两个 repository 实现
（浏览器本地 / 服务端）。领域结构相同，持久化不同。规则计划永远不被称作 AI 生成。

### 4. 能力状态显式建模

`CapabilityState = loading | available | unavailable(reason) | error(retryable)`，
入口决策由 `resolveEntry()` 这一个纯函数给出。它的类型不允许"两个探测都已返回但仍是
loading"的组合，`tests/entry-state.test.mjs` 对全部输入组合断言这一点。

### 5. Anybite 只做接缝

本轮只落地版本化契约、consent 模型和 `DisabledAnybiteAdapter`；不跨仓库实现，不做假按钮。
详见 ADR 0002。

## 后果

- 好处：三条死路可以被自动测试覆盖；未配置环境下首份价值不再依赖登录与 LLM；
  同一个 `ExerciseViewer` 服务四个调用点。
- 代价：短期内 `worker/api.ts` 仍然很长（本轮只抽出 capability 与动作指导两块），
  `app/coach-app.tsx` 保留营销页职责。二者都不再接收新业务逻辑。
- 未做：后台、计费、广告、移动端和完整 Anybite 联调不在本轮范围内。
