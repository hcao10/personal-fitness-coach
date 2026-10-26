ALTER TABLE users ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE users ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN onboarding_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT;
ALTER TABLE users ADD COLUMN onboarding_skipped_at TEXT;
UPDATE users SET onboarding_status='completed', onboarding_step=6, onboarding_completed_at=updated_at
WHERE id IN (SELECT user_id FROM profiles);

ALTER TABLE entitlements RENAME TO entitlements_legacy;
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, capability, source)
);
INSERT INTO entitlements SELECT * FROM entitlements_legacy;
DROP TABLE entitlements_legacy;
CREATE INDEX entitlements_user_idx ON entitlements(user_id);

CREATE TABLE onboarding_drafts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'guided',
  updated_at TEXT NOT NULL
);

CREATE TABLE plan_cycles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  active_version_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX plan_cycles_user_status_idx ON plan_cycles(user_id,status);

CREATE TABLE plan_versions (
  id TEXT PRIMARY KEY NOT NULL,
  cycle_id TEXT NOT NULL REFERENCES plan_cycles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  parent_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  change_summary_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  activated_at TEXT,
  UNIQUE(cycle_id,version_number)
);
CREATE INDEX plan_versions_user_status_idx ON plan_versions(user_id,status);

CREATE TABLE plan_activation_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT NOT NULL REFERENCES plan_cycles(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  previous_version_id TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX plan_activation_events_user_time_idx ON plan_activation_events(user_id,created_at);

CREATE TABLE coach_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX coach_conversations_user_time_idx ON coach_conversations(user_id,updated_at);

CREATE TABLE coach_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  client_mutation_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX coach_messages_conversation_time_idx ON coach_messages(conversation_id,created_at);
CREATE UNIQUE INDEX coach_messages_user_mutation_unique ON coach_messages(user_id,client_mutation_id);

CREATE TABLE coach_runs (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX coach_runs_user_time_idx ON coach_runs(user_id,created_at);

CREATE TABLE coach_action_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES coach_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX coach_actions_user_status_idx ON coach_action_proposals(user_id,status);

CREATE TABLE weekly_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES plan_cycles(id) ON DELETE SET NULL,
  week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'due',
  checkin_json TEXT,
  metrics_json TEXT,
  recommendation_json TEXT,
  plateau INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,week_start)
);
CREATE INDEX weekly_reviews_user_status_idx ON weekly_reviews(user_id,status);

CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  name TEXT,
  push_token TEXT,
  last_sync_cursor INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX devices_user_idx ON devices(user_id);

CREATE TABLE sync_mutations (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE INDEX sync_mutations_user_time_idx ON sync_mutations(user_id,applied_at);

CREATE TABLE sync_events (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sync_events_user_cursor_idx ON sync_events(user_id,cursor);

CREATE TABLE health_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  sync_cursor_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,platform)
);

CREATE TABLE health_observations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES health_connections(id) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(connection_id,source_record_id,type)
);
CREATE INDEX health_observations_user_time_idx ON health_observations(user_id,observed_at);

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  training INTEGER NOT NULL DEFAULT 1,
  coach INTEGER NOT NULL DEFAULT 1,
  reviews INTEGER NOT NULL DEFAULT 1,
  nutrition INTEGER NOT NULL DEFAULT 0,
  billing INTEGER NOT NULL DEFAULT 1,
  quiet_start TEXT NOT NULL DEFAULT '22:00',
  quiet_end TEXT NOT NULL DEFAULT '08:00',
  updated_at TEXT NOT NULL
);

CREATE TABLE maintenance_runs (
  id TEXT PRIMARY KEY NOT NULL,
  job TEXT NOT NULL,
  status TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX maintenance_runs_job_time_idx ON maintenance_runs(job,started_at);

INSERT OR IGNORE INTO site_settings (key,value_json,updated_by,updated_at) VALUES
  ('pro_adaptive_review_limit','4','system',CURRENT_TIMESTAMP);
