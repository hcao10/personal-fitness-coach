import * as SQLite from "expo-sqlite";
import type { SyncMutation } from "../../../packages/api-contracts/src";
import { api } from "./api";

const dbPromise = SQLite.openDatabaseAsync("cmine-fit.db");
export async function initializeOfflineStore() { const db = await dbPromise; await db.execAsync(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sync_outbox (mutation_id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sync_dead_letter (mutation_id TEXT PRIMARY KEY, value_json TEXT NOT NULL, reason TEXT NOT NULL, moved_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  // Older installs created sync_outbox without the attempts column.
  try { await db.execAsync("ALTER TABLE sync_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0"); } catch { /* column exists */ } }
export async function cacheValue(key: string, value: unknown) { const db = await dbPromise; await db.runAsync("INSERT INTO cache(key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at", key, JSON.stringify(value), new Date().toISOString()); }
export async function cachedValue<T>(key: string): Promise<T | null> { const db = await dbPromise; const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM cache WHERE key=?", key); return row ? JSON.parse(row.value_json) as T : null; }
export async function enqueue(mutation: SyncMutation) { const db = await dbPromise; await db.runAsync("INSERT OR IGNORE INTO sync_outbox(mutation_id,value_json,created_at) VALUES (?,?,?)", mutation.mutationId, JSON.stringify(mutation), new Date().toISOString()); }
const MAX_SYNC_ATTEMPTS = 8;
export async function synchronize() { const db = await dbPromise; const rows = await db.getAllAsync<{ mutation_id: string; value_json: string; attempts: number }>("SELECT mutation_id,value_json,attempts FROM sync_outbox ORDER BY created_at LIMIT 50"); const mutations = rows.map((row) => JSON.parse(row.value_json) as SyncMutation); if (mutations.length) { const result = await api<{ results: Array<{ mutationId: string; status: string; error?: string }>; cursor: number }>("/api/v1/sync/batch", { method: "POST", body: JSON.stringify({ mutations }) });
    for (const item of result.results) {
      if (!item.mutationId) continue;
      if (item.status === "applied" || item.status === "duplicate") { await db.runAsync("DELETE FROM sync_outbox WHERE mutation_id=?", item.mutationId); continue; }
      if (item.status === "rejected" || item.status === "invalid") {
        // Terminal server verdict: keep the payload for inspection but stop retrying.
        await db.runAsync("INSERT OR IGNORE INTO sync_dead_letter(mutation_id,value_json,reason,moved_at) SELECT mutation_id,value_json,?,? FROM sync_outbox WHERE mutation_id=?", item.error || item.status, new Date().toISOString(), item.mutationId);
        await db.runAsync("DELETE FROM sync_outbox WHERE mutation_id=?", item.mutationId); continue;
      }
    }
    // Everything sent this round that was not resolved above (including entries
    // the server answered with mutationId=null) accrues an attempt.
    const sentIds = rows.map((row) => row.mutation_id);
    if (sentIds.length) await db.runAsync(`UPDATE sync_outbox SET attempts=attempts+1 WHERE mutation_id IN (${sentIds.map(() => "?").join(",")})`, ...sentIds);
    await db.runAsync("INSERT INTO sync_dead_letter(mutation_id,value_json,reason,moved_at) SELECT mutation_id,value_json,'max_attempts',? FROM sync_outbox WHERE attempts>=? AND mutation_id NOT IN (SELECT mutation_id FROM sync_dead_letter)", new Date().toISOString(), MAX_SYNC_ATTEMPTS);
    await db.runAsync("DELETE FROM sync_outbox WHERE attempts>=?", MAX_SYNC_ATTEMPTS);
    await db.runAsync("INSERT INTO sync_state(key,value) VALUES ('cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(result.cursor)); }
  const state = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key='cursor'"); const changes = await api<{ events: unknown[]; cursor: number }>(`/api/v1/sync/changes?cursor=${encodeURIComponent(state?.value || "0")}`); await cacheValue("server_changes", changes.events); await db.runAsync("INSERT INTO sync_state(key,value) VALUES ('cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(changes.cursor)); return changes; }
