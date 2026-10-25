-- One persisted UUID per actual Hub decision. It is not a cache of provider content.
CREATE TABLE coach_hub_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES coach_turns(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_version INTEGER NOT NULL,
  model_alias TEXT,
  decision_kind TEXT,
  status TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(attempt_id,step_index)
);
