-- Fixed-window rate-limit counters (abuse control, separate from billing
-- quotas). Rows are pruned by the daily maintenance job.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);
