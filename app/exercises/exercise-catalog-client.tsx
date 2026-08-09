/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import ProductShell from "../components/product-shell";
import { beginCmineLogin } from "../lib/auth";
import { useDialog } from "../lib/use-dialog";
import { useLocale, useT, useLocaleRef } from "../lib/i18n-provider";
import { isLocale, pick, type Locale, type LocalizedPartial } from "../../packages/i18n/src";

type Exercise = { id: string; name: string; bodyPart: string; target: string; muscleGroup: string; secondaryMuscles: string[]; equipment: string; instructions: LocalizedPartial<string[]>; asset: string | null; attribution?: string };

/**
 * Instruction steps are dataset content that exists per language. This used to
 * read `instructions.zh` first and only fall back to `en`, so an English reader
 * got a wall of Chinese for every exercise the dataset had described in Chinese.
 * Languages with no steps are dropped before picking, so an empty array in the
 * reader's language falls back instead of rendering nothing.
 */
function instructionSteps(instructions: LocalizedPartial<string[]>, locale: Locale): string[] {
  const available: LocalizedPartial<string[]> = {};
  for (const [language, steps] of Object.entries(instructions)) {
    if (isLocale(language) && steps?.length) available[language] = steps;
  }
  return pick(available, locale) || [];
}

export default function ExerciseCatalogClient() {
  const t = useT();
  const localeRef = useLocaleRef(); const { locale } = useLocale();
  const [query, setQuery] = useState(""); const [equipment, setEquipment] = useState(""); const [items, setItems] = useState<Exercise[]>([]);
  const [total, setTotal] = useState(0); const [selected, setSelected] = useState<Exercise | null>(null); const [loading, setLoading] = useState(true);
  const detailRef = useDialog(Boolean(selected), () => setSelected(null));
  const search = async (nextQuery = query, nextEquipment = equipment) => {
    setLoading(true); const params = new URLSearchParams({ q: nextQuery, equipment: nextEquipment, limit: "36" });
    const response = await fetch(`/api/v1/exercises/search?${params}`, { cache: "no-store" });
    if (response.status === 401) { await beginCmineLogin("/exercises", locale); return; }
    if (response.ok) { const body = await response.json() as { total: number; exercises: Exercise[] }; setTotal(body.total); setItems(body.exercises); }
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/v1/exercises/search?q=&equipment=&limit=36", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { await beginCmineLogin("/exercises", localeRef.current); return; }
      if (response.ok && active) { const body = await response.json() as { total: number; exercises: Exercise[] }; setTotal(body.total); setItems(body.exercises); setLoading(false); }
    });
    return () => { active = false; };
  }, [localeRef]);
  return <ProductShell active="" eyebrow={t("exercises.eyebrow")} title={t("exercises.title")} action={<a className="header-chip" href="/today">{t("exercises.backToToday")}</a>}>
    <section className="exercise-catalog-tools"><div><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} placeholder={t("exercises.searchPlaceholder")} /><select value={equipment} onChange={(event) => { setEquipment(event.target.value); void search(query, event.target.value); }}><option value="">{t("exercises.equipmentAll")}</option><option value="body weight">{t("exercises.equipmentBodyweight")}</option><option value="dumbbell">{t("exercises.equipmentDumbbell")}</option><option value="barbell">{t("exercises.equipmentBarbell")}</option><option value="cable">{t("exercises.equipmentCable")}</option><option value="band">{t("exercises.equipmentBand")}</option><option value="leverage machine">{t("exercises.equipmentMachine")}</option></select><button onClick={() => void search()}>{t("exercises.searchAction")}</button></div><p>{total ? t("exercises.catalogNote", { count: total }) : t("exercises.catalogNotePending")}</p></section>
    {loading ? <div className="account-empty">{t("exercises.loading")}</div> : <section className="exercise-catalog-grid">{items.map((exercise) => <button key={exercise.id} onClick={() => setSelected(exercise)}><div>{exercise.asset ? <img src={`/exercises/${exercise.asset}.jpg`} alt="" /> : <span>{exercise.target.slice(0, 1).toUpperCase()}</span>}</div><small>{exercise.equipment} · {exercise.bodyPart}</small><b>{exercise.name}</b><p>{exercise.target}{exercise.muscleGroup ? ` · ${exercise.muscleGroup}` : ""}</p></button>)}</section>}
    {selected && <div className="exercise-detail-backdrop" role="presentation" onClick={() => setSelected(null)}><section ref={detailRef} className="exercise-detail" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(event) => event.stopPropagation()}><button className="exercise-detail-close" onClick={() => setSelected(null)}>{t("common.close")}</button>{selected.asset && <img src={`/exercises/${selected.asset}.gif`} alt={t("exercises.demoAlt", { name: selected.name })} />}<span>{selected.equipment} · {selected.bodyPart}</span><h2>{selected.name}</h2><p>{t("exercises.primaryTarget", { target: selected.target })}<br />{t("exercises.supportingMuscles", { muscles: [selected.muscleGroup, ...(selected.secondaryMuscles || [])].filter(Boolean).join(t("exercises.muscleSeparator")) || t("exercises.notSpecified") })}</p><ol>{instructionSteps(selected.instructions, locale).map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol>{selected.attribution && <small>{selected.attribution}</small>}<a href={`/coach?prompt=${encodeURIComponent(t("exercises.swapPrompt", { name: selected.name }))}`}>{t("exercises.askCoachToSwap")}</a></section></div>}
  </ProductShell>;
}
