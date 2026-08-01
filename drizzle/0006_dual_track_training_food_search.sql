CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY NOT NULL,
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
CREATE UNIQUE INDEX workout_sets_plan_day_exercise_set_unique ON workout_sets(user_id,plan_id,day_index,exercise_id,set_index);
CREATE UNIQUE INDEX workout_sets_user_mutation_unique ON workout_sets(user_id,client_mutation_id);
CREATE INDEX workout_sets_user_time_idx ON workout_sets(user_id,updated_at);

CREATE TABLE coach_record_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL REFERENCES coach_action_proposals(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX coach_record_drafts_action_unique ON coach_record_drafts(action_id);
CREATE INDEX coach_record_drafts_user_status_idx ON coach_record_drafts(user_id,status);

CREATE TABLE canonical_foods (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_name TEXT NOT NULL,
  display_name_zh TEXT,
  display_name_en TEXT NOT NULL,
  category TEXT,
  region TEXT,
  source_kind TEXT NOT NULL,
  data_quality REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX canonical_foods_name_idx ON canonical_foods(canonical_name,status);
CREATE INDEX canonical_foods_region_idx ON canonical_foods(region,status);

CREATE TABLE food_source_records (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_revision TEXT,
  brand TEXT,
  locale TEXT,
  payload_json TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX food_source_records_source_ref_unique ON food_source_records(source,source_ref);
CREATE INDEX food_source_records_canonical_idx ON food_source_records(canonical_food_id);

CREATE TABLE food_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'synonym'
);
CREATE UNIQUE INDEX food_aliases_locale_alias_unique ON food_aliases(locale,normalized_alias,canonical_food_id);
CREATE INDEX food_aliases_search_idx ON food_aliases(normalized_alias,locale);

CREATE TABLE food_portions (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  grams REAL NOT NULL,
  locale TEXT,
  source_record_id TEXT REFERENCES food_source_records(id) ON DELETE SET NULL
);
CREATE INDEX food_portions_food_idx ON food_portions(canonical_food_id);

CREATE TABLE food_nutrients (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  source_record_id TEXT REFERENCES food_source_records(id) ON DELETE SET NULL,
  basis_grams REAL NOT NULL DEFAULT 100,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  fiber_g REAL,
  sodium_mg REAL,
  calculation_method TEXT NOT NULL DEFAULT 'source',
  updated_at TEXT NOT NULL
);
CREATE INDEX food_nutrients_food_idx ON food_nutrients(canonical_food_id);

CREATE TABLE food_source_licenses (
  source TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  license_name TEXT NOT NULL,
  license_url TEXT NOT NULL,
  attribution_text TEXT,
  commercial_use INTEGER NOT NULL DEFAULT 0,
  redistribution INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_review',
  last_verified_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE food_import_runs (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  source_revision TEXT,
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX food_import_runs_source_time_idx ON food_import_runs(source,started_at);

CREATE TABLE food_corrections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_food_id TEXT,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  correction_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX food_corrections_status_time_idx ON food_corrections(status,created_at);

CREATE TABLE food_search_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  query_hash TEXT NOT NULL,
  locale TEXT NOT NULL,
  region TEXT,
  result_count INTEGER NOT NULL,
  selected_ref TEXT,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX food_search_events_time_idx ON food_search_events(created_at);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  servings REAL NOT NULL DEFAULT 1,
  cooked_weight_g REAL,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX recipes_user_time_idx ON recipes(user_id,updated_at);

CREATE TABLE recipe_items (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grams REAL NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX recipe_items_recipe_idx ON recipe_items(recipe_id);

CREATE TABLE meal_templates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  items_json TEXT NOT NULL,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX meal_templates_user_time_idx ON meal_templates(user_id,updated_at);

INSERT OR REPLACE INTO food_source_licenses
  (source,title,license_name,license_url,attribution_text,commercial_use,redistribution,status,last_verified_at,updated_at)
VALUES
  ('usda','USDA FoodData Central','Public Domain','https://fdc.nal.usda.gov/data-documentation.html','Data from USDA FoodData Central',1,1,'verified',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('open_food_facts','Open Food Facts','ODbL 1.0','https://opendatacommons.org/licenses/odbl/1-0/','Data from Open Food Facts contributors',1,1,'verified',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('user','User-entered food','User content','https://fit.chwjh.com/terms','Provided by the account owner',1,0,'verified',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cnf','Canadian Nutrient File','Open Government Licence - Canada','https://open.canada.ca/en/open-government-licence-canada','Contains information licensed under the Open Government Licence – Canada',1,1,'pending_review',NULL,CURRENT_TIMESTAMP),
  ('cofid','UK CoFID','Open Government Licence','https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/','Contains public sector information licensed under the OGL v3.0',0,0,'pending_review',NULL,CURRENT_TIMESTAMP),
  ('ausnut','AUSNUT','Licence review required','https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut/data-files',NULL,0,0,'pending_review',NULL,CURRENT_TIMESTAMP),
  ('ciqual','ANSES-CIQUAL','Licence review required','https://ciqual.anses.fr/',NULL,0,0,'pending_review',NULL,CURRENT_TIMESTAMP);
