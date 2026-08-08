-- Habit & retention system: implementation-intention commitments, persisted
-- milestones (so identity moments are never re-announced), and an idempotency
-- log for outbound notifications.
CREATE TABLE IF NOT EXISTS habit_commitments (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cue_time TEXT NOT NULL DEFAULT '18:00',
  cue_place TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  achieved_at TEXT NOT NULL,
  UNIQUE(user_id, kind)
);
CREATE INDEX IF NOT EXISTS milestones_user_idx ON milestones(user_id);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_log_user_idx ON notification_log(user_id, sent_at);
