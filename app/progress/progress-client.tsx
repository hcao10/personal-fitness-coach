"use client";

import { useEffect, useState } from "react";
import ProductShell from "../components/product-shell";
import Link from "next/link";
import { Icon } from "../shared/ui/icon";
import { beginCmineLogin } from "../lib/auth";
import { useLocale, useLocaleRef } from "../lib/i18n-provider";
import { localizeApiError, type ApiErrorBody } from "../lib/api-error";
import { numberFormatter, pick, type LocalizedPartial, type MessageKey } from "../../packages/i18n/src";

// The engine strings the API sends (`deloadReason`, `teaser`) are localized on
// the server in every locale it supports — this file used to read `.zh` off
// them, so an English reader got Chinese engine text. They are typed as
// localized values now and read through `pick`.
type ReviewEngine = { deloadRecommended?: boolean; deloadReason?: LocalizedPartial | null; adjustmentCount?: number; stagnationCount?: number; teaser?: LocalizedPartial | null };
// `kind` is the engine's machine verdict; `title`/`explanation`/`changes` are the
// Chinese prose the domain package emits alongside it. The prose is only usable
// for a Chinese reader, so everything below renders from `kind`.
type ReviewKind = "collect_more_data" | "deload" | "progress" | "hold";
type Review = { id: string; weekStart: string; status: string; plateau: boolean; metrics?: { completedSessions: number; adherencePct: number; averageRpe: number | null; maxPain: number; weightTrendKgPerWeek: number | null }; recommendation?: { kind?: ReviewKind; title: string; explanation: string; changes: string[]; locked?: boolean; engine?: ReviewEngine } };
type MeasurementDraft = { id: string; payload: { title?: string; description?: string; after?: string }; createdAt: string };

// Listed explicitly rather than derived, because each kind has a different
// number of bullets and the compiler checks each key against the catalog.
const REVIEW_CHANGE_KEYS = {
  collect_more_data: ["progress.reviewKind.collect_more_data.change1", "progress.reviewKind.collect_more_data.change2"],
  deload: ["progress.reviewKind.deload.change1", "progress.reviewKind.deload.change2", "progress.reviewKind.deload.change3"],
  progress: ["progress.reviewKind.progress.change1", "progress.reviewKind.progress.change2", "progress.reviewKind.progress.change3"],
  hold: ["progress.reviewKind.hold.change1", "progress.reviewKind.hold.change2"],
} as const satisfies Record<ReviewKind, readonly MessageKey[]>;

const isReviewKind = (value: unknown): value is ReviewKind =>
  Object.prototype.hasOwnProperty.call(REVIEW_CHANGE_KEYS, value as string);
export default function ProgressClient() {
  const { locale, t } = useLocale();
  const localeRef = useLocaleRef();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]); const [recovery, setRecovery] = useState(3); const [sleep, setSleep] = useState(3); const [pain, setPain] = useState(0); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<MeasurementDraft[]>([]);
  const [measurement, setMeasurement] = useState({ weightKg: "", bodyFatPct: "", waistCm: "", note: "" });
  const load = async () => { const response = await fetch("/api/v1/reviews", { cache: "no-store" }); if (response.status === 401) { await beginCmineLogin("/progress", locale); return; } if (response.ok) setReviews((await response.json() as { reviews: Review[] }).reviews); };
  // Reviews stored before the engine recorded a `kind` keep their Chinese prose;
  // showing it to a Chinese reader is right, and to anyone else it would not be,
  // so they get an honest placeholder instead of another language's text.
  const reviewTitle = (review: Review | undefined, fallback: string) => {
    const kind = review?.recommendation?.kind;
    if (isReviewKind(kind)) return t(`progress.reviewKind.${kind}.title`);
    return locale === "zh" && review?.recommendation?.title ? review.recommendation.title : fallback;
  };
  const reviewExplanation = (review: Review) => {
    const kind = review.recommendation?.kind;
    if (isReviewKind(kind)) return t(`progress.reviewKind.${kind}.explanation`);
    return locale === "zh" ? review.recommendation?.explanation || "" : "";
  };
  const reviewChanges = (review: Review): string[] => {
    const kind = review.recommendation?.kind;
    if (isReviewKind(kind)) return REVIEW_CHANGE_KEYS[kind].map((key) => t(key));
    return locale === "zh" ? review.recommendation?.changes || [] : [];
  };
  useEffect(() => {
    void fetch("/api/v1/reviews", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { await beginCmineLogin("/progress", localeRef.current); return; }
      if (response.ok) setReviews((await response.json() as { reviews: Review[] }).reviews);
      else setLoadError(true);
    }).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [localeRef]); const current = reviews[0];
  useEffect(() => { void fetch("/api/v1/record-drafts?type=measurement", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((body: { drafts?: MeasurementDraft[] } | null) => setDrafts(body?.drafts || [])).catch(() => undefined); }, []);
  const generate = async () => { if (!current) return; setBusy(true); setMessage(""); const checked = await fetch(`/api/v1/reviews/${current.id}/check-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recovery, sleep, pain }) }); if (checked.ok) { const generated = await fetch(`/api/v1/reviews/${current.id}/generate`, { method: "POST" }); if (!generated.ok) setMessage(localizeApiError(await generated.json().catch(() => null) as ApiErrorBody | null, locale, t("progress.generateFailed"))); } await load(); setBusy(false); };
  const decide = async (decision: "accept" | "reject") => { if (!current) return; setBusy(true); const response = await fetch(`/api/v1/reviews/${current.id}/${decision}`, { method: "POST" }); setMessage(response.ok ? decision === "accept" ? t("progress.planActivated") : t("progress.planKept") : t("progress.actionFailed")); await load(); setBusy(false); };
  const decideMeasurement = async (draftId: string, decision: "confirm" | "reject") => {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/v1/record-drafts/${encodeURIComponent(draftId)}/${decision}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: decision === "confirm" ? JSON.stringify({ ...measurement, measuredAt: new Date().toISOString() }) : undefined,
    });
    if (response.ok) {
      setDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));
      setMeasurement({ weightKg: "", bodyFatPct: "", waistCm: "", note: "" });
      setMessage(decision === "confirm" ? t("progress.measurementSaved") : t("progress.measurementRejected"));
    } else setMessage(t("progress.measurementFailed"));
    setBusy(false);
  };
  return <ProductShell active="/progress" eyebrow={t("progress.eyebrow")} title={t("progress.title")}>
    <section className="fit-surface-intro"><Icon name="progress" /><div><h2>{t("refresh.progress.title")}</h2><p>{t("refresh.progress.body")}</p></div></section>
    {loading ? <div className="entry-state" role="status">{t("refresh.progress.loading")}</div> : loadError ? <section className="entry-state" role="alert"><p>{t("refresh.progress.unavailable")}</p><button className="secondary-cta" onClick={() => window.location.reload()}>{t("common.retry")}</button></section> : !current ? <section className="review-card"><span>{t("progress.reviewEyebrow")}</span><h2>{t("refresh.progress.emptyTitle")}</h2><p>{t("refresh.progress.emptyBody")}</p><div className="review-empty-actions"><Link className="primary-cta" href="/today">{t("refresh.progress.train")}</Link><Link className="secondary-cta" href="/account#progress">{t("refresh.progress.measurements")}</Link></div></section> : <div className="progress-grid"><section className="review-card"><span>{t("progress.reviewEyebrow")}</span><h2>{current?.recommendation ? reviewTitle(current, t("progress.reviewPrompt")) : t("progress.reviewPrompt")}</h2>{current?.recommendation ? <><p>{reviewExplanation(current)}</p><div className="review-metrics"><article><b>{current.metrics?.adherencePct || 0}%</b><span>{t("progress.metricAdherence")}</span></article><article><b>{current.metrics?.completedSessions || 0}</b><span>{t("progress.metricSessions")}</span></article><article><b>{current.metrics?.averageRpe ?? "—"}</b><span>{t("progress.metricAverageRpe")}</span></article><article><b>{current.metrics?.maxPain || 0}/10</b><span>{t("progress.metricPeakPain")}</span></article></div>{current.recommendation.locked ? <>
        {current.recommendation.engine?.deloadRecommended && current.recommendation.engine.deloadReason && <p>{pick(current.recommendation.engine.deloadReason, locale)}</p>}
        <p>{t("progress.engineSummary", { count: current.recommendation.engine?.adjustmentCount || 0, stalled: (current.recommendation.engine?.stagnationCount || 0) > 0 ? t("progress.engineStagnation", { count: current.recommendation.engine!.stagnationCount! }) : "", teaser: pick(current.recommendation.engine?.teaser, locale) || "" })}</p>
        <div className="review-actions"><a className="review-generate" href="/pricing">{t("progress.unlockAdjustments")}</a></div>
      </> : <><ul>{reviewChanges(current).map((change) => <li key={change}>{change}</li>)}</ul>{current.status === "generated" && <div className="review-actions"><button onClick={() => void decide("reject")}>{t("progress.keepCurrentPlan")}</button><button onClick={() => void decide("accept")}>{t("progress.acceptAdjustments")}</button></div>}</>}</> : <><div className="review-sliders"><label>{t("progress.recoveryLabel")} <b aria-hidden="true">{recovery}/5</b><input type="range" aria-label={t("progress.recoveryLabel")} aria-valuetext={`${recovery} / 5`} min="1" max="5" value={recovery} onChange={(event) => setRecovery(Number(event.target.value))} /></label><label>{t("progress.sleepLabel")} <b aria-hidden="true">{sleep}/5</b><input type="range" aria-label={t("progress.sleepLabel")} aria-valuetext={`${sleep} / 5`} min="1" max="5" value={sleep} onChange={(event) => setSleep(Number(event.target.value))} /></label><label>{t("progress.painLabel")} <b aria-hidden="true">{pain}/10</b><input type="range" aria-label={t("progress.painLabel")} aria-valuetext={`${pain} / 10`} min="0" max="10" value={pain} onChange={(event) => setPain(Number(event.target.value))} /></label></div><button className="review-generate" disabled={busy} onClick={() => void generate()}>{busy ? t("progress.generating") : t("progress.generateReview")}</button></>}{message && <p className="form-message">{message}</p>}</section>
      <aside className="review-history"><span>{t("progress.historyEyebrow")}</span>{reviews.slice(1).map((review) => <article key={review.id}><small>{review.weekStart}</small><b>{reviewTitle(review, t("progress.historyPlaceholderTitle"))}</b><em>{review.status}</em></article>)}{reviews.length <= 1 && <p>{t("progress.historyEmpty")}</p>}</aside></div>}
    {drafts[0] && <section className="review-card" id="measurements">
      <span>{t("progress.measurementDraftEyebrow")}</span><h2>{drafts[0].payload.title || t("progress.measurementDraftTitle")}</h2>
      <p>{t("progress.measurementDraftBody")}</p>
      <div className="measurement-draft-form">
        <label>{t("progress.weightKg")}<input type="number" min="35" max="250" step="0.1" value={measurement.weightKg} onChange={(event) => setMeasurement({ ...measurement, weightKg: event.target.value })} /></label>
        <label>{t("progress.bodyFatPct")}<input type="number" min="2" max="70" step="0.1" value={measurement.bodyFatPct} onChange={(event) => setMeasurement({ ...measurement, bodyFatPct: event.target.value })} /></label>
        <label>{t("progress.waistCm")}<input type="number" min="40" max="220" step="0.1" value={measurement.waistCm} onChange={(event) => setMeasurement({ ...measurement, waistCm: event.target.value })} /></label>
        <label>{t("progress.measurementNote")}<input maxLength={300} value={measurement.note} onChange={(event) => setMeasurement({ ...measurement, note: event.target.value })} /></label>
      </div>
      <div className="review-actions"><button disabled={busy} onClick={() => void decideMeasurement(drafts[0].id, "reject")}>{t("progress.rejectMeasurement")}</button><button disabled={busy || !measurement.weightKg} onClick={() => void decideMeasurement(drafts[0].id, "confirm")}>{t("progress.confirmMeasurement")}</button></div>
    </section>}
    {message && !current && <p className="form-message">{message}</p>}
    {!loading && !loadError && <ProgressCharts />}
  </ProductShell>;
}

type Series = {
  weeks: Array<{ weekStart: string; tonnageKg: number; sets: number; sessions: number }>;
  exercises: Array<{ exerciseId: string; name: { zh: string; en: string }; points: Array<{ date: string; e1rm: number }>; changePct: number | null }>;
  weight: Array<{ date: string; weightKg: number; bmi: number | null }>;
  planVersions: Array<{ date: string; versionNumber: number }>;
};

const shortDate = (value: string) => value.slice(5).replace("-", "/");

// Charts are plain inline SVG: no chart library, no external requests, and the
// same numbers are always available as text for screen readers.
function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / span) * 24;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} style={{ width: "100%", height: 40 }}>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function ProgressCharts() {
  const { locale, t } = useLocale();
  const [series, setSeries] = useState<Series | null>(null);
  useEffect(() => {
    void fetch("/api/v1/progress/series", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((data: Series | null) => setSeries(data)).catch(() => undefined);
  }, []);
  if (!series) return null;
  // Grouping follows the chosen language, not whatever locale the browser
  // happens to run in — bare toLocaleString() ignored the picker entirely.
  const formatNumber = numberFormatter(locale);
  const hasAnything = series.weeks.length > 0 || series.exercises.length > 0 || series.weight.length > 0;
  if (!hasAnything) {
    return <section className="review-card"><span>{t("progress.chartsEyebrow")}</span><h2>{t("progress.chartsEmptyTitle")}</h2><p>{t("progress.chartsEmptyBody")}</p></section>;
  }
  const maxTonnage = Math.max(1, ...series.weeks.map((week) => week.tonnageKg));
  const totalTonnage = series.weeks.reduce((sum, week) => sum + week.tonnageKg, 0);
  return <section className="review-card" id="charts">
    <span>{t("progress.chartsEyebrow")}</span>
    <h2>{t("progress.chartsTitle")}</h2>
    <p>{t("progress.chartsSummary", { tonnes: formatNumber.format(Math.round(totalTonnage / 1000)), sessions: series.weeks.reduce((sum, week) => sum + week.sessions, 0) })}</p>

    {series.weeks.length > 0 && <>
      <h3>{t("progress.weeklyTonnageHeading")}</h3>
      <div role="img" aria-label={t("progress.weeklyTonnageChartLabel", { data: series.weeks.map((week) => `${week.weekStart} ${week.tonnageKg} kg`).join(t("progress.listSeparator")) })}
        style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 96, marginBottom: 8 }}>
        {series.weeks.map((week) => <div key={week.weekStart} title={t("progress.weeklyTonnageBarTitle", { date: week.weekStart, tonnage: formatNumber.format(week.tonnageKg), sessions: week.sessions })}
          style={{ flex: 1, minWidth: 6, height: `${Math.max(3, (week.tonnageKg / maxTonnage) * 100)}%`, background: "currentColor", opacity: 0.75 }} />)}
      </div>
      <p><small>{t("progress.weeklyTonnageRange", { from: shortDate(series.weeks[0].weekStart), to: shortDate(series.weeks[series.weeks.length - 1].weekStart), peak: formatNumber.format(maxTonnage) })}</small></p>
    </>}

    {series.exercises.length > 0 && <>
      <h3>{t("progress.e1rmHeading")}</h3>
      <div className="review-metrics">
        {series.exercises.map((exercise) => {
          // The series already carries the exercise name in every locale; the
          // chart used to render the Chinese one unconditionally.
          const name = pick(exercise.name, locale) || exercise.exerciseId;
          return <article key={exercise.exerciseId}>
            <b>{exercise.points[exercise.points.length - 1].e1rm} kg</b>
            <span>{name}{exercise.changePct !== null ? t("progress.exerciseChange", { change: `${exercise.changePct > 0 ? "+" : ""}${exercise.changePct}` }) : ""}</span>
            <Sparkline values={exercise.points.map((point) => point.e1rm)}
              label={t("progress.e1rmChartLabel", { name, from: exercise.points[0].e1rm, to: exercise.points[exercise.points.length - 1].e1rm })} />
          </article>;
        })}
      </div>
      <p><small>{t("progress.e1rmNote")}</small></p>
    </>}

    {series.weight.length > 0 && <>
      <h3>{t("progress.weightHeading")}</h3>
      <Sparkline values={series.weight.map((point) => point.weightKg)}
        label={t("progress.weightChartLabel", { from: series.weight[0].weightKg, to: series.weight[series.weight.length - 1].weightKg })} />
      <p><small>{shortDate(series.weight[0].date)} {series.weight[0].weightKg} kg  {shortDate(series.weight[series.weight.length - 1].date)} {series.weight[series.weight.length - 1].weightKg} kg
        {series.weight[series.weight.length - 1].bmi ? `　·　${t("progress.bmiLatest", { bmi: series.weight[series.weight.length - 1].bmi! })}` : ""}
        {series.planVersions.length > 0 ? t("progress.planAdjustments", { count: series.planVersions.length, date: shortDate(series.planVersions[series.planVersions.length - 1].date) }) : ""}</small></p>
    </>}
  </section>;
}
