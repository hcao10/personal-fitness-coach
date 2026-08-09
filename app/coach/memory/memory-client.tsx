"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProductShell from "../../components/product-shell";
import { beginCmineLogin } from "../../lib/auth";
import { useLocale } from "../../lib/i18n-provider";
import { dateFormatter, type MessageKey } from "../../../packages/i18n/src";

type Memory = {
  id: string;
  type: "declared" | "profile" | "observed";
  key: string;
  value: string;
  source: "user" | "profile" | "system";
  confidence: number;
  updatedAt: string;
};

type Snapshot = {
  pro: boolean;
  memories: Memory[];
  preferences: {
    memoryEnabled: boolean;
    coachingMode: "personalized" | "education";
    tone: "supportive" | "direct" | "concise";
    proactiveEnabled: boolean;
  };
};

const labels: Record<string, MessageKey> = {
  goal: "coach.memoryKeyGoal",
  equipment: "coach.memoryKeyEquipment",
  limitations: "coach.memoryKeyLimitations",
  schedule: "coach.memoryKeySchedule",
  training_preference: "coach.memoryKeyTrainingPreference",
  food_preference: "coach.memoryKeyFoodPreference",
};

export default function MemoryClient() {
  const { locale, t } = useLocale();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [key, setKey] = useState("schedule");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const response = await fetch("/api/v1/coach/memory", { cache: "no-store" });
    if (response.status === 401) {
      await beginCmineLogin("/coach/memory", locale);
      return;
    }
    if (response.ok) setSnapshot(await response.json() as Snapshot);
  };

  // Mount-only on purpose. `load` is redefined on every render, so listing it
  // would re-fetch on every render — the dependency the rule asks for is the
  // one that breaks it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, []);

  const savePreference = async (patch: Partial<Snapshot["preferences"]>) => {
    if (!snapshot) return;
    const preferences = { ...snapshot.preferences, ...patch };
    setSnapshot({ ...snapshot, preferences });
    const response = await fetch("/api/v1/coach/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "preferences", ...preferences }),
    });
    if (!response.ok) setNotice(t("coach.preferenceSaveFailed"));
    else setSnapshot(await response.json() as Snapshot);
  };

  const addMemory = async () => {
    if (!snapshot?.pro) return setNotice(t("coach.memoryProRequired"));
    if (!value.trim()) return;
    setSaving(true);
    const response = await fetch("/api/v1/coach/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value: value.trim() }),
    });
    setSaving(false);
    if (!response.ok) return setNotice(t("coach.memorySaveFailed"));
    setSnapshot(await response.json() as Snapshot);
    setValue("");
    setNotice(t("coach.memorySaved"));
  };

  const remove = async (memory: Memory) => {
    const response = await fetch(`/api/v1/coach/memory?id=${encodeURIComponent(memory.id)}`, { method: "DELETE" });
    if (!response.ok) return setNotice(t("coach.memoryDeleteFailed"));
    setSnapshot(await response.json() as Snapshot);
  };

  return <ProductShell
    active="/coach"
    eyebrow={t("coach.memoryEyebrow")}
    title={t("coach.memoryTitle")}
    action={<Link className="header-chip" href="/coach">{t("coach.backToCoach")}</Link>}
  >
    {!snapshot ? <div className="product-loading">{t("coach.memoryLoading")}</div> : <div className="memory-layout">
      <section className="memory-panel memory-preferences">
        <div className="section-heading"><span>{t("coach.personalizationSection")}</span><h2>{t("coach.personalizationHeading")}</h2><p>{t("coach.personalizationHint")}</p></div>
        <label className="setting-switch"><span><b>{t("coach.memoryToggle")}</b><small>{t("coach.memoryToggleHint")}</small></span><input type="checkbox" checked={snapshot.preferences.memoryEnabled} onChange={(event) => void savePreference({ memoryEnabled: event.target.checked })} /></label>
        <label className="setting-switch"><span><b>{t("coach.proactiveToggle")}</b><small>{t("coach.proactiveToggleHint")}</small></span><input type="checkbox" checked={snapshot.preferences.proactiveEnabled} onChange={(event) => void savePreference({ proactiveEnabled: event.target.checked })} /></label>
        <div className="preference-options"><span>{t("coach.answerStyleLabel")}</span><button className={snapshot.preferences.coachingMode === "personalized" ? "active" : ""} onClick={() => void savePreference({ coachingMode: "personalized" })}>{t("coach.modePersonalized")}</button><button className={snapshot.preferences.coachingMode === "education" ? "active" : ""} onClick={() => void savePreference({ coachingMode: "education" })}>{t("coach.modeEducation")}</button></div>
        <div className="preference-options"><span>{t("coach.toneLabel")}</span>{(["supportive", "direct", "concise"] as const).map((tone) => <button key={tone} className={snapshot.preferences.tone === tone ? "active" : ""} onClick={() => void savePreference({ tone })}>{tone === "supportive" ? t("coach.toneSupportive") : tone === "direct" ? t("coach.toneDirect") : t("coach.toneConcise")}</button>)}</div>
      </section>

      <section className="memory-panel">
        <div className="section-heading"><span>{t("coach.knowledgeSection")}</span><h2>{t("coach.knowledgeHeading")}</h2><p>{t("coach.knowledgeHint")}</p></div>
        <div className="memory-groups">
          {snapshot.memories.length ? snapshot.memories.map((memory) => <article key={memory.id} className="memory-card"><div><span>{memory.type === "profile" ? t("coach.sourceProfile") : memory.type === "observed" ? t("coach.sourceObserved") : t("coach.sourceDeclared")}</span><small>{dateFormatter(locale).format(new Date(memory.updatedAt))}</small></div><b>{labels[memory.key] ? t(labels[memory.key]) : memory.key}</b><p>{memory.value}</p>{memory.type === "profile" ? <Link href="/account#profile">{t("coach.editInProfile")}</Link> : <button onClick={() => void remove(memory)}>{t("coach.deleteMemory")}</button>}</article>) : <div className="memory-empty">{t("coach.memoryEmpty")}</div>}
        </div>
      </section>

      <section className={`memory-panel memory-add ${snapshot.pro ? "" : "locked"}`}>
        <div className="section-heading"><span>{t("coach.addSection")}</span><h2>{t("coach.addHeading")}</h2></div>
        <select value={key} onChange={(event) => setKey(event.target.value)}><option value="schedule">{t("coach.memoryKeySchedule")}</option><option value="training_preference">{t("coach.memoryKeyTrainingPreference")}</option><option value="food_preference">{t("coach.memoryKeyFoodPreference")}</option><option value="travel">{t("coach.memoryKeyTravel")}</option><option value="other">{t("coach.memoryKeyOther")}</option></select>
        <textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} placeholder={t("coach.addPlaceholder")} />
        <button disabled={saving || !value.trim()} onClick={() => void addMemory()}>{saving ? t("coach.saving") : snapshot.pro ? t("coach.remember") : t("coach.proLocked")}</button>
        <small>{snapshot.pro ? t("coach.sensitiveHint") : t("coach.freeTierHint")}</small>
      </section>
    </div>}
    {notice && <div className="toast account-toast">{notice}</div>}
  </ProductShell>;
}
