-- Remove fabricated model IDs seeded by 0004 and give the free tier a real
-- coach_chat route. 'gpt-5.6' and '@cf/moonshotai/kimi-k2.6' do not exist in
-- any provider catalog; routes referencing them are disabled (kept for audit)
-- and OpenAI fallbacks now require an explicitly configured OPENAI_MODEL.
UPDATE ai_routes SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE model = 'gpt-5.6';
UPDATE ai_routes SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE model = '@cf/moonshotai/kimi-k2.6';

INSERT OR IGNORE INTO ai_routes (id, task, tier, priority, provider, model, enabled, updated_at) VALUES
  ('route-coach-free', 'coach_chat', 'free', 1, 'cloudflare', '@cf/meta/llama-3.1-8b-instruct-fast', 1, CURRENT_TIMESTAMP);
