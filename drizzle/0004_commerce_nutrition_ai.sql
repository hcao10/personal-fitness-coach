ALTER TABLE sessions ADD COLUMN cmine_access_token TEXT;
ALTER TABLE sessions ADD COLUMN cmine_refresh_token TEXT;
ALTER TABLE sessions ADD COLUMN cmine_token_expires_at TEXT;
ALTER TABLE sessions ADD COLUMN cmine_checked_at TEXT;

ALTER TABLE generation_runs ADD COLUMN task TEXT NOT NULL DEFAULT 'training_plan';
ALTER TABLE generation_runs ADD COLUMN provider TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE generation_runs ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE generation_runs ADD COLUMN cache_hit INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  external_customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  external_subscription_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  last_event_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

CREATE TABLE IF NOT EXISTS billing_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT NOT NULL,
  object_id TEXT,
  amount_total INTEGER,
  currency TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS billing_events_time_idx ON billing_events(received_at);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, capability)
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id);

CREATE TABLE IF NOT EXISTS feature_usage (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  period_key TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, capability, period_key)
);
CREATE INDEX IF NOT EXISTS feature_usage_user_idx ON feature_usage(user_id);

CREATE TABLE IF NOT EXISTS meal_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  eaten_at TEXT NOT NULL,
  note TEXT,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meal_logs_user_time_idx ON meal_logs(user_id, eaten_at);

CREATE TABLE IF NOT EXISTS meal_images (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  retention_until TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meal_images_user_idx ON meal_images(user_id);

CREATE TABLE IF NOT EXISTS meal_items (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grams REAL NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  confidence REAL,
  user_corrected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meal_items_meal_idx ON meal_items(meal_id);

CREATE TABLE IF NOT EXISTS meal_analysis_runs (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  confidence REAL,
  latency_ms INTEGER NOT NULL,
  error_code TEXT,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meal_analysis_time_idx ON meal_analysis_runs(created_at);

CREATE TABLE IF NOT EXISTS nutrition_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS nutrition_cache_expiry_idx ON nutrition_cache(expires_at);

CREATE TABLE IF NOT EXISTS ai_routes (
  id TEXT PRIMARY KEY NOT NULL,
  task TEXT NOT NULL,
  tier TEXT NOT NULL,
  priority INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(task, tier, priority)
);
CREATE INDEX IF NOT EXISTS ai_routes_task_idx ON ai_routes(task, tier);

CREATE TABLE IF NOT EXISTS ai_request_cache (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, task, input_hash)
);
CREATE INDEX IF NOT EXISTS ai_request_cache_expiry_idx ON ai_request_cache(expires_at);

CREATE TABLE IF NOT EXISTS reward_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  signature_valid INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reward_events_user_time_idx ON reward_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS point_redemptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward TEXT NOT NULL,
  points_spent INTEGER NOT NULL,
  usage_capability TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS point_redemptions_user_time_idx ON point_redemptions(user_id, created_at);

INSERT OR IGNORE INTO ai_routes (id, task, tier, priority, provider, model, enabled, updated_at) VALUES
  ('route-plan-free-primary', 'training_plan', 'free', 1, 'cloudflare', '@cf/meta/llama-3.1-8b-instruct-fast', 1, CURRENT_TIMESTAMP),
  ('route-plan-free-fallback', 'training_plan', 'free', 2, 'openai', 'gpt-5.6', 1, CURRENT_TIMESTAMP),
  ('route-plan-pro-primary', 'training_plan', 'pro', 1, 'cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1, CURRENT_TIMESTAMP),
  ('route-plan-pro-fallback', 'training_plan', 'pro', 2, 'openai', 'gpt-5.6', 1, CURRENT_TIMESTAMP),
  ('route-vision-primary', 'meal_vision', 'free', 1, 'cloudflare', '@cf/meta/llama-3.2-11b-vision-instruct', 1, CURRENT_TIMESTAMP),
  ('route-vision-escalate', 'meal_vision', 'free', 2, 'cloudflare', '@cf/moonshotai/kimi-k2.6', 1, CURRENT_TIMESTAMP),
  ('route-coach-pro', 'coach_chat', 'pro', 1, 'cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO site_settings (key, value_json, updated_by, updated_at) VALUES
  ('ai_daily_warning_usd', '3', 'system', CURRENT_TIMESTAMP),
  ('ai_daily_hard_usd', '5', 'system', CURRENT_TIMESTAMP),
  ('ai_monthly_warning_usd', '30', 'system', CURRENT_TIMESTAMP),
  ('ai_monthly_hard_usd', '50', 'system', CURRENT_TIMESTAMP),
  ('free_plan_limit', '2', 'system', CURRENT_TIMESTAMP),
  ('free_meal_scan_limit', '5', 'system', CURRENT_TIMESTAMP),
  ('pro_plan_limit', '30', 'system', CURRENT_TIMESTAMP),
  ('pro_meal_scan_limit', '100', 'system', CURRENT_TIMESTAMP),
  ('pro_coach_message_limit', '200', 'system', CURRENT_TIMESTAMP);
