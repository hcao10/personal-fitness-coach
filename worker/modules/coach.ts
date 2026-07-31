import { coachSafetyFlags } from "../../packages/domain/src";
import type { WorkerEnv } from "../platform";
import type { StoredUser } from "../db";
import { profileForUser, recordGenerationRun } from "../db";
import { generateCoachChat } from "../llm";
import { consumeCapability, refundCapability, tierForUser } from "../product";

function parseJson<T>(value: string | null): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }

export async function listConversations(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const rows = await env.DB.prepare(`SELECT id, title, status, created_at, updated_at FROM coach_conversations
    WHERE user_id=? ORDER BY updated_at DESC LIMIT 30`).bind(userId)
    .all<{ id: string; title: string; status: string; created_at: string; updated_at: string }>();
  return (rows.results || []).map((row) => ({ id: row.id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function createConversation(env: WorkerEnv, userId: string, title = "新的对话") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO coach_conversations (id,user_id,title,status,created_at,updated_at)
    VALUES (?,?,?,'active',?,?)`).bind(id, userId, title.trim().slice(0, 80) || "新的对话", now, now).run();
  return { id, title: title.trim().slice(0, 80) || "新的对话", status: "active", createdAt: now, updatedAt: now };
}

async function ownedConversation(env: WorkerEnv, userId: string, conversationId: string) {
  return env.DB?.prepare("SELECT id, summary FROM coach_conversations WHERE id=? AND user_id=?")
    .bind(conversationId, userId).first<{ id: string; summary: string | null }>();
}

export async function conversationMessages(env: WorkerEnv, userId: string, conversationId: string, before?: string | null) {
  if (!env.DB || !await ownedConversation(env, userId, conversationId)) throw new Error("CONVERSATION_NOT_FOUND");
  const rows = await env.DB.prepare(`SELECT m.id,m.role,m.content,m.created_at FROM coach_messages m
    WHERE m.conversation_id=? AND m.user_id=? ${before ? "AND m.created_at < ?" : ""}
    ORDER BY m.created_at DESC LIMIT 50`).bind(...(before ? [conversationId, userId, before] : [conversationId, userId]))
    .all<{ id: string; role: "user" | "assistant"; content: string; created_at: string }>();
  const messages = [...(rows.results || [])].reverse();
  const ids = messages.map((item) => item.id);
  let actions: Array<{ id: string; message_id: string; action_type: string; payload_json: string; status: string }> = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT id,message_id,action_type,payload_json,status FROM coach_action_proposals
      WHERE user_id=? AND message_id IN (${placeholders})`).bind(userId, ...ids).all<typeof actions[number]>();
    actions = result.results || [];
  }
  return messages.map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.created_at,
    actions: actions.filter((action) => action.message_id === message.id).map((action) => ({ id: action.id, type: action.action_type, status: action.status, payload: parseJson<Record<string, unknown>>(action.payload_json) || {} })) }));
}

async function buildContext(env: WorkerEnv, user: StoredUser) {
  const now = new Date(); const since = new Date(now.getTime() - 28 * 86400_000).toISOString();
  const [profile, plan, workouts, measurements] = await Promise.all([
    profileForUser(env, user.id),
    env.DB!.prepare(`SELECT id, plan_json, created_at FROM plans WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).bind(user.id).first<{ id: string; plan_json: string; created_at: string }>(),
    env.DB!.prepare(`SELECT day_index,status,duration_minutes,rpe,pain,notes,completed_at FROM workout_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 40`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT weight_kg,body_fat_pct,waist_cm,arm_cm,measured_at FROM measurements
      WHERE user_id=? ORDER BY measured_at DESC LIMIT 12`).bind(user.id).all(),
  ]);
  return { locale: user.locale, timezone: user.timezone, profile, activePlan: plan ? { id: plan.id, plan: parseJson(plan.plan_json), createdAt: plan.created_at } : null,
    recentWorkouts: workouts.results || [], recentMeasurements: measurements.results || [] };
}

export async function sendCoachMessage(env: WorkerEnv, user: StoredUser, conversationId: string, input: {
  message: string; clientMutationId?: string | null;
}) {
  if (!env.DB || !await ownedConversation(env, user.id, conversationId)) throw new Error("CONVERSATION_NOT_FOUND");
  const message = input.message.trim().slice(0, 2000);
  if (!message) throw new Error("MESSAGE_REQUIRED");
  if (input.clientMutationId) {
    const duplicate = await env.DB.prepare("SELECT id FROM coach_messages WHERE user_id=? AND client_mutation_id=?")
      .bind(user.id, input.clientMutationId).first<{ id: string }>();
    if (duplicate) {
      const messages = await conversationMessages(env, user.id, conversationId);
      const assistantMessage = [...messages].reverse().find((item) => item.role === "assistant") || { id: duplicate.id, role: "assistant" as const, content: "", createdAt: new Date().toISOString(), actions: [] };
      return { duplicate: true, userMessage: null, assistantMessage };
    }
  }
  const now = new Date().toISOString(); const userMessageId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO coach_messages (id,conversation_id,user_id,role,content,client_mutation_id,created_at)
    VALUES (?,?,?,'user',?,?,?)`).bind(userMessageId, conversationId, user.id, message, input.clientMutationId || null, now).run();
  const flags = coachSafetyFlags(message);
  let result: Awaited<ReturnType<typeof generateCoachChat>> | null = null;
  let reply = flags.highRisk ? flags.message! : "";
  const started = Date.now();
  if (!flags.highRisk) {
    const quota = await consumeCapability(env, user.id, "coach.chat");
    if (!quota.ok) throw new Error("COACH_LIMIT_REACHED");
    try {
      const history = (await conversationMessages(env, user.id, conversationId)).slice(-12).map((item) => ({ role: item.role, content: item.content }));
      result = await generateCoachChat(env, { message, locale: user.locale === "en" ? "en" : "zh", context: await buildContext(env, user), history, safetyIdentifier: user.id }, await tierForUser(env, user.id));
      reply = result.reply;
    } catch (error) { await refundCapability(env, user.id, "coach.chat"); throw error; }
  }
  const assistantId = crypto.randomUUID(); const completedAt = new Date().toISOString();
  const statements = [
    env.DB.prepare(`INSERT INTO coach_messages (id,conversation_id,user_id,role,content,created_at) VALUES (?,?,?,'assistant',?,?)`)
      .bind(assistantId, conversationId, user.id, reply, completedAt),
    env.DB.prepare("UPDATE coach_conversations SET updated_at=?, title=CASE WHEN title='新的对话' THEN ? ELSE title END WHERE id=?")
      .bind(completedAt, message.slice(0, 36), conversationId),
  ];
  await env.DB.batch(statements);
  const actions = [];
  for (const action of result?.actions || []) {
    const id = crypto.randomUUID(); const payload = { title: action.title, description: action.description };
    await env.DB.prepare(`INSERT INTO coach_action_proposals
      (id,conversation_id,message_id,user_id,action_type,payload_json,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)`)
      .bind(id, conversationId, assistantId, user.id, action.type, JSON.stringify(payload), completedAt).run();
    actions.push({ id, type: action.type, status: "pending", payload });
  }
  if (result) await recordGenerationRun(env, { userId: user.id, status: "succeeded", model: result.model, latencyMs: Date.now() - started,
    requestId: result.requestId, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    task: "coach_chat", provider: result.provider, estimatedCostUsd: result.estimatedCostUsd });
  return { duplicate: false, userMessage: { id: userMessageId, role: "user", content: message, createdAt: now },
    assistantMessage: { id: assistantId, role: "assistant", content: reply, createdAt: completedAt, actions } };
}

export async function decideCoachAction(env: WorkerEnv, userId: string, actionId: string, decision: "accepted" | "rejected") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const action = await env.DB.prepare(`SELECT id,action_type,payload_json,status FROM coach_action_proposals WHERE id=? AND user_id=?`)
    .bind(actionId, userId).first<{ id: string; action_type: string; payload_json: string; status: string }>();
  if (!action) throw new Error("ACTION_NOT_FOUND");
  if (action.status !== "pending") return { id: action.id, status: action.status, duplicate: true };
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE coach_action_proposals SET status=?,decided_at=? WHERE id=? AND user_id=?")
    .bind(decision, now, actionId, userId).run();
  if (decision === "accepted" && ["plan_adjustment", "schedule_review"].includes(action.action_type)) {
    const monday = new Date(); const day = (monday.getUTCDay() + 6) % 7; monday.setUTCDate(monday.getUTCDate() - day); monday.setUTCHours(0, 0, 0, 0);
    await env.DB.prepare(`INSERT OR IGNORE INTO weekly_reviews (id,user_id,week_start,status,created_at,updated_at)
      VALUES (?,?,?,'due',?,?)`).bind(crypto.randomUUID(), userId, monday.toISOString().slice(0, 10), now, now).run();
  }
  return { id: action.id, type: action.action_type, status: decision, payload: parseJson(action.payload_json), createdDraft: decision === "accepted" };
}
