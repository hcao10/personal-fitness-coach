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
  cmineAccessToken: text("cmine_access_token"),
  cmineRefreshToken: text("cmine_refresh_token"),
  cmineTokenExpiresAt: text("cmine_token_expires_at"),
  cmineCheckedAt: text("cmine_checked_at"),
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
  task: text("task").notNull().default("training_plan"),
  provider: text("provider").notNull().default("openai"),
  estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  cacheHit: integer("cache_hit", { mode: "boolean" }).notNull().default(false),
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

export const billingCustomers = sqliteTable("billing_customers", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("stripe"),
  externalCustomerId: text("external_customer_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("stripe"),
  externalSubscriptionId: text("external_subscription_id").notNull().unique(),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  priceId: text("price_id"),
  currentPeriodEnd: text("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  lastEventCreated: integer("last_event_created").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("subscriptions_user_idx").on(table.userId),
  index("subscriptions_status_idx").on(table.status),
]);

export const billingEvents = sqliteTable("billing_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull().default("stripe"),
  eventType: text("event_type").notNull(),
  objectId: text("object_id"),
  amountTotal: integer("amount_total"),
  currency: text("currency"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  receivedAt: text("received_at").notNull(),
  processedAt: text("processed_at"),
}, (table) => [index("billing_events_time_idx").on(table.receivedAt)]);

export const entitlements = sqliteTable("entitlements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  capability: text("capability").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  expiresAt: text("expires_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("entitlements_user_capability_unique").on(table.userId, table.capability),
  index("entitlements_user_idx").on(table.userId),
]);

export const featureUsage = sqliteTable("feature_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  capability: text("capability").notNull(),
  periodKey: text("period_key").notNull(),
  used: integer("used").notNull().default(0),
  bonus: integer("bonus").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("feature_usage_period_unique").on(table.userId, table.capability, table.periodKey),
  index("feature_usage_user_idx").on(table.userId),
]);

export const mealLogs = sqliteTable("meal_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mealType: text("meal_type").notNull(),
  status: text("status").notNull().default("draft"),
  eatenAt: text("eaten_at").notNull(),
  note: text("note"),
  calories: real("calories").notNull().default(0),
  proteinG: real("protein_g").notNull().default(0),
  carbsG: real("carbs_g").notNull().default(0),
  fatG: real("fat_g").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("meal_logs_user_time_idx").on(table.userId, table.eatenAt)]);

export const mealImages = sqliteTable("meal_images", {
  id: text("id").primaryKey(),
  mealId: text("meal_id").notNull().references(() => mealLogs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  retentionUntil: text("retention_until").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("meal_images_user_idx").on(table.userId)]);

export const mealItems = sqliteTable("meal_items", {
  id: text("id").primaryKey(),
  mealId: text("meal_id").notNull().references(() => mealLogs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  grams: real("grams").notNull(),
  source: text("source").notNull(),
  sourceRef: text("source_ref"),
  calories: real("calories").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  confidence: real("confidence"),
  userCorrected: integer("user_corrected", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("meal_items_meal_idx").on(table.mealId)]);

export const mealAnalysisRuns = sqliteTable("meal_analysis_runs", {
  id: text("id").primaryKey(),
  mealId: text("meal_id").notNull().references(() => mealLogs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  resultJson: text("result_json"),
  confidence: real("confidence"),
  latencyMs: integer("latency_ms").notNull(),
  errorCode: text("error_code"),
  estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("meal_analysis_time_idx").on(table.createdAt)]);

export const nutritionCache = sqliteTable("nutrition_cache", {
  cacheKey: text("cache_key").primaryKey(),
  source: text("source").notNull(),
  sourceRef: text("source_ref").notNull(),
  name: text("name").notNull(),
  payloadJson: text("payload_json").notNull(),
  expiresAt: text("expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("nutrition_cache_expiry_idx").on(table.expiresAt)]);

export const aiRoutes = sqliteTable("ai_routes", {
  id: text("id").primaryKey(),
  task: text("task").notNull(),
  tier: text("tier").notNull(),
  priority: integer("priority").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("ai_routes_task_tier_priority_unique").on(table.task, table.tier, table.priority),
  index("ai_routes_task_idx").on(table.task, table.tier),
]);

export const aiRequestCache = sqliteTable("ai_request_cache", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  task: text("task").notNull(),
  inputHash: text("input_hash").notNull(),
  resultJson: text("result_json").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("ai_request_cache_user_task_hash_unique").on(table.userId, table.task, table.inputHash),
  index("ai_request_cache_expiry_idx").on(table.expiresAt),
]);

export const rewardEvents = sqliteTable("reward_events", {
  eventId: text("event_id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  rewardType: text("reward_type").notNull(),
  points: integer("points").notNull(),
  signatureValid: integer("signature_valid", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("reward_events_user_time_idx").on(table.userId, table.createdAt)]);

export const pointRedemptions = sqliteTable("point_redemptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reward: text("reward").notNull(),
  pointsSpent: integer("points_spent").notNull(),
  usageCapability: text("usage_capability").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("point_redemptions_user_time_idx").on(table.userId, table.createdAt)]);
