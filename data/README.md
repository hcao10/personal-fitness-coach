# Exercise dataset

`exercises.json` holds 1,324 exercise records (names, category, body part,
equipment, target and muscle group, plus multilingual instructions) from the
[exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) project by
Hasan Emir Yıldırım, MIT licensed. `../images/` and `../videos/` hold the
matching 180×180 thumbnails and animations, which are **© Gym visual** under
separate terms — see [`../NOTICE.md`](../NOTICE.md) and [`../LICENSE`](../LICENSE).

## How the product uses it

The raw dataset is **not** what the coach plans from. `scripts/build-exercise-pool.mjs`
applies the review policy — plannable equipment families, risk exclusions with
stated reasons, movement-pattern classification, per-pattern quotas and bilingual
naming — and emits the reviewed pool the planner is allowed to use:

```bash
npm run pool:generate
```

That writes `packages/coach-core/src/exercise-pool.ts` and copies the selected
media into `public/exercises/`, then verifies every referenced asset exists.
`npm test` re-runs the asset check, so a plan can never reference media the
product does not ship.

Keep this directory: it is the input the pool is regenerated from. The upstream
project's standalone browser (`index.html`) and setup guide (`setup.html`) were
removed — they were demo pages for the dataset, not part of Cmine Fit.
