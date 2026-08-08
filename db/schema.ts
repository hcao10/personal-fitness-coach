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
  onboardingStatus: text("onboarding_status").notNull().default("not_started"),
  onboardingStep: integer("onboarding_step").notNull().default(0),
  onboardingVersion: integer("onboarding_version").notNull().default(1),
  onboardingCompletedAt: text("onboarding_completed_at"),
  onboardingSkippedAt: text("onboarding_skipped_at"),
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
  timezone: text("timezone"),
  productVersion: text("product_version"),
  privacyVersion: text("privacy_version"),
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
  uniqueIndex("entitlements_user_capability_source_unique").on(table.userId, table.capability, table.source),
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

export const onboardingDrafts = sqliteTable("onboarding_drafts", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  dataJson: text("data_json").notNull().default("{}"),
  source: text("source").notNull().default("guided"),
  updatedAt: text("updated_at").notNull(),
});

export const planCycles = sqliteTable("plan_cycles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  status: text("status").notNull().default("active"),
  activeVersionId: text("active_version_id"),
  startDate: text("start_date"),
  timezone: text("timezone").notNull().default("UTC"),
  phaseWeeks: integer("phase_weeks").notNull().default(4),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
}, (table) => [index("plan_cycles_user_status_idx").on(table.userId, table.status)]);

export const planVersions = sqliteTable("plan_versions", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull().references(() => planCycles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  parentVersionId: text("parent_version_id"),
  status: text("status").notNull().default("draft"),
  changeSummaryJson: text("change_summary_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  activatedAt: text("activated_at"),
}, (table) => [
  uniqueIndex("plan_versions_cycle_number_unique").on(table.cycleId, table.versionNumber),
  index("plan_versions_user_status_idx").on(table.userId, table.status),
]);

export const planActivationEvents = sqliteTable("plan_activation_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: text("cycle_id").notNull().references(() => planCycles.id, { onDelete: "cascade" }),
  versionId: text("version_id").notNull().references(() => planVersions.id, { onDelete: "cascade" }),
  previousVersionId: text("previous_version_id"),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("plan_activation_events_user_time_idx").on(table.userId, table.createdAt)]);

export const workoutOccurrences = sqliteTable("workout_occurrences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: text("cycle_id").notNull().references(() => planCycles.id, { onDelete: "cascade" }),
  versionId: text("version_id").notNull().references(() => planVersions.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  status: text("status").notNull().default("scheduled"),
  mode: text("mode").notNull().default("standard"),
  rescheduledFromId: text("rescheduled_from_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("workout_occurrences_version_day_unique").on(table.versionId, table.scheduledDate, table.dayIndex),
  index("workout_occurrences_user_date_idx").on(table.userId, table.scheduledDate),
]);

export const workoutOccurrenceSessions = sqliteTable("workout_occurrence_sessions", {
  id: text("id").primaryKey(),
  occurrenceId: text("occurrence_id").notNull().references(() => workoutOccurrences.id, { onDelete: "cascade" }).unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("completed"),
  durationMinutes: integer("duration_minutes"),
  rpe: integer("rpe"),
  pain: integer("pain").notNull().default(0),
  notes: text("notes"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("workout_occurrence_sessions_user_time_idx").on(table.userId, table.completedAt)]);

export const coachConversations = sqliteTable("coach_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("coach_conversations_user_time_idx").on(table.userId, table.updatedAt)]);

export const coachMessages = sqliteTable("coach_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => coachConversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  clientMutationId: text("client_mutation_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("coach_messages_conversation_time_idx").on(table.conversationId, table.createdAt),
  uniqueIndex("coach_messages_user_mutation_unique").on(table.userId, table.clientMutationId),
]);

export const coachRuns = sqliteTable("coach_runs", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => coachConversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("coach_runs_user_time_idx").on(table.userId, table.createdAt)]);

export const coachActionProposals = sqliteTable("coach_action_proposals", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => coachConversations.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().references(() => coachMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  baseVersionId: text("base_version_id"),
  reasonCodesJson: text("reason_codes_json").notNull().default("[]"),
  impactJson: text("impact_json").notNull().default("{}"),
  reversible: integer("reversible", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("pending"),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("coach_actions_user_status_idx").on(table.userId, table.status)]);

export const coachActionExecutions = sqliteTable("coach_action_executions", {
  id: text("id").primaryKey(),
  actionId: text("action_id").notNull().references(() => coachActionProposals.id, { onDelete: "cascade" }).unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  resultJson: text("result_json").notNull().default("{}"),
  errorCode: text("error_code"),
  executedAt: text("executed_at").notNull(),
});

export const coachMemories = sqliteTable("coach_memories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  memoryType: text("memory_type").notNull(),
  memoryKey: text("memory_key").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull().default("user"),
  confidence: real("confidence").notNull().default(1),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("coach_memories_user_key_unique").on(table.userId, table.memoryKey)]);

export const coachPreferences = sqliteTable("coach_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  memoryEnabled: integer("memory_enabled", { mode: "boolean" }).notNull().default(true),
  coachingMode: text("coaching_mode").notNull().default("personalized"),
  tone: text("tone").notNull().default("supportive"),
  proactiveEnabled: integer("proactive_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

export const coachConversationSummaries = sqliteTable("coach_conversation_summaries", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => coachConversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  throughMessageId: text("through_message_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("coach_summaries_conversation_time_idx").on(table.conversationId, table.createdAt)]);

export const coachDailyBriefs = sqliteTable("coach_daily_briefs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(),
  payloadJson: text("payload_json").notNull(),
  dataFreshnessJson: text("data_freshness_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("coach_daily_briefs_user_date_unique").on(table.userId, table.localDate)]);

export const coachCheckins = sqliteTable("coach_checkins", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  occurrenceId: text("occurrence_id").references(() => workoutOccurrences.id, { onDelete: "set null" }),
  energy: integer("energy").notNull(),
  soreness: integer("soreness").notNull(),
  pain: integer("pain").notNull(),
  availableMinutes: integer("available_minutes").notNull(),
  note: text("note"),
  recommendationJson: text("recommendation_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("coach_checkins_user_time_idx").on(table.userId, table.createdAt)]);

export const coachFeedback = sqliteTable("coach_feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().references(() => coachMessages.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("coach_feedback_user_message_unique").on(table.userId, table.messageId)]);

export const knowledgeSources = sqliteTable("knowledge_sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  locale: text("locale").notNull().default("en"),
  status: text("status").notNull().default("active"),
  reviewedAt: text("reviewed_at").notNull(),
});

export const knowledgeArticles = sqliteTable("knowledge_articles", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => knowledgeSources.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  keywords: text("keywords").notNull(),
  status: text("status").notNull().default("active"),
  reviewedAt: text("reviewed_at").notNull(),
}, (table) => [index("knowledge_articles_topic_idx").on(table.topic)]);

export const coachEvaluationRuns = sqliteTable("coach_evaluation_runs", {
  id: text("id").primaryKey(),
  task: text("task").notNull(),
  provider: text("provider"),
  model: text("model"),
  schemaValid: integer("schema_valid", { mode: "boolean" }).notNull().default(false),
  safetyPassed: integer("safety_passed", { mode: "boolean" }).notNull().default(false),
  actionValid: integer("action_valid", { mode: "boolean" }).notNull().default(false),
  latencyMs: integer("latency_ms").notNull().default(0),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("coach_evaluations_task_time_idx").on(table.task, table.createdAt)]);

export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: text("cycle_id").references(() => planCycles.id, { onDelete: "set null" }),
  weekStart: text("week_start").notNull(),
  status: text("status").notNull().default("due"),
  checkinJson: text("checkin_json"),
  metricsJson: text("metrics_json"),
  recommendationJson: text("recommendation_json"),
  plateau: integer("plateau", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("weekly_reviews_user_week_unique").on(table.userId, table.weekStart),
  index("weekly_reviews_user_status_idx").on(table.userId, table.status),
]);

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  name: text("name"),
  pushToken: text("push_token"),
  lastSyncCursor: integer("last_sync_cursor").notNull().default(0),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("devices_user_idx").on(table.userId)]);

export const syncMutations = sqliteTable("sync_mutations", {
  mutationId: text("mutation_id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(),
  payloadJson: text("payload_json").notNull(),
  appliedAt: text("applied_at").notNull(),
}, (table) => [index("sync_mutations_user_time_idx").on(table.userId, table.appliedAt)]);

export const syncEvents = sqliteTable("sync_events", {
  cursor: integer("cursor").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("sync_events_user_cursor_idx").on(table.userId, table.cursor)]);

export const healthConnections = sqliteTable("health_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  permissionsJson: text("permissions_json").notNull(),
  status: text("status").notNull().default("active"),
  syncCursorJson: text("sync_cursor_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("health_connections_user_platform_unique").on(table.userId, table.platform)]);

export const healthObservations = sqliteTable("health_observations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => healthConnections.id, { onDelete: "cascade" }),
  sourceRecordId: text("source_record_id").notNull(),
  type: text("type").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  observedAt: text("observed_at").notNull(),
  sourceName: text("source_name"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("health_observations_source_unique").on(table.connectionId, table.sourceRecordId, table.type),
  index("health_observations_user_time_idx").on(table.userId, table.observedAt),
]);

export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  training: integer("training", { mode: "boolean" }).notNull().default(true),
  coach: integer("coach", { mode: "boolean" }).notNull().default(true),
  reviews: integer("reviews", { mode: "boolean" }).notNull().default(true),
  nutrition: integer("nutrition", { mode: "boolean" }).notNull().default(false),
  billing: integer("billing", { mode: "boolean" }).notNull().default(true),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("08:00"),
  updatedAt: text("updated_at").notNull(),
});

export const foodPortions = sqliteTable("food_portions", {
  id: text("id").primaryKey(),
  canonicalFoodId: text("canonical_food_id").notNull().references(() => canonicalFoods.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  grams: real("grams").notNull(),
  locale: text("locale"),
  sourceRecordId: text("source_record_id").references(() => foodSourceRecords.id, { onDelete: "set null" }),
}, (table) => [index("food_portions_food_idx").on(table.canonicalFoodId)]);

export const foodImportRuns = sqliteTable("food_import_runs", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsWritten: integer("records_written").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  sourceRevision: text("source_revision"),
  errorCode: text("error_code"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [index("food_import_runs_source_time_idx").on(table.source, table.startedAt)]);

export const habitCommitments = sqliteTable("habit_commitments", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  cueTime: text("cue_time").notNull().default("18:00"),
  cuePlace: text("cue_place"),
  updatedAt: text("updated_at").notNull(),
});

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  achievedAt: text("achieved_at").notNull(),
}, (table) => [index("milestones_user_idx").on(table.userId), uniqueIndex("milestones_user_kind_unique").on(table.userId, table.kind)]);

export const notificationLog = sqliteTable("notification_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  sentAt: text("sent_at").notNull(),
}, (table) => [index("notification_log_user_idx").on(table.userId, table.sentAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
}, (table) => [index("rate_limits_window_idx").on(table.windowStart)]);

export const maintenanceRuns = sqliteTable("maintenance_runs", {
  id: text("id").primaryKey(),
  job: text("job").notNull(),
  status: text("status").notNull(),
  processed: integer("processed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  detailJson: text("detail_json"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [index("maintenance_runs_job_time_idx").on(table.job, table.startedAt)]);

export const workoutSets = sqliteTable("workout_sets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(),
  exerciseId: text("exercise_id").notNull(),
  setIndex: integer("set_index").notNull(),
  setType: text("set_type").notNull().default("working"),
  targetReps: text("target_reps"),
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  rir: real("rir"),
  rpe: real("rpe"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  clientMutationId: text("client_mutation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("workout_sets_plan_day_exercise_set_unique").on(table.userId, table.planId, table.dayIndex, table.exerciseId, table.setIndex),
  uniqueIndex("workout_sets_user_mutation_unique").on(table.userId, table.clientMutationId),
  index("workout_sets_user_time_idx").on(table.userId, table.updatedAt),
]);

export const workoutOccurrenceSets = sqliteTable("workout_occurrence_sets", {
  id: text("id").primaryKey(),
  occurrenceId: text("occurrence_id").notNull().references(() => workoutOccurrences.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(), exerciseId: text("exercise_id").notNull(), setIndex: integer("set_index").notNull(),
  setType: text("set_type").notNull().default("working"), targetReps: text("target_reps"), weightKg: real("weight_kg"),
  reps: integer("reps"), rir: real("rir"), rpe: real("rpe"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false), clientMutationId: text("client_mutation_id"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("workout_occurrence_sets_unique").on(table.occurrenceId, table.exerciseId, table.setIndex),
  uniqueIndex("workout_occurrence_sets_mutation_unique").on(table.userId, table.clientMutationId),
  index("workout_occurrence_sets_user_time_idx").on(table.userId, table.updatedAt),
]);

export const coachRecordDrafts = sqliteTable("coach_record_drafts", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionId: text("action_id").notNull().references(() => coachActionProposals.id, { onDelete: "cascade" }), draftType: text("draft_type").notNull(),
  payloadJson: text("payload_json").notNull(), status: text("status").notNull().default("draft"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("coach_record_drafts_action_unique").on(table.actionId), index("coach_record_drafts_user_status_idx").on(table.userId, table.status)]);

export const canonicalFoods = sqliteTable("canonical_foods", {
  id: text("id").primaryKey(), canonicalName: text("canonical_name").notNull(), displayNameZh: text("display_name_zh"),
  displayNameEn: text("display_name_en").notNull(), category: text("category"), region: text("region"),
  sourceKind: text("source_kind").notNull(), dataQuality: real("data_quality").notNull().default(1),
  status: text("status").notNull().default("active"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("canonical_foods_name_idx").on(table.canonicalName, table.status), index("canonical_foods_region_idx").on(table.region, table.status)]);

export const foodSourceRecords = sqliteTable("food_source_records", {
  id: text("id").primaryKey(), canonicalFoodId: text("canonical_food_id").notNull().references(() => canonicalFoods.id, { onDelete: "cascade" }),
  source: text("source").notNull(), sourceRef: text("source_ref").notNull(), sourceRevision: text("source_revision"), brand: text("brand"),
  locale: text("locale"), payloadJson: text("payload_json").notNull(), retrievedAt: text("retrieved_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("food_source_records_source_ref_unique").on(table.source, table.sourceRef), index("food_source_records_canonical_idx").on(table.canonicalFoodId)]);

export const foodAliases = sqliteTable("food_aliases", {
  id: text("id").primaryKey(), canonicalFoodId: text("canonical_food_id").notNull().references(() => canonicalFoods.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(), alias: text("alias").notNull(), normalizedAlias: text("normalized_alias").notNull(), kind: text("kind").notNull().default("synonym"),
}, (table) => [uniqueIndex("food_aliases_locale_alias_unique").on(table.locale, table.normalizedAlias, table.canonicalFoodId), index("food_aliases_search_idx").on(table.normalizedAlias, table.locale)]);

export const foodNutrients = sqliteTable("food_nutrients", {
  id: text("id").primaryKey(), canonicalFoodId: text("canonical_food_id").notNull().references(() => canonicalFoods.id, { onDelete: "cascade" }),
  sourceRecordId: text("source_record_id").references(() => foodSourceRecords.id, { onDelete: "set null" }), basisGrams: real("basis_grams").notNull().default(100),
  calories: real("calories").notNull().default(0), proteinG: real("protein_g").notNull().default(0), carbsG: real("carbs_g").notNull().default(0),
  fatG: real("fat_g").notNull().default(0), fiberG: real("fiber_g"), sodiumMg: real("sodium_mg"), calculationMethod: text("calculation_method").notNull().default("source"), updatedAt: text("updated_at").notNull(),
}, (table) => [index("food_nutrients_food_idx").on(table.canonicalFoodId)]);

export const foodSourceLicenses = sqliteTable("food_source_licenses", {
  source: text("source").primaryKey(), title: text("title").notNull(), licenseName: text("license_name").notNull(), licenseUrl: text("license_url").notNull(),
  attributionText: text("attribution_text"), commercialUse: integer("commercial_use", { mode: "boolean" }).notNull().default(false),
  redistribution: integer("redistribution", { mode: "boolean" }).notNull().default(false), status: text("status").notNull().default("pending_review"),
  lastVerifiedAt: text("last_verified_at"), updatedAt: text("updated_at").notNull(),
});

export const foodCorrections = sqliteTable("food_corrections", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  canonicalFoodId: text("canonical_food_id"), source: text("source").notNull(), sourceRef: text("source_ref").notNull(), correctionJson: text("correction_json").notNull(),
  status: text("status").notNull().default("pending"), reviewedBy: text("reviewed_by"), reviewedAt: text("reviewed_at"), createdAt: text("created_at").notNull(),
}, (table) => [index("food_corrections_status_time_idx").on(table.status, table.createdAt)]);

export const foodSearchEvents = sqliteTable("food_search_events", {
  id: text("id").primaryKey(), userId: text("user_id").references(() => users.id, { onDelete: "set null" }), queryHash: text("query_hash").notNull(),
  locale: text("locale").notNull(), region: text("region"), resultCount: integer("result_count").notNull(), selectedRef: text("selected_ref"), latencyMs: integer("latency_ms").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("food_search_events_time_idx").on(table.createdAt)]);

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), name: text("name").notNull(),
  servings: real("servings").notNull().default(1), cookedWeightG: real("cooked_weight_g"), calories: real("calories").notNull().default(0),
  proteinG: real("protein_g").notNull().default(0), carbsG: real("carbs_g").notNull().default(0), fatG: real("fat_g").notNull().default(0),
  status: text("status").notNull().default("active"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("recipes_user_time_idx").on(table.userId, table.updatedAt)]);

export const recipeItems = sqliteTable("recipe_items", {
  id: text("id").primaryKey(), recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), grams: real("grams").notNull(), source: text("source").notNull(), sourceRef: text("source_ref"), calories: real("calories").notNull(),
  proteinG: real("protein_g").notNull(), carbsG: real("carbs_g").notNull(), fatG: real("fat_g").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("recipe_items_recipe_idx").on(table.recipeId)]);

export const mealTemplates = sqliteTable("meal_templates", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), name: text("name").notNull(), mealType: text("meal_type").notNull(),
  itemsJson: text("items_json").notNull(), calories: real("calories").notNull().default(0), proteinG: real("protein_g").notNull().default(0), carbsG: real("carbs_g").notNull().default(0), fatG: real("fat_g").notNull().default(0),
  lastUsedAt: text("last_used_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("meal_templates_user_time_idx").on(table.userId, table.updatedAt)]);
