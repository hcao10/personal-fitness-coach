"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EQUIPMENT_LABELS } from "../shared/ui/equipment-label";
import ProductShell from "../components/product-shell";
import { useLocale } from "../lib/i18n-provider";
import { useEntry } from "../shared/api/capability-provider";
import { EntryGate } from "../shared/async-state/entry-gate";
import { apiFetch, describeFailure } from "../shared/api/client";
import { ExerciseViewer } from "../features/exercise/exercise-viewer";
import { ExerciseStage } from "../features/exercise/exercise-stage";
import { CoachDock } from "../features/coach/coach-dock";
import { planRepository } from "../features/plan/repository";
import type { PlanRecord } from "../features/plan/plan-imports";
import { EXERCISE_POOL } from "../lib/coach";
import { fromCatalogRow, fromExercise, type CatalogRow, type ExerciseView } from "../../packages/exercise-catalog/src";
import { pick } from "../../packages/i18n/src";
import type { CoachContext } from "../../packages/product-state/src";

/**
 * The exercise library.
 *
 * Two things were wrong. It had its own detail modal — different markup and
 * different fallbacks from Today's — and it rendered a placeholder letter for
 * every movement whose catalog row says `asset: null`, which is 150 of the 167
 * whose GIF and JPG are actually shipped. `fromCatalogRow` recovers the asset
 * from the reviewed pool, and the viewer is now the shared one.
 *
 * The search endpoint requires an account. Rather than redirecting a signed-out
 * visitor to a sign-in that may not exist, the reviewed pool already ships in
 * the client bundle, so guest mode browses that.
 */
export default function ExerciseCatalogClient() {
  const { locale, t } = useLocale();
  const probe = useEntry(true);
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState("");
  /** The query the user actually submitted, as opposed to what is in the box. */
  const [submitted, setSubmitted] = useState({ query: "", equipment: "" });
  const [serverRows, setServerRows] = useState<{ total: number; rows: ExerciseView[] } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [record, setRecord] = useState<PlanRecord | null>(null);
  const [coachRequest, setCoachRequest] = useState<CoachContext | null>(null);

  const signedIn = Boolean(probe.session?.signedIn);
  const localPool = useMemo(() => EXERCISE_POOL.map(fromExercise), []);

  // Guest results are a pure function of the submitted filters and the reviewed
  // pool, so they are derived during render rather than pushed into state by an
  // effect — which is also what keeps the first paint from being an empty grid.
  const localMatches = useMemo(() => {
    const needle = submitted.query.trim().toLocaleLowerCase();
    return localPool.filter((view) => {
      const text = `${view.name.zh} ${view.name.en} ${view.target.zh} ${view.target.en}`.toLocaleLowerCase();
      return (!needle || text.includes(needle)) && (!submitted.equipment || view.equipment === submitted.equipment);
    });
  }, [localPool, submitted]);

  useEffect(() => {
    // Only the signed-in path needs the network; the reviewed pool is already in
    // this bundle, which is why guest mode has a real library rather than a
    // redirect to a sign-in that may not exist.
    if (!signedIn || probe.entry.status === "loading") return;
    let active = true;
    const params = new URLSearchParams({ q: submitted.query, equipment: submitted.equipment, limit: "36" });
    void apiFetch<{ total: number; exercises: CatalogRow[] }>(`/api/v1/exercises/search?${params}`).then((response) => {
      if (!active) return;
      if (!response.ok) {
        // A failed search leaves the reviewed pool as a working library rather
        // than an empty page with an error on it.
        setMessage(describeFailure(response, locale, t("exercises.loading")));
        setServerRows(null);
        return;
      }
      setMessage("");
      setServerRows({ total: response.data.total, rows: response.data.exercises.map(fromCatalogRow) });
    });
    return () => { active = false; };
  }, [signedIn, probe.entry.status, submitted, locale, t]);

  useEffect(() => {
    if (probe.entry.status === "loading") return;
    let active = true;
    void planRepository(signedIn ? "account" : "guest", locale).load().then((plan) => {
      if (!active) return;
      setRecord(plan.status === "active" || plan.status === "draft" ? plan.record : null);
    });
    return () => { active = false; };
  }, [probe.entry.status, signedIn, locale]);

  const rows = serverRows ? serverRows.rows : localMatches.slice(0, 60);
  const total = serverRows ? serverRows.total : localMatches.length;
  const submit = (nextQuery = query, nextEquipment = equipment) => setSubmitted({ query: nextQuery, equipment: nextEquipment });

  const onAskCoach = useCallback((context: CoachContext) => { setSelected(null); setCoachRequest(context); }, []);

  // Guest equipment values come from the reviewed pool, which uses coach-core's
  // vocabulary; the search endpoint uses the dataset's. One list per mode rather
  // than a filter that silently matches nothing.
  const equipmentOptions = signedIn
    ? [["body weight", "exercises.equipmentBodyweight"], ["dumbbell", "exercises.equipmentDumbbell"], ["barbell", "exercises.equipmentBarbell"], ["cable", "exercises.equipmentCable"], ["leverage machine", "exercises.equipmentMachine"]] as const
    : [["bodyweight", "exercises.equipmentBodyweight"], ["dumbbell", "exercises.equipmentDumbbell"], ["barbell", "exercises.equipmentBarbell"], ["cable", "exercises.equipmentCable"], ["gym", "exercises.equipmentMachine"]] as const;

  return (
    <ProductShell active="/today" eyebrow={t("exercises.eyebrow")} title={t("exercises.title")}
      action={<Link className="header-chip" href="/today">{t("exercises.backToToday")}</Link>}>
      <EntryGate entry={probe.entry} missingTables={probe.missingTables} onRetry={probe.refresh} onContinueLocal={() => submit()}>
        {() => (
          <>
            <section className="exercise-catalog-tools">
              <div>
                <label className="sr-only" htmlFor="exercise-search">{t("exercises.searchPlaceholder")}</label>
                <input id="exercise-search" value={query} placeholder={t("exercises.searchPlaceholder")}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") submit(); }} />
                <label className="sr-only" htmlFor="exercise-equipment">{t("exercises.equipmentAll")}</label>
                <select id="exercise-equipment" value={equipment}
                  onChange={(event) => { setEquipment(event.target.value); submit(query, event.target.value); }}>
                  <option value="">{t("exercises.equipmentAll")}</option>
                  {equipmentOptions.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
                </select>
                <button type="button" onClick={() => submit()}>{t("exercises.searchAction")}</button>
              </div>
              <p>{total ? t("exercises.catalogNote", { count: total }) : t("exercises.catalogNotePending")}</p>
              {message && <p className="form-message" role="status">{message}</p>}
            </section>

            <section className="exercise-catalog-grid">
              {rows.map((view, index) => (
                <button key={view.id} type="button" onClick={() => setSelected(index)}
                  aria-label={t("product.viewer.openAria", { name: pick(view.name, locale) || view.id })}>
                  {/* The same stage as everywhere else, so the 150 movements
                      whose asset the catalog forgot now show their media too. */}
                  <ExerciseStage key={view.id} view={view} size="thumb" animate={false} />
                  <small>{EQUIPMENT_LABELS[view.equipment] ? t(EQUIPMENT_LABELS[view.equipment]) : view.equipment}</small>
                  <b>{pick(view.name, locale) || view.id}</b>
                  <p>{pick(view.target, locale)}</p>
                </button>
              ))}
            </section>

            {selected !== null && rows[selected] && (
              <ExerciseViewer
                exercises={rows} index={selected} onIndexChange={setSelected} onClose={() => setSelected(null)}
                equipment={record?.profile.equipment ?? "gym"} surface="library"
                coachContext={{ planId: record?.id }} onAskCoach={onAskCoach}
              />
            )}

            <CoachDock plan={record} aiAvailable={Boolean(probe.capabilities?.ai)}
              signedIn={signedIn} accountsConfigured={Boolean(probe.capabilities?.accounts)}
              request={coachRequest} />
          </>
        )}
      </EntryGate>
    </ProductShell>
  );
}
