import type { CoachPlan, Profile, WorkoutDay } from "../../packages/coach-core/src";
import type { CoachDailyBrief, CoachEvidence, CoachMemory } from "../../packages/api-contracts/src";
import type { StoredUser } from "../db";
import { ensureActiveOccurrences, localDateInTimezone, occurrenceForDate, profileForUser, setOccurrenceMode } from "../db";
import type { WorkerEnv } from "../platform";
import { entitlementSnapshot } from "../product";

function parseJson<T>(value: string | null | undefined): T | null { try { return value ? JSON.parse(value) as T : null; } catch { return null; } }
function clamp(value: unknown, min: number, max: number) { return Math.max(min, Math.min(max, Number(value))); }
function dateDifference(start: string, end: string) { return Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000); }

export async function knowledgeForQuestion(env: WorkerEnv, question: string) {
  if (!env.DB) return [];
  const rows = await env.DB.prepare(`SELECT a.id,a.title,a.summary,a.keywords,s.title AS source_title,s.publisher,s.url
    FROM knowledge_articles a JOIN knowledge_sources s ON s.id=a.source_id
    WHERE a.status='active' AND s.status='active' LIMIT 30`).all<{
      id: string; title: string; summary: string; keywords: string; source_title: string; publisher: string; url: string;
    }>();
  const terms = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2);
  return (rows.results || []).map((row) => {
    const haystack = `${row.title} ${row.summary} ${row.keywords}`.toLowerCase();
    return { row, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(({ row }) => ({
    id: row.id, title: row.title, summary: row.summary, publisher: row.publisher, url: row.url,
  }));
}

export async function coachHome(env: WorkerEnv, user: StoredUser) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const cycle = await ensureActiveOccurrences(env, user.id);
  const timezone = user.timezone || cycle?.timezone || "UTC";
  const localDate = localDateInTimezone(timezone);
  const occurrence = cycle ? await occurrenceForDate(env, user.id, localDate) : null;
  const plan = cycle?.plan as CoachPlan | null;
  const profile = cycle?.profile as Profile | null;
  const relativeDay = cycle ? Math.max(0, dateDifference(cycle.startDate, localDate)) : 0;
  const dayIndex = occurrence?.day_index ?? relativeDay % 7;
  const day = plan?.schedule?.[dayIndex] || null;
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const [occurrenceSessions, legacySessions, measurement, nutrition, health, pending, review, memoryCount, preferences, product] = await Promise.all([
    env.DB.prepare(`SELECT rpe,pain,duration_minutes,status,completed_at FROM workout_occurrence_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 8`).bind(user.id, since).all<{
        rpe: number | null; pain: number; duration_minutes: number | null; status: string; completed_at: string | null;
      }>(),
    env.DB.prepare(`SELECT rpe,pain,duration_minutes,status,completed_at FROM workout_sessions
      WHERE user_id=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 8`).bind(user.id, since).all<{
        rpe: number | null; pain: number; duration_minutes: number | null; status: string; completed_at: string | null;
      }>(),
    env.DB.prepare("SELECT weight_kg,measured_at FROM measurements WHERE user_id=? ORDER BY measured_at DESC LIMIT 1")
      .bind(user.id).first<{ weight_kg: number | null; measured_at: string }>(),
    env.DB.prepare(`SELECT SUM(calories) AS calories,SUM(protein_g) AS protein FROM meal_logs
      WHERE user_id=? AND status='confirmed' AND substr(eaten_at,1,10)=?`).bind(user.id, localDate)
      .first<{ calories: number | null; protein: number | null }>(),
    env.DB.prepare(`SELECT type,value,unit,observed_at,source_name FROM health_observations
      WHERE user_id=? AND observed_at>=? ORDER BY observed_at DESC LIMIT 8`).bind(user.id, new Date(Date.now() - 3 * 86_400_000).toISOString())
      .all<{ type: string; value: number; unit: string; observed_at: string; source_name: string | null }>(),
    env.DB.prepare(`SELECT id,action_type,payload_json,status,expires_at FROM coach_action_proposals
      WHERE user_id=? AND status='pending' AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 5`)
      .bind(user.id, new Date().toISOString()).all<{ id: string; action_type: string; payload_json: string; status: string; expires_at: string | null }>(),
    env.DB.prepare("SELECT id,status,week_start FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC LIMIT 1")
      .bind(user.id).first<{ id: string; status: string; week_start: string }>(),
    env.DB.prepare("SELECT COUNT(*) AS value FROM coach_memories WHERE user_id=? AND status='active'").bind(user.id).first<{ value: number }>(),
    env.DB.prepare("SELECT proactive_enabled FROM coach_preferences WHERE user_id=?").bind(user.id).first<{ proactive_enabled: number }>(),
    entitlementSnapshot(env, user.id),
  ]);
  const sessions = Number(occurrenceSessions.results?.length || 0) ? occurrenceSessions : legacySessions;
  const completed = (sessions.results || []).filter((item) => item.status === "completed");
  const recentRpe = completed.filter((item) => Number.isFinite(item.rpe)).slice(0, 2).map((item) => Number(item.rpe));
  const steps = (health.results || []).find((item) => item.type === "steps");
  const evidence: CoachEvidence[] = [];
  if (plan) evidence.push({ label: "当前计划", value: `${plan.phase?.currentWeek || Math.floor(relativeDay / 7) + 1}/${plan.phase?.lengthWeeks || cycle?.phaseWeeks || 4} 周`, observedAt: cycle?.startDate, source: "Cmine Fit" });
  if (recentRpe.length) evidence.push({ label: "最近训练 RPE", value: recentRpe.join("、"), observedAt: completed[0]?.completed_at, source: "训练记录" });
  if (measurement?.weight_kg) evidence.push({ label: "最近体重", value: `${measurement.weight_kg} kg`, observedAt: measurement.measured_at, source: "身体记录" });
  if (steps) evidence.push({ label: "最近步数", value: `${Math.round(steps.value)} 步`, observedAt: steps.observed_at, source: steps.source_name || "健康设备" });
  const dataState: CoachDailyBrief["dataState"] = product.membership.tier === "pro" && completed.length >= 2 ? "personalized" : evidence.length > 1 ? "partial" : "plan_only";
  const rest = !day || Boolean(day.restDay);
  const proactiveEnabled = preferences ? Boolean(preferences.proactive_enabled) : true;
  const priorities = !proactiveEnabled ? [] : rest
    ? ["完成轻松步行或日常活动", "用 8 分钟活动主要关节", `优先达到约 ${plan?.protein || "计划"} g 蛋白质目标`]
    : [`完成 ${day.title.zh} 的关键动作`, `预留约 ${day.duration} 分钟`, "动作不适时立即使用替代动作，不勉强完成"];
  const brief: CoachDailyBrief = {
    localDate,
    headline: rest ? "今天的任务是恢复好，而不是补偿昨天。" : `今天：${day.title.zh}`,
    summary: dataState === "plan_only"
      ? "目前主要根据当前计划安排；完成几次训练并记录反馈后，建议会更贴近你的实际状态。"
      : recentRpe.some((value) => value >= 9) ? "最近训练强度偏高，今天先保证动作质量，不主动增加负荷。" : "结合最近记录，今天可以按当前节奏完成。",
    priorities,
    primaryAction: { label: rest ? "查看恢复安排" : "开始今天训练", href: "/today", kind: rest ? "recover" : "train" },
    basis: evidence,
    dataState,
  };
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO coach_daily_briefs (id,user_id,local_date,payload_json,data_freshness_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,local_date) DO UPDATE SET payload_json=excluded.payload_json,data_freshness_json=excluded.data_freshness_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), user.id, localDate, JSON.stringify(brief), JSON.stringify(Object.fromEntries(evidence.map((item) => [item.label, item.observedAt || null]))), now, now).run();
  return {
    brief,
    phase: plan?.phase ? { ...plan.phase, currentWeek: Math.min(plan.phase.lengthWeeks, Math.floor(relativeDay / 7) + 1), progressPct: Math.min(100, Math.round((relativeDay + 1) / (plan.phase.lengthWeeks * 7) * 100)) } : null,
    today: day ? { occurrenceId: occurrence?.id || null, scheduledDate: localDate, dayIndex, status: occurrence?.status || "scheduled", mode: occurrence?.mode || "standard", workout: day } : null,
    pendingActions: (pending.results || []).map((item) => ({ id: item.id, type: item.action_type, status: item.status, expiresAt: item.expires_at, payload: parseJson(item.payload_json) || {} })),
    latestReview: review || null,
    memoryCount: Number(memoryCount?.value || 0),
    proactiveEnabled,
    product,
    profile: profile ? { track: profile.trainingTrack, goal: profile.goal } : null,
    nutritionToday: { calories: Number(nutrition?.calories || 0), protein: Number(nutrition?.protein || 0), calorieTarget: plan?.calories || null, proteinTarget: plan?.protein || null },
  };
}

export async function saveCoachCheckin(env: WorkerEnv, user: StoredUser, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const energy = clamp(input.energy, 1, 5); const soreness = clamp(input.soreness, 0, 10); const pain = clamp(input.pain, 0, 10);
  const availableMinutes = clamp(input.availableMinutes, 10, 180);
  if (![energy, soreness, pain, availableMinutes].every(Number.isFinite)) throw new Error("INVALID_CHECKIN");
  const home = await coachHome(env, user); const plannedDuration = Number(home.today?.workout.duration || 30);
  let mode: "standard" | "short" | "recovery" | "reschedule" = "standard";
  let title = "按原计划完成"; let explanation = "当前反馈没有触发减量条件，先保持动作质量。";
  if (pain >= 4) { mode = "recovery"; title = "停止引发疼痛的动作"; explanation = "疼痛达到安全拦截范围，今天不增加强度；只做无痛活动或改日完成。"; }
  else if (energy <= 1 || soreness >= 8) { mode = "recovery"; title = "今天使用恢复版"; explanation = "精力或酸痛状态不适合完成原训练量，先降低强度和总量。"; }
  else if (availableMinutes < Math.min(20, plannedDuration)) { mode = "reschedule"; title = "建议改到下一可用时间"; explanation = "当前时间不足以完成关键动作和必要准备，改日比匆忙训练更安全。"; }
  else if (availableMinutes < plannedDuration || energy <= 2 || soreness >= 6) { mode = "short"; title = "今天使用缩短版"; explanation = "保留最重要的两个动作，避免因为时间或恢复状态不足而完全跳过。"; }
  const recommendation = { mode, title, explanation, stopConditions: ["疼痛达到 4/10 或持续加重时停止相关动作。", "出现胸痛、晕厥、呼吸困难或无法承重时停止训练并及时求助。"] };
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const occurrenceId = typeof input.occurrenceId === "string" ? input.occurrenceId : null;
  await env.DB.prepare(`INSERT INTO coach_checkins
    (id,user_id,occurrence_id,energy,soreness,pain,available_minutes,note,recommendation_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, user.id, occurrenceId, energy, soreness, pain, availableMinutes, String(input.note || "").slice(0, 500) || null, JSON.stringify(recommendation), now).run();
  if (occurrenceId && mode !== "reschedule") await setOccurrenceMode(env, user.id, occurrenceId, mode);
  return { id, energy, soreness, pain, availableMinutes, recommendation, createdAt: now };
}

export async function coachMemorySnapshot(env: WorkerEnv, userId: string) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const [rows, preferences, profile] = await Promise.all([
    env.DB.prepare(`SELECT id,memory_type,memory_key,value,source,confidence,updated_at FROM coach_memories
      WHERE user_id=? AND status='active' ORDER BY memory_type,updated_at DESC`).bind(userId).all<{
        id: string; memory_type: CoachMemory["type"]; memory_key: string; value: string; source: CoachMemory["source"]; confidence: number; updated_at: string;
      }>(),
    env.DB.prepare("SELECT memory_enabled,coaching_mode,tone,proactive_enabled,updated_at FROM coach_preferences WHERE user_id=?")
      .bind(userId).first<Record<string, unknown>>(),
    profileForUser(env, userId),
  ]);
  const profileMemories: CoachMemory[] = profile ? [
    { id: "profile:goal", type: "profile", key: "goal", value: String(profile.goal), source: "profile", confidence: 1, updatedAt: new Date().toISOString() },
    { id: "profile:equipment", type: "profile", key: "equipment", value: String(profile.equipment), source: "profile", confidence: 1, updatedAt: new Date().toISOString() },
    ...(profile.limitations ? [{ id: "profile:limitations", type: "profile" as const, key: "limitations", value: profile.limitations, source: "profile" as const, confidence: 1, updatedAt: new Date().toISOString() }] : []),
  ] : [];
  return {
    memories: [...profileMemories, ...(rows.results || []).map((row) => ({ id: row.id, type: row.memory_type, key: row.memory_key, value: row.value, source: row.source, confidence: row.confidence, updatedAt: row.updated_at }))],
    preferences: { memoryEnabled: preferences ? Boolean(preferences.memory_enabled) : true, coachingMode: String(preferences?.coaching_mode || "personalized"), tone: String(preferences?.tone || "supportive"), proactiveEnabled: preferences ? Boolean(preferences.proactive_enabled) : true },
  };
}

export async function upsertCoachMemory(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const key = String(input.key || "").trim().slice(0, 60); const value = String(input.value || "").trim().slice(0, 500);
  if (!key || !value) throw new Error("INVALID_MEMORY");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO coach_memories (id,user_id,memory_type,memory_key,value,source,confidence,status,created_at,updated_at)
    VALUES (?,?, 'declared',?,?, 'user',1,'active',?,?) ON CONFLICT(user_id,memory_key) DO UPDATE SET value=excluded.value,status='active',updated_at=excluded.updated_at`)
    .bind(id, userId, key, value, now, now).run();
  return coachMemorySnapshot(env, userId);
}

export async function updateCoachPreferences(env: WorkerEnv, userId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const memoryEnabled = input.memoryEnabled !== false; const proactiveEnabled = input.proactiveEnabled !== false;
  const coachingMode = input.coachingMode === "education" ? "education" : "personalized";
  const tone = ["supportive", "direct", "concise"].includes(String(input.tone)) ? String(input.tone) : "supportive";
  await env.DB.prepare(`INSERT INTO coach_preferences (user_id,memory_enabled,coaching_mode,tone,proactive_enabled,updated_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET memory_enabled=excluded.memory_enabled,coaching_mode=excluded.coaching_mode,tone=excluded.tone,proactive_enabled=excluded.proactive_enabled,updated_at=excluded.updated_at`)
    .bind(userId, memoryEnabled ? 1 : 0, coachingMode, tone, proactiveEnabled ? 1 : 0, new Date().toISOString()).run();
  return coachMemorySnapshot(env, userId);
}

export async function deleteCoachMemory(env: WorkerEnv, userId: string, memoryId?: string | null) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  if (memoryId) await env.DB.prepare("UPDATE coach_memories SET status='deleted',updated_at=? WHERE id=? AND user_id=?").bind(new Date().toISOString(), memoryId, userId).run();
  else await env.DB.prepare("UPDATE coach_memories SET status='deleted',updated_at=? WHERE user_id=?").bind(new Date().toISOString(), userId).run();
  return coachMemorySnapshot(env, userId);
}

export async function saveCoachFeedback(env: WorkerEnv, userId: string, messageId: string, input: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const rating = Number(input.rating) === 1 ? 1 : -1; const now = new Date().toISOString();
  const owned = await env.DB.prepare("SELECT id FROM coach_messages WHERE id=? AND user_id=? AND role='assistant'").bind(messageId, userId).first();
  if (!owned) throw new Error("MESSAGE_NOT_FOUND");
  await env.DB.prepare(`INSERT INTO coach_feedback (id,user_id,message_id,rating,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id,message_id) DO UPDATE SET rating=excluded.rating,reason=excluded.reason,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), userId, messageId, rating, String(input.reason || "").slice(0, 300) || null, now, now).run();
  return { messageId, rating, saved: true };
}

export async function updateConversationSummary(env: WorkerEnv, userId: string, conversationId: string) {
  if (!env.DB) return;
  const count = await env.DB.prepare("SELECT COUNT(*) AS value FROM coach_messages WHERE conversation_id=? AND user_id=?")
    .bind(conversationId, userId).first<{ value: number }>();
  if (Number(count?.value || 0) < 12 || Number(count?.value || 0) % 6 !== 0) return;
  const rows = await env.DB.prepare(`SELECT id,role,content FROM coach_messages WHERE conversation_id=? AND user_id=?
    ORDER BY created_at DESC LIMIT 10`).bind(conversationId, userId).all<{ id: string; role: string; content: string }>();
  const ordered = [...(rows.results || [])].reverse(); const summary = ordered.map((item) => `${item.role === "user" ? "用户" : "Coach"}：${item.content.slice(0, 160)}`).join("\n").slice(0, 1600);
  const now = new Date().toISOString(); const through = ordered[ordered.length - 1]?.id || null;
  await env.DB.batch([
    env.DB.prepare("UPDATE coach_conversations SET summary=? WHERE id=? AND user_id=?").bind(summary, conversationId, userId),
    env.DB.prepare("INSERT INTO coach_conversation_summaries (id,conversation_id,user_id,summary,through_message_id,created_at) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), conversationId, userId, summary, through, now),
  ]);
}

export function workoutFromHome(home: Awaited<ReturnType<typeof coachHome>>): WorkoutDay | null { return home.today?.workout || null; }
