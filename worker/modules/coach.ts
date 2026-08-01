import { coachSafetyFlags } from "../../packages/domain/src";
import { EXERCISES, isExerciseAllowed, type CoachPlan, type Profile } from "../../packages/coach-core/src";
import type { WorkerEnv } from "../platform";
import type { StoredUser } from "../db";
import { activeCycleForUser, localDateInTimezone, occurrenceForDate, profileForUser, recordGenerationRun, rescheduleOccurrence, savePlan, setOccurrenceMode } from "../db";
import { generateCoachChat } from "../llm";
import { consumeCapability, refundCapability } from "../product";
import { coachMemorySnapshot, knowledgeForQuestion, updateConversationSummary } from "./coach-orchestrator";

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
  const rows = await env.DB.prepare(`SELECT m.id,m.role,m.content,m.metadata_json,m.created_at FROM coach_messages m
    WHERE m.conversation_id=? AND m.user_id=? ${before ? "AND m.created_at < ?" : ""}
    ORDER BY m.created_at DESC LIMIT 50`).bind(...(before ? [conversationId, userId, before] : [conversationId, userId]))
    .all<{ id: string; role: "user" | "assistant"; content: string; metadata_json: string; created_at: string }>();
  const messages = [...(rows.results || [])].reverse();
  const ids = messages.map((item) => item.id);
  let actions: Array<{ id: string; message_id: string; action_type: string; payload_json: string; status: string; base_version_id: string | null; expires_at: string | null }> = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT id,message_id,action_type,payload_json,status,base_version_id,expires_at FROM coach_action_proposals
      WHERE user_id=? AND message_id IN (${placeholders})`).bind(userId, ...ids).all<typeof actions[number]>();
    actions = result.results || [];
  }
  return messages.map((message) => { const metadata = parseJson<{ intent?: string; basis?: unknown[]; limitations?: string[]; sources?: unknown[] }>(message.metadata_json) || {};
    return { id: message.id, role: message.role, content: message.content, createdAt: message.created_at, ...metadata,
      actions: actions.filter((action) => action.message_id === message.id).map((action) => ({ id: action.id, type: action.action_type, status: action.status, payload: parseJson<Record<string, unknown>>(action.payload_json) || {}, baseVersionId: action.base_version_id, expiresAt: action.expires_at })) };
  });
}

async function buildContext(env: WorkerEnv, user: StoredUser, conversationId: string, tier: "free" | "pro") {
  const now = new Date(); const since = new Date(now.getTime() - 28 * 86400_000).toISOString();
  const nutritionSince = new Date(now.getTime() - 14 * 86400_000).toISOString();
  const [profile, cycle, occurrenceWorkouts, legacyWorkouts, measurements, workoutSets, nutrition, reviews, health, memory, conversationSummary] = await Promise.all([
    profileForUser(env, user.id),
    activeCycleForUser(env, user.id),
    env.DB!.prepare(`SELECT o.day_index,s.status,s.duration_minutes,s.rpe,s.pain,s.notes,s.completed_at FROM workout_occurrence_sessions s
      JOIN workout_occurrences o ON o.id=s.occurrence_id WHERE s.user_id=? AND s.updated_at>=? ORDER BY s.updated_at DESC LIMIT 40`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT day_index,status,duration_minutes,rpe,pain,notes,completed_at FROM workout_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 40`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT weight_kg,body_fat_pct,waist_cm,arm_cm,measured_at FROM measurements
      WHERE user_id=? ORDER BY measured_at DESC LIMIT 12`).bind(user.id).all(),
    env.DB!.prepare(`SELECT exercise_id,set_index,set_type,weight_kg,reps,rir,rpe,completed,updated_at FROM workout_occurrence_sets
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 160`).bind(user.id, since).all(),
    env.DB!.prepare(`SELECT substr(eaten_at,1,10) AS day,SUM(calories) AS calories,SUM(protein_g) AS protein_g,SUM(carbs_g) AS carbs_g,SUM(fat_g) AS fat_g
      FROM meal_logs WHERE user_id=? AND status='confirmed' AND eaten_at>=? GROUP BY substr(eaten_at,1,10) ORDER BY day DESC`).bind(user.id, nutritionSince).all(),
    env.DB!.prepare(`SELECT week_start,status,metrics_json,recommendation_json FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC LIMIT 4`).bind(user.id).all(),
    env.DB!.prepare(`SELECT type,value,unit,observed_at,source_name FROM health_observations WHERE user_id=? AND observed_at>=?
      ORDER BY observed_at DESC LIMIT 20`).bind(user.id, since).all(),
    coachMemorySnapshot(env, user.id),
    env.DB!.prepare("SELECT summary FROM coach_conversations WHERE id=? AND user_id=?").bind(conversationId, user.id).first<{ summary: string | null }>(),
  ]);
  if (memory.preferences.coachingMode === "education") return { locale: user.locale, timezone: user.timezone, coachingMode: "education", tone: memory.preferences.tone,
    profile: null, activePlan: null, recentWorkouts: [], recentWorkoutSets: [], recentMeasurements: [], nutrition14Days: [], recentReviews: [], healthSummaries: [], coachMemory: [], conversationSummary: null };
  const workouts = Number(occurrenceWorkouts.results?.length || 0) ? occurrenceWorkouts : legacyWorkouts;
  return { locale: user.locale, timezone: user.timezone, profile, activePlan: cycle ? { id: cycle.planId, versionId: cycle.versionId, startDate: cycle.startDate, phaseWeeks: cycle.phaseWeeks, plan: cycle.plan } : null,
    recentWorkouts: workouts.results || [], recentWorkoutSets: workoutSets.results || [], recentMeasurements: measurements.results || [],
    nutrition14Days: nutrition.results || [], recentReviews: (reviews.results || []).map((row) => ({ ...row,
      metrics_json: parseJson(String((row as Record<string, unknown>).metrics_json || "")), recommendation_json: parseJson(String((row as Record<string, unknown>).recommendation_json || "")) })),
    healthSummaries: health.results || [], coachMemory: tier === "pro" && memory.preferences.memoryEnabled ? memory.memories.slice(0, 20) : [], coachingMode: memory.preferences.coachingMode, tone: memory.preferences.tone,
    conversationSummary: conversationSummary?.summary || null };
}

export async function sendCoachMessage(env: WorkerEnv, user: StoredUser, conversationId: string, input: {
  message: string; clientMutationId?: string | null; onDelta?: (delta: string) => void;
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
  const knowledge = await knowledgeForQuestion(env, message);
  if (flags.highRisk) {
    await env.DB.prepare(`INSERT INTO coach_evaluation_runs (id,task,provider,model,schema_valid,safety_passed,action_valid,latency_ms,detail_json,created_at)
      VALUES (?,'coach_consult','rules','safety-policy',1,0,1,0,?,?)`).bind(crypto.randomUUID(), JSON.stringify({ blocked: true, pain: flags.pain }), now).run();
  }
  if (!flags.highRisk) {
    const quota = await consumeCapability(env, user.id, "coach.chat");
    if (!quota.ok) throw new Error("COACH_LIMIT_REACHED");
    try {
      const history = (await conversationMessages(env, user.id, conversationId)).slice(-12).map((item) => ({ role: item.role, content: item.content }));
      result = await generateCoachChat(env, { message, locale: user.locale === "en" ? "en" : "zh", context: await buildContext(env, user, conversationId, quota.tier), history, knowledge, safetyIdentifier: user.id, onDelta: input.onDelta }, quota.tier);
      reply = result.reply;
    } catch (error) { await refundCapability(env, user.id, "coach.chat"); throw error; }
  }
  if (flags.highRisk && input.onDelta) input.onDelta(reply);
  const assistantId = crypto.randomUUID(); const completedAt = new Date().toISOString();
  const metadata = result ? { intent: result.intent, basis: result.basis, limitations: result.limitations,
    sources: knowledge.filter((source) => result!.sourceIds.includes(source.id)).map(({ id, title, publisher, url }) => ({ id, title, publisher, url })) }
    : { intent: "safety", basis: [], limitations: ["这不是医疗诊断。"], sources: [] };
  const statements = [
    env.DB.prepare(`INSERT INTO coach_messages (id,conversation_id,user_id,role,content,metadata_json,created_at) VALUES (?,?,?,'assistant',?,?,?)`)
      .bind(assistantId, conversationId, user.id, reply, JSON.stringify(metadata), completedAt),
    env.DB.prepare("UPDATE coach_conversations SET updated_at=?, title=CASE WHEN title='新的对话' THEN ? ELSE title END WHERE id=?")
      .bind(completedAt, message.slice(0, 36), conversationId),
  ];
  await env.DB.batch(statements);
  const actions = [];
  const activeCycle = await activeCycleForUser(env, user.id);
  for (const action of result?.actions || []) {
    const id = crypto.randomUUID(); const payload = { title: action.title, description: action.description, before: action.before, after: action.after,
      reason: action.reason, impact: action.impact, reversible: action.reversible, exerciseId: action.exercise_id || null,
      replacementExerciseId: action.replacement_exercise_id || null, durationMinutes: action.duration_minutes || null,
      targetDate: action.target_date || null, loadMultiplier: action.load_multiplier || null, setMultiplier: action.set_multiplier || null };
    const expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
    await env.DB.prepare(`INSERT INTO coach_action_proposals
      (id,conversation_id,message_id,user_id,action_type,payload_json,base_version_id,reason_codes_json,impact_json,reversible,expires_at,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?)`)
      .bind(id, conversationId, assistantId, user.id, action.type, JSON.stringify(payload), activeCycle?.versionId || null,
        JSON.stringify([action.reason]), JSON.stringify(action.impact), action.reversible ? 1 : 0, expiresAt, completedAt).run();
    actions.push({ id, type: action.type, status: "pending", payload, baseVersionId: activeCycle?.versionId || null, expiresAt });
  }
  if (result) await recordGenerationRun(env, { userId: user.id, status: "succeeded", model: result.model, latencyMs: Date.now() - started,
    requestId: result.requestId, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
    task: "coach_chat", provider: result.provider, estimatedCostUsd: result.estimatedCostUsd });
  if (result) await env.DB.prepare(`INSERT INTO coach_evaluation_runs (id,task,provider,model,schema_valid,safety_passed,action_valid,latency_ms,detail_json,created_at)
    VALUES (?,'coach_consult',?,?,1,1,1,?,'{}',?)`).bind(crypto.randomUUID(), result.provider, result.model, Date.now() - started, completedAt).run();
  await updateConversationSummary(env, user.id, conversationId).catch(() => undefined);
  return { duplicate: false, userMessage: { id: userMessageId, role: "user", content: message, createdAt: now },
    assistantMessage: { id: assistantId, role: "assistant", content: reply, createdAt: completedAt, actions, ...metadata } };
}

function adjustedPlanForAction(plan: CoachPlan, profile: Profile, type: string, payload: Record<string, unknown>): CoachPlan {
  const next = structuredClone(plan);
  if (type === "replace_exercise") {
    const exerciseId = String(payload.exerciseId || ""); const replacementId = String(payload.replacementExerciseId || "");
    const replacement = EXERCISES[replacementId];
    if (!exerciseId || !replacement || !isExerciseAllowed(replacement, profile.equipment)) throw new Error("INVALID_EXERCISE_REPLACEMENT");
    let changed = false;
    next.schedule = next.schedule.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => {
      if (exercise.id !== exerciseId || changed) return exercise; changed = true;
      return { ...replacement, sets: exercise.sets, reps: exercise.reps, rest: exercise.rest, restSeconds: exercise.restSeconds,
        targetRir: exercise.targetRir, progression: exercise.progression, suggestedLoadMultiplier: exercise.suggestedLoadMultiplier };
    }) }));
    if (!changed) throw new Error("EXERCISE_NOT_IN_PLAN");
  }
  if (type === "adjust_load" || type === "plan_adjustment") {
    const load = Math.max(.8, Math.min(1.05, Number(payload.loadMultiplier || 1)));
    const sets = Math.max(.8, Math.min(1.1, Number(payload.setMultiplier || 1)));
    next.schedule = next.schedule.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({
      ...exercise, sets: Math.max(2, Math.min(5, Math.round(exercise.sets * sets))), suggestedLoadMultiplier: load,
    })) }));
  }
  return next;
}

export async function decideCoachAction(env: WorkerEnv, userId: string, actionId: string, decision: "accepted" | "rejected") {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const action = await env.DB.prepare(`SELECT id,action_type,payload_json,status,base_version_id,expires_at FROM coach_action_proposals WHERE id=? AND user_id=?`)
    .bind(actionId, userId).first<{ id: string; action_type: string; payload_json: string; status: string; base_version_id: string | null; expires_at: string | null }>();
  if (!action) throw new Error("ACTION_NOT_FOUND");
  if (action.status !== "pending") return { id: action.id, status: action.status, duplicate: true };
  const now = new Date().toISOString(); const payload = parseJson<Record<string, unknown>>(action.payload_json) || {};
  if (action.expires_at && action.expires_at <= now) {
    await env.DB.prepare("UPDATE coach_action_proposals SET status='expired',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId).run();
    return { id: action.id, type: action.action_type, status: "expired", payload, duplicate: false };
  }
  if (decision === "rejected") {
    await env.DB.prepare("UPDATE coach_action_proposals SET status='rejected',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId).run();
    return { id: action.id, type: action.action_type, status: "rejected", payload, duplicate: false };
  }
  const active = await activeCycleForUser(env, userId);
  const versionedTypes = new Set(["replace_exercise", "adjust_load", "plan_adjustment"]);
  if (versionedTypes.has(action.action_type) && action.base_version_id && active?.versionId !== action.base_version_id) {
    await env.DB.prepare("UPDATE coach_action_proposals SET status='expired',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId).run();
    return { id: action.id, type: action.action_type, status: "expired", payload, error: "ACTION_STALE", duplicate: false };
  }
  let draftId: string | null = null; let draftUrl: string | null = null; let result: Record<string, unknown> = {};
  try {
    if (versionedTypes.has(action.action_type)) {
      if (!active?.plan || !active.profile) throw new Error("ACTIVE_PLAN_REQUIRED");
      const nextPlan = adjustedPlanForAction(active.plan as CoachPlan, active.profile as Profile, action.action_type, payload);
      draftId = await savePlan(env, userId, active.profile as Profile, nextPlan, "coach_action", "rules+coach", {
        startDate: active.startDate, timezone: active.timezone, changeSummary: [String(payload.after || payload.title || "Coach 建议的计划调整")],
      });
      draftUrl = "/account#plans"; result = { planId: draftId, status: "draft" };
    } else if (action.action_type === "shorten_session") {
      const occurrence = active ? await occurrenceForDate(env, userId, localDateInTimezone(active.timezone)) : null;
      if (!occurrence) throw new Error("OCCURRENCE_NOT_FOUND");
      result = await setOccurrenceMode(env, userId, occurrence.id, "short"); draftUrl = "/today";
    } else if (action.action_type === "reschedule_workout") {
      const occurrence = active ? await occurrenceForDate(env, userId, localDateInTimezone(active.timezone)) : null;
      const targetDate = String(payload.targetDate || ""); if (!occurrence || !targetDate) throw new Error("INVALID_RESCHEDULE");
      result = await rescheduleOccurrence(env, userId, occurrence.id, targetDate); draftUrl = "/today";
    } else if (action.action_type === "schedule_review") {
      if (!active) throw new Error("ACTIVE_PLAN_REQUIRED");
      const today = localDateInTimezone(active.timezone); const days = Math.max(0, Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${active.startDate}T00:00:00Z`).getTime()) / 86_400_000));
      const weekStart = new Date(new Date(`${active.startDate}T00:00:00Z`).getTime() + Math.floor(days / 7) * 7 * 86_400_000).toISOString().slice(0, 10);
      await env.DB.prepare(`INSERT OR IGNORE INTO weekly_reviews (id,user_id,cycle_id,week_start,status,created_at,updated_at) VALUES (?,?,?,?,'due',?,?)`)
        .bind(crypto.randomUUID(), userId, active.id, weekStart, now, now).run(); draftUrl = "/progress#weekly-review"; result = { weekStart };
    } else if (action.action_type === "create_meal_draft") {
      draftId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO meal_logs (id,user_id,meal_type,status,eaten_at,note,calories,protein_g,carbs_g,fat_g,created_at,updated_at)
        VALUES (?,?,'other','draft',?,?,0,0,0,0,?,?)`).bind(draftId, userId, now, String(payload.description || payload.title || "Coach 创建的餐食草稿").slice(0, 300), now, now).run();
      draftUrl = "/nutrition"; result = { mealId: draftId };
    } else if (action.action_type === "log_workout") {
      const occurrence = active ? await occurrenceForDate(env, userId, localDateInTimezone(active.timezone)) : null;
      if (!active || !occurrence) throw new Error("OCCURRENCE_NOT_FOUND");
      draftId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO workout_occurrence_sessions (id,occurrence_id,user_id,plan_id,status,notes,started_at,updated_at)
        VALUES (?,?,?,?, 'in_progress',?,?,?) ON CONFLICT(occurrence_id) DO UPDATE SET status='in_progress',notes=excluded.notes,updated_at=excluded.updated_at`)
        .bind(draftId, occurrence.id, userId, active.planId, String(payload.description || "Coach 创建的训练草稿").slice(0, 500), now, now).run();
      draftUrl = "/today"; result = { sessionId: draftId, occurrenceId: occurrence.id };
    } else if (action.action_type === "log_measurement") {
      draftId = crypto.randomUUID();
      await env.DB.prepare(`INSERT OR IGNORE INTO coach_record_drafts (id,user_id,action_id,draft_type,payload_json,status,created_at,updated_at)
        VALUES (?,?,?,'measurement',?,'draft',?,?)`).bind(draftId, userId, actionId, JSON.stringify(payload), now, now).run();
      draftUrl = "/progress#measurements"; result = { draftId };
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE coach_action_proposals SET status='accepted',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId),
      env.DB.prepare("INSERT OR IGNORE INTO coach_action_executions (id,action_id,user_id,status,result_json,executed_at) VALUES (?,?,?,'succeeded',?,?)")
        .bind(crypto.randomUUID(), actionId, userId, JSON.stringify(result), now),
    ]);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "ACTION_EXECUTION_FAILED";
    await env.DB.batch([
      env.DB.prepare("UPDATE coach_action_proposals SET status='failed',decided_at=? WHERE id=? AND user_id=?").bind(now, actionId, userId),
      env.DB.prepare("INSERT OR IGNORE INTO coach_action_executions (id,action_id,user_id,status,result_json,error_code,executed_at) VALUES (?,?,?,'failed','{}',?,?)")
        .bind(crypto.randomUUID(), actionId, userId, code, now),
    ]);
    throw new Error(code);
  }
  return { id: action.id, type: action.action_type, status: "accepted", payload, createdDraft: Boolean(draftId), draftId, draftUrl, result };
}
