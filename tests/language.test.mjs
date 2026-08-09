import assert from "node:assert/strict";
import test from "node:test";
import { auditContentLocale, countScripts, detectContentLocale } from "../packages/domain/src/index.ts";
import { SHIPPABLE_LOCALES } from "../packages/i18n/src/index.ts";

const ALL = SHIPPABLE_LOCALES;

test("Chinese prose survives the Latin abbreviations it legitimately contains", () => {
  // This is what the coach actually writes: Chinese carrying RIR, RPE, kg.
  const text = "今天做 4 组深蹲，每组 8 次，目标 RIR 2，负重 60 kg。如果 RPE 超过 8 就减到 3 组。";
  assert.equal(detectContentLocale(text, ALL).locale, "zh");
});

test("English prose survives a stray Chinese term", () => {
  const text = "Today you have four sets of the barbell squat (深蹲) at eight reps, targeting an RIR of two. "
    + "If your rating of perceived exertion goes above eight, drop to three sets instead.";
  assert.equal(detectContentLocale(text, ALL).locale, "en");
});

test("short strings are refused rather than guessed", () => {
  for (const text of ["", "ok", "60 kg", "8/10"]) {
    const verdict = detectContentLocale(text, ALL);
    assert.equal(verdict.locale, null, `${JSON.stringify(text)} should not resolve`);
    assert.equal(verdict.reason, "too_short");
  }
});

// The failure this guards against: a detector that keeps answering when a
// Latin-script locale joins the product, calling correct Spanish "English
// drift" until everyone learns to ignore the alarm. Today an unregistered
// locale takes the unknown_script exit; once Spanish is in the registry with a
// declared script, the same call takes script_ambiguous. Both refuse.
test("a locale with no declared script stops detection instead of skewing it", () => {
  const verdict = detectContentLocale("Hoy tienes cuatro series de sentadilla con barra a ocho repeticiones.", ["en", "es"]);
  assert.equal(verdict.locale, null, "answered 'en' for Spanish text");
  assert.equal(verdict.reason, "unknown_script");
});

test("digits, punctuation and units carry no language signal", () => {
  const counts = countScripts("12 次 / 60 kg — 8/10!");
  assert.equal(counts.han, 1);
  assert.equal(counts.latin, 2);
  assert.equal(counts.total, 3);
});

test("an audit reports drift only when the text itself proves it", () => {
  const drifted = auditContentLocale({
    requested: "zh", claimed: "zh", candidates: ALL,
    text: "Today you have four sets of the barbell squat at eight reps with two reps in reserve.",
  });
  assert.equal(drifted.detected, "en");
  assert.equal(drifted.mismatch, true, "wrote English for a Chinese reader");

  const agreed = auditContentLocale({
    requested: "zh", claimed: "zh", candidates: ALL,
    text: "今天做 4 组深蹲，每组 8 次，保留 2 次余力。",
  });
  assert.equal(agreed.mismatch, false);

  // Undetectable is not the same as mismatched — an unmeasurable string must
  // never raise an alarm.
  const unknown = auditContentLocale({ requested: "zh", claimed: "en", candidates: ALL, text: "60 kg" });
  assert.equal(unknown.detected, null);
  assert.equal(unknown.mismatch, false);
  assert.equal(unknown.reason, "too_short");
});

test("a claimed locale outside the registry is discarded, not trusted", () => {
  const audit = auditContentLocale({
    requested: "zh", claimed: "zh-Hant-TW", candidates: ALL,
    text: "今天做 4 组深蹲，每组 8 次，保留 2 次余力。",
  });
  assert.equal(audit.claimed, null);
  assert.equal(audit.detected, "zh");
});
