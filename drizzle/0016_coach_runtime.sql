-- Session changes affect one dated occurrence, never the repeating plan.
ALTER TABLE workout_occurrences ADD COLUMN workout_override_json TEXT;
ALTER TABLE workout_occurrences ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE coach_turns (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  client_mutation_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
  attempt_id TEXT NOT NULL,
  result_json TEXT,
  error_code TEXT,
  lease_until TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,conversation_id,client_mutation_id)
);
CREATE INDEX coach_turns_conversation_idx ON coach_turns(conversation_id,created_at);

CREATE TABLE coach_model_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  turn_id TEXT NOT NULL REFERENCES coach_turns(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  request_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd REAL,
  latency_ms INTEGER NOT NULL,
  error_code TEXT,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Audit actual execution; claim + occurrence CAS + execution row are one batch.
CREATE TABLE coach_session_changes (
  action_id TEXT PRIMARY KEY NOT NULL REFERENCES coach_action_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_id TEXT NOT NULL REFERENCES workout_occurrences(id) ON DELETE CASCADE,
  base_revision INTEGER NOT NULL,
  result_revision INTEGER NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
