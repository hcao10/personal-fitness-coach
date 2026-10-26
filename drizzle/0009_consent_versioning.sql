-- Consent records must carry the accepted document versions, timezone and
-- product version so material updates can force re-confirmation (see
-- docs/LEGAL_DISCLAIMER.zh-CN.md §8).
ALTER TABLE consents ADD COLUMN timezone TEXT;
ALTER TABLE consents ADD COLUMN product_version TEXT;
ALTER TABLE consents ADD COLUMN privacy_version TEXT;

INSERT OR IGNORE INTO site_settings (key, value_json, updated_by, updated_at) VALUES
  ('privacy_version', '"privacy-v1"', 'system', CURRENT_TIMESTAMP);
