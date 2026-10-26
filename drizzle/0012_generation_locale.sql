-- Records which language each generation was asked for, which one it actually
-- produced, and which prompt build produced it.
--
-- Report-only on purpose. Before the server retries or rejects a generation for
-- drifting into the wrong language, we need to know how often that happens and
-- on which routes; acting on an unmeasured signal means paying for retries of
-- generations that were fine. These three columns are what turns that from a
-- guess into a query.

-- The locale requested for this call, from the reader's profile.
ALTER TABLE generation_runs ADD COLUMN locale TEXT;

-- The locale detected in the produced text (packages/domain/src/language.ts).
-- NULL means detection refused — text too short, or scripts it cannot separate.
-- NULL is not a mismatch, and any query that treats it as one is wrong.
ALTER TABLE generation_runs ADD COLUMN content_locale TEXT;

-- PROMPT_VERSION from worker/prompts. Ties a quality change to the prompt edit
-- that caused it, and keeps a prompt change from being served out of a cache
-- filled by the previous one.
ALTER TABLE generation_runs ADD COLUMN prompt_version TEXT;

-- Answers "which routes drift, and how often" without scanning the table.
CREATE INDEX IF NOT EXISTS generation_runs_locale_idx
  ON generation_runs(task, locale, content_locale, created_at);
