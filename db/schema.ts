import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  cmineSub: text("cmine_sub").notNull().unique(),
  email: text("email"),
  name: text("name"),
  picture: text("picture"),
  role: text("role").notNull().default("user"),
  cmineRole: text("cmine_role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  locale: text("locale").notNull().default("zh"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  index("sessions_user_idx").on(table.userId),
  index("sessions_expiry_idx").on(table.expiresAt),
]);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  profileJson: text("profile_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  profileJson: text("profile_json").notNull(),
  planJson: text("plan_json").notNull(),
  source: text("source").notNull(),
  model: text("model").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("plans_user_created_idx").on(table.userId, table.createdAt)]);

export const consents = sqliteTable("consents", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  disclaimerVersion: text("disclaimer_version").notNull(),
  locale: text("locale").notNull(),
  ipHash: text("ip_hash"),
  consentedAt: text("consented_at").notNull(),
}, (table) => [index("consents_user_idx").on(table.userId)]);

export const pointLedger = sqliteTable("point_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  externalRef: text("external_ref").unique(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("point_ledger_user_created_idx").on(table.userId, table.createdAt)]);

export const workoutCompletions = sqliteTable("workout_completions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(),
  exerciseId: text("exercise_id").notNull(),
  completedAt: text("completed_at").notNull(),
}, (table) => [
  uniqueIndex("workout_completions_unique").on(table.userId, table.planId, table.dayIndex, table.exerciseId),
  index("workout_completions_user_time_idx").on(table.userId, table.completedAt),
]);

export const measurements = sqliteTable("measurements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weightKg: real("weight_kg"),
  bodyFatPct: real("body_fat_pct"),
  waistCm: real("waist_cm"),
  armCm: real("arm_cm"),
  note: text("note"),
  measuredAt: text("measured_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("measurements_user_time_idx").on(table.userId, table.measuredAt)]);

export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(),
  status: text("status").notNull().default("completed"),
  durationMinutes: integer("duration_minutes"),
  rpe: integer("rpe"),
  pain: integer("pain").notNull().default(0),
  notes: text("notes"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("workout_sessions_user_plan_day_unique").on(table.userId, table.planId, table.dayIndex),
  index("workout_sessions_user_time_idx").on(table.userId, table.completedAt),
]);

export const generationRuns = sqliteTable("generation_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  model: text("model").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  requestId: text("request_id"),
  errorCode: text("error_code"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  reasoningTokens: integer("reasoning_tokens"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("generation_runs_time_idx").on(table.createdAt),
  index("generation_runs_status_time_idx").on(table.status, table.createdAt),
]);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const adminAuditEvents = sqliteTable("admin_audit_events", {
  id: text("id").primaryKey(),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  detailJson: text("detail_json"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("admin_audit_events_time_idx").on(table.createdAt)]);
