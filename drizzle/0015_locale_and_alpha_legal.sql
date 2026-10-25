INSERT INTO site_settings (key, value_json, updated_by, updated_at)
VALUES
  ('disclaimer_version', '"health-v3"', 'system', CURRENT_TIMESTAMP),
  ('privacy_version', '"privacy-v2"', 'system', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value_json = excluded.value_json,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;
