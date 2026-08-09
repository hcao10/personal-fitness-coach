import assert from "node:assert/strict";
import test from "node:test";
import { PROMPT_TASKS, PROMPT_VERSION, promptFingerprint, systemPrompt } from "../worker/prompts/index.ts";
import { SHIPPABLE_LOCALES, LOCALE_META } from "../packages/i18n/src/index.ts";
import { PAIN_THRESHOLD, INTENSITY_RAISING_ACTIONS } from "../packages/domain/src/index.ts";

// Every (version -> fingerprint) pair this codebase has shipped. Editing prompt
// text without bumping PROMPT_VERSION fails the test below, which is the point:
// the version is recorded on every generation run and takes part in the plan
// cache key, so a silent edit makes both of them lie.
const RECORDED = {
  "2026-08-09.1": "67bbd1e6",
  // coach_chat gained a content_locale echo, so the output directive now names
  // the value the model must report.
  "2026-08-09.2": "ba7a1dd9",
  // meal_vision went single-locale: name + search_term_en instead of a name
  // per language, so it takes the output directive rather than the bilingual one.
  "2026-08-09.3": "ab24cb3a",
  // training_plan went single-locale and stopped naming its own sessions.
  "2026-08-09.4": "18cefd89",
};

test("prompt text and PROMPT_VERSION cannot drift apart", () => {
  const expected = RECORDED[PROMPT_VERSION];
  assert.ok(expected, `PROMPT_VERSION ${PROMPT_VERSION} has no recorded fingerprint — add one to RECORDED`);
  const actual = promptFingerprint(SHIPPABLE_LOCALES, PROMPT_TASKS);
  assert.equal(actual, expected,
    `prompt text changed under version ${PROMPT_VERSION}. Bump PROMPT_VERSION and record ${actual}.`);
});

test("every task builds a prompt in every shippable locale", () => {
  for (const task of PROMPT_TASKS) {
    for (const locale of SHIPPABLE_LOCALES) {
      const prompt = systemPrompt(task, locale);
      assert.ok(prompt.length > 200, `${task}/${locale} is suspiciously short`);
      assert.ok(prompt.includes(LOCALE_META[locale].englishLabel),
        `${task}/${locale} never names its output language`);
    }
  }
});

// The instruction layer stays English so that a safety rule exists once rather
// than once per language. What varies per locale is the output directive, the
// register note, and the glossary.
test("instructions are English; only the output language varies", () => {
  const hasHan = (text) => /\p{Script=Han}/u.test(text);
  for (const task of PROMPT_TASKS) {
    const zh = systemPrompt(task, "zh");
    const en = systemPrompt(task, "en");
    assert.ok(!hasHan(en), `${task}/en leaked Chinese text`);
    // zh legitimately contains Han characters — but only inside the glossary and
    // style blocks, never in the task contract.
    const contract = zh.split("\n\n")[0];
    assert.ok(!hasHan(contract), `${task} contract is not locale-independent`);
    assert.equal(contract, en.split("\n\n")[0], `${task} contract differs between locales`);
  }
});

// A prompt that states a threshold the server does not enforce teaches the model
// to disagree with the code. These are interpolated, and this proves it.
test("the coach prompt quotes the safety constants the server enforces", () => {
  const prompt = systemPrompt("coach_chat", "en");
  assert.ok(prompt.includes(`${PAIN_THRESHOLD} out of 10`), "pain threshold is not the enforced constant");
  for (const action of INTENSITY_RAISING_ACTIONS) {
    assert.ok(prompt.includes(action), `${action} is withheld by the server but never mentioned`);
  }
});

test("the Chinese glossary reaches training tasks and stays out of English ones", () => {
  assert.ok(systemPrompt("coach_chat", "zh").includes("RIR（储备次数）"), "training glossary missing");
  assert.ok(!systemPrompt("coach_chat", "en").includes("TERMINOLOGY"), "English needs no glossary block");
  // meal_vision cannot emit training vocabulary, so it must not be charged for
  // it. The bare term still appears in the zh style note, so the glossary
  // rendering is what proves scoping.
  const meal = systemPrompt("meal_vision", "zh");
  assert.ok(!meal.includes("RIR（储备次数）"), "glossary is not scoped to the task");
  assert.ok(meal.includes("三大营养素"), "meal_vision lost the nutrition glossary");
});
