CREATE TABLE IF NOT EXISTS workout_completions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE(user_id, plan_id, day_index, exercise_id)
);
CREATE INDEX IF NOT EXISTS workout_completions_user_time_idx ON workout_completions(user_id, completed_at);

