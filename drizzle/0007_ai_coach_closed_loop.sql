ALTER TABLE plan_cycles ADD COLUMN start_date TEXT;
ALTER TABLE plan_cycles ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE plan_cycles ADD COLUMN phase_weeks INTEGER NOT NULL DEFAULT 4;
UPDATE plan_cycles SET start_date=substr(started_at,1,10) WHERE start_date IS NULL;

ALTER TABLE coach_messages ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE coach_action_proposals ADD COLUMN base_version_id TEXT;
ALTER TABLE coach_action_proposals ADD COLUMN reason_codes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE coach_action_proposals ADD COLUMN impact_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE coach_action_proposals ADD COLUMN reversible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE coach_action_proposals ADD COLUMN expires_at TEXT;

CREATE TABLE workout_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_id TEXT NOT NULL REFERENCES plan_cycles(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  mode TEXT NOT NULL DEFAULT 'standard',
  rescheduled_from_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(version_id,scheduled_date,day_index)
);
CREATE INDEX workout_occurrences_user_date_idx ON workout_occurrences(user_id,scheduled_date);

CREATE TABLE workout_occurrence_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  occurrence_id TEXT NOT NULL UNIQUE REFERENCES workout_occurrences(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed',
  duration_minutes INTEGER,
  rpe INTEGER,
  pain INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX workout_occurrence_sessions_user_time_idx ON workout_occurrence_sessions(user_id,completed_at);

CREATE TABLE workout_occurrence_sets (
  id TEXT PRIMARY KEY NOT NULL,
  occurrence_id TEXT NOT NULL REFERENCES workout_occurrences(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'working',
  target_reps TEXT,
  weight_kg REAL,
  reps INTEGER,
  rir REAL,
  rpe REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  client_mutation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX workout_occurrence_sets_unique ON workout_occurrence_sets(occurrence_id,exercise_id,set_index);
CREATE UNIQUE INDEX workout_occurrence_sets_mutation_unique ON workout_occurrence_sets(user_id,client_mutation_id);
CREATE INDEX workout_occurrence_sets_user_time_idx ON workout_occurrence_sets(user_id,updated_at);

CREATE TABLE coach_action_executions (
  id TEXT PRIMARY KEY NOT NULL,
  action_id TEXT NOT NULL UNIQUE REFERENCES coach_action_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  executed_at TEXT NOT NULL
);

CREATE TABLE coach_memories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  confidence REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,memory_key)
);

CREATE TABLE coach_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  coaching_mode TEXT NOT NULL DEFAULT 'personalized',
  tone TEXT NOT NULL DEFAULT 'supportive',
  proactive_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE coach_conversation_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  through_message_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX coach_summaries_conversation_time_idx ON coach_conversation_summaries(conversation_id,created_at);

CREATE TABLE coach_daily_briefs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  data_freshness_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,local_date)
);

CREATE TABLE coach_checkins (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_id TEXT REFERENCES workout_occurrences(id) ON DELETE SET NULL,
  energy INTEGER NOT NULL,
  soreness INTEGER NOT NULL,
  pain INTEGER NOT NULL,
  available_minutes INTEGER NOT NULL,
  note TEXT,
  recommendation_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX coach_checkins_user_time_idx ON coach_checkins(user_id,created_at);

CREATE TABLE coach_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES coach_messages(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,message_id)
);

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  url TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active',
  reviewed_at TEXT NOT NULL
);

CREATE TABLE knowledge_articles (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  keywords TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reviewed_at TEXT NOT NULL
);
CREATE INDEX knowledge_articles_topic_idx ON knowledge_articles(topic);

CREATE TABLE coach_evaluation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  task TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  schema_valid INTEGER NOT NULL DEFAULT 0,
  safety_passed INTEGER NOT NULL DEFAULT 0,
  action_valid INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX coach_evaluations_task_time_idx ON coach_evaluation_runs(task,created_at);

INSERT OR IGNORE INTO knowledge_sources (id,title,publisher,url,locale,status,reviewed_at) VALUES
  ('acsm-resistance-2026','Resistance Training Guidelines Update','ACSM','https://acsm.org/resistance-training-guidelines-update-2026/','en','active','2026-08-01'),
  ('who-physical-activity','WHO Guidelines on Physical Activity and Sedentary Behaviour','WHO','https://www.who.int/publications/i/item/9789240015128','en','active','2026-08-01'),
  ('odphp-physical-activity','Physical Activity Guidelines for Americans','ODPHP','https://health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines','en','active','2026-08-01');

INSERT OR IGNORE INTO knowledge_articles (id,source_id,topic,title,summary,keywords,status,reviewed_at) VALUES
  ('kb-resistance-consistency','acsm-resistance-2026','training','持续执行与渐进训练','阻力训练计划应优先保证可持续执行，再根据训练表现逐步调整训练量和负荷。','力量 阻力训练 增肌 组数 次数 渐进 训练频率','active','2026-08-01'),
  ('kb-activity-baseline','who-physical-activity','activity','一般成年人身体活动建议','规律身体活动和减少久坐对一般健康有益；具体训练应结合个人能力逐步建立。','步数 步行 有氧 久坐 活动量 减脂','active','2026-08-01'),
  ('kb-activity-safety','odphp-physical-activity','safety','循序渐进与安全活动','从适合当前能力的活动量开始，逐步增加时长或强度，并在异常症状时停止。','新手 安全 强度 恢复 疼痛','active','2026-08-01');

INSERT OR IGNORE INTO site_settings (key,value_json,updated_by,updated_at) VALUES
  ('free_coach_message_limit','10','system',CURRENT_TIMESTAMP),
  ('coach_memory_enabled','true','system',CURRENT_TIMESTAMP);
