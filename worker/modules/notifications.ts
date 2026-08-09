// Server-side push delivery. Everything here is gated on explicit user signals:
// a registered push token, notification preferences, quiet hours, and (for
// training reminders) the user's own implementation-intention cue time.
// Every send is idempotent via notification_log dedupe keys.
import type { WorkerEnv } from "../platform";
import { localDateInTimezone } from "../db";
import { computeStreak, composeWeeklyLetter, inQuietHours, isoWeekStart, summarizeWeeks, trainingReminderMessage } from "../../services/habit-engine/src";
import { habitSummary } from "./habits";

async function settingNumber(env: WorkerEnv, key: string, fallback: number): Promise<number> {
  if (!env.DB) return fallback;
  const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ?").bind(key).first<{ value_json: string }>();
  try {
    const value = Number(JSON.parse(row?.value_json || ""));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };

// Same capability-gating contract as Stripe, RevenueCat and reward ads: an
// unconfigured deployment does not reach out to users. Expo does accept
// unauthenticated sends, but pushing from a half-configured environment is not
// a default worth having — and the docs already promised this behavior.
export function expoPushConfigured(env: WorkerEnv): boolean {
  return Boolean(env.EXPO_ACCESS_TOKEN);
}

export async function sendExpoPush(env: WorkerEnv, messages: PushMessage[]): Promise<{ sent: number; invalidTokens: string[] }> {
  if (!expoPushConfigured(env)) throw new Error("EXPO_PUSH_NOT_CONFIGURED");
  const invalidTokens: string[] = [];
  let sent = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetch(env.EXPO_PUSH_URL || EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        accept: "application/json", "content-type": "application/json",
        authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(chunk),
    });
    const payload = await response.json().catch(() => null) as { data?: Array<{ status: string; details?: { error?: string } }> } | null;
    if (!response.ok || !payload?.data) throw new Error(`EXPO_PUSH_FAILED:${response.status}`);
    payload.data.forEach((ticket, ticketIndex) => {
      if (ticket.status === "ok") sent += 1;
      else if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(chunk[ticketIndex].to);
    });
  }
  return { sent, invalidTokens };
}

type NotifiableUser = {
  user_id: string; timezone: string | null; locale: string | null; push_token: string; created_at: string;
  training: number | null; reviews: number | null; billing: number | null; quiet_start: string | null; quiet_end: string | null;
  cue_time: string | null; cue_place: string | null; has_subscription: number;
};

function localClock(timezone: string | null, date = new Date()): { time: string; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" })
      .formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return { time: `${values.hour}:${values.minute}`, weekday: weekdays.indexOf(String(values.weekday)) };
  } catch {
    return { time: date.toISOString().slice(11, 16), weekday: date.getUTCDay() };
  }
}

async function alreadySent(env: WorkerEnv, dedupeKey: string): Promise<boolean> {
  const row = await env.DB!.prepare("SELECT id FROM notification_log WHERE dedupe_key=?").bind(dedupeKey).first();
  return Boolean(row);
}

async function recordSent(env: WorkerEnv, userId: string, kind: string, dedupeKey: string) {
  await env.DB!.prepare("INSERT OR IGNORE INTO notification_log (id,user_id,kind,dedupe_key,sent_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, kind, dedupeKey, new Date().toISOString()).run();
}

async function streakFor(env: WorkerEnv, userId: string, timezone: string | null) {
  const today = localDateInTimezone(timezone || "UTC");
  const rows = await env.DB!.prepare(`SELECT o.scheduled_date AS date FROM workout_occurrence_sessions s
    JOIN workout_occurrences o ON o.id=s.occurrence_id WHERE s.user_id=? AND s.status='completed'`).bind(userId)
    .all<{ date: string }>();
  return computeStreak(summarizeWeeks((rows.results || []).map((row) => row.date), today));
}

export async function runNotifications(env: WorkerEnv) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const pushEnabled = expoPushConfigured(env);
  const trialDays = Number(await settingNumber(env, "trial_days", 7));
  const users = await env.DB.prepare(`SELECT d.user_id, u.timezone, u.locale, u.created_at, d.push_token,
      p.training, p.reviews, p.billing, p.quiet_start, p.quiet_end, h.cue_time, h.cue_place,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id=d.user_id AND s.status IN ('active','trialing','in_grace_period')) AS has_subscription
    FROM devices d
    JOIN users u ON u.id=d.user_id
    LEFT JOIN notification_preferences p ON p.user_id=d.user_id
    LEFT JOIN habit_commitments h ON h.user_id=d.user_id
    WHERE d.push_token IS NOT NULL AND d.push_token<>''
    GROUP BY d.user_id, d.push_token LIMIT 500`).all<NotifiableUser>();
  const messages: Array<PushMessage & { userId: string; kind: string; dedupeKey: string }> = [];
  for (const user of users.results || []) {
    const clock = localClock(user.timezone);
    const quietStart = user.quiet_start || "22:00";
    const quietEnd = user.quiet_end || "08:00";
    if (inQuietHours(clock.time, quietStart, quietEnd)) continue;
    const localDate = localDateInTimezone(user.timezone || "UTC");
    const locale = user.locale === "en" ? "en" : "zh";

    // Training reminder at the user's committed cue hour on planned training days.
    const cueHour = (user.cue_time || "18:00").slice(0, 2);
    if (user.training !== 0 && clock.time.slice(0, 2) === cueHour) {
      const dedupeKey = `training:${user.user_id}:${localDate}`;
      const dueToday = await env.DB.prepare(`SELECT o.id FROM workout_occurrences o JOIN plans p ON p.id=o.plan_id
        WHERE o.user_id=? AND o.scheduled_date=? AND o.status NOT IN ('completed','superseded')
        AND COALESCE(json_extract(p.plan_json,'$.schedule[' || o.day_index || '].restDay'),0)=0 LIMIT 1`)
        .bind(user.user_id, localDate).first();
      if (dueToday && !(await alreadySent(env, dedupeKey))) {
        const streak = await streakFor(env, user.user_id, user.timezone);
        const reminder = trainingReminderMessage({ cuePlace: user.cue_place, streakWeeks: streak.currentWeeks });
        messages.push({ userId: user.user_id, kind: "training", dedupeKey, to: user.push_token,
          title: reminder.title[locale], body: reminder.body[locale], data: { url: "/today" } });
      }
    }

    // Weekly coach letter on Sunday evening (19:00–20:59 local window).
    if (user.reviews !== 0 && clock.weekday === 0 && ["19", "20"].includes(clock.time.slice(0, 2))) {
      const weekStart = isoWeekStart(localDate);
      const dedupeKey = `letter:${user.user_id}:${weekStart}`;
      if (!(await alreadySent(env, dedupeKey))) {
        const review = await env.DB.prepare(`SELECT recommendation_json FROM weekly_reviews
          WHERE user_id=? AND week_start=? AND status IN ('generated','accepted','rejected')`)
          .bind(user.user_id, weekStart).first<{ recommendation_json: string | null }>();
        let engine: { deloadRecommended?: boolean; adjustments?: Array<{ kind: string; reason: { zh: string; en: string } }> } = {};
        try { engine = JSON.parse(review?.recommendation_json || "{}").engine || {}; } catch { /* letter still sends without engine data */ }
        // habitSummary also persists newly reached milestones, so an identity
        // moment is recorded (and announced once) even for users who have not
        // opened the app since earning it.
        const habit = await habitSummary(env, user.user_id, user.timezone);
        if (habit.streak.sessionsThisWeek === 0 && !review) continue; // nothing to say — silence beats noise
        const planned = await env.DB.prepare(`SELECT COUNT(*) AS value FROM workout_occurrences o JOIN plans p ON p.id=o.plan_id
          WHERE o.user_id=? AND o.scheduled_date>=? AND o.scheduled_date<? AND o.status<>'superseded'
          AND COALESCE(json_extract(p.plan_json,'$.schedule[' || o.day_index || '].restDay'),0)=0`)
          .bind(user.user_id, weekStart, localDate).first<{ value: number }>();
        const letter = composeWeeklyLetter({
          streak: habit.streak, plannedSessions: Math.max(1, Number(planned?.value || 0)),
          deloadRecommended: Boolean(engine.deloadRecommended),
          adjustments: engine.adjustments || [],
          newMilestones: habit.milestones.filter((milestone) => milestone.isNew || Date.parse(milestone.achievedAt) >= Date.parse(`${weekStart}T00:00:00Z`)),
        });
        messages.push({ userId: user.user_id, kind: "letter", dedupeKey, to: user.push_token,
          title: letter.title[locale], body: letter.lines[locale].join(" "), data: { url: "/progress#weekly-review" } });
      }
    }

    // Trial expiry nudge, once, at 19:00 local on the day two days out. Sent
    // only to users still on trial — the decision moment is while they still
    // have the capabilities, not after they have silently lost them.
    if (user.billing !== 0 && !Number(user.has_subscription) && trialDays > 0 && clock.time.slice(0, 2) === "19") {
      const daysLeft = Math.ceil((Date.parse(user.created_at) + trialDays * 86_400_000 - Date.now()) / 86_400_000);
      const dedupeKey = `trial_ending:${user.user_id}`;
      if (daysLeft === 2 && !(await alreadySent(env, dedupeKey))) {
        messages.push({
          userId: user.user_id, kind: "trial_ending", dedupeKey, to: user.push_token,
          title: locale === "zh" ? "试用还剩 2 天" : "2 days left in your trial",
          body: locale === "zh"
            ? "试用结束后，教练的完整调整方案与更高额度会回到免费版。想继续保留可以随时升级。"
            : "When the trial ends, the coach's full adjustments and higher quotas return to the free tier. You can upgrade any time to keep them.",
          data: { url: "/pricing" },
        });
      }
    }
  }

  let sent = 0;
  let cleared = 0;
  // The habit pass above still runs when push is unconfigured — milestone
  // persistence must not be a side effect of delivery — but nothing is sent,
  // and nothing is marked as sent, so messages are not lost: they will be
  // delivered on the first run after a token is configured.
  if (!pushEnabled) {
    console.warn("notifications_skipped", "EXPO_PUSH_NOT_CONFIGURED", messages.length);
    return { skipped: "EXPO_PUSH_NOT_CONFIGURED", candidates: (users.results || []).length, queued: messages.length, sent: 0, clearedTokens: 0 };
  }
  if (messages.length) {
    const result = await sendExpoPush(env, messages.map(({ to, title, body, data }) => ({ to, title, body, data })));
    sent = result.sent;
    for (const message of messages) await recordSent(env, message.userId, message.kind, message.dedupeKey);
    for (const token of result.invalidTokens) {
      await env.DB.prepare("UPDATE devices SET push_token=NULL WHERE push_token=?").bind(token).run();
      cleared += 1;
    }
  }
  return { candidates: (users.results || []).length, queued: messages.length, sent, clearedTokens: cleared };
}
