/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateMealVision, type MealCandidate } from "./llm";
import type { StoredUser } from "./db";
import { recordGenerationRun } from "./telemetry";
import type { WorkerEnv } from "./platform";
import { consumeCapability, refundCapability, tierForUser } from "./product";
import { sha256 } from "./security";
import { toLocale } from "../packages/i18n/src";

export type NutritionReference = {
  ref: string;
  source: "usda" | "open_food_facts" | "user" | "canonical";
  sourceRef: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
  canonicalId?: string | null;
  sourceKind?: "official" | "brand_label" | "community" | "user";
  dataQuality?: number;
  attribution?: string;
  region?: string | null;
  updatedAt?: string | null;
};

type MealItemInput = {
  name: string;
  grams: number;
  nutritionRef?: string;
  manualPer100g?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  confidence?: number;
  userCorrected?: boolean;
};

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function validImageMagic(bytes: Uint8Array): boolean {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return jpeg || png || webp;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function cacheReference(env: WorkerEnv, item: NutritionReference): Promise<void> {
  if (!env.DB) return;
  const now = new Date();
  await env.DB.prepare(`INSERT INTO nutrition_cache
    (cache_key, source, source_ref, name, payload_json, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json, name=excluded.name,
      expires_at=excluded.expires_at, updated_at=excluded.updated_at`)
    .bind(item.ref, item.source, item.sourceRef, item.name, JSON.stringify(item),
      new Date(now.getTime() + 30 * 86400_000).toISOString(), now.toISOString()).run();
}

async function cachedReference(env: WorkerEnv, ref: string): Promise<NutritionReference | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare("SELECT payload_json FROM nutrition_cache WHERE cache_key = ? AND expires_at > ?")
    .bind(ref, new Date().toISOString()).first<{ payload_json: string }>();
  if (!row) return null;
  try { return JSON.parse(row.payload_json) as NutritionReference; } catch { return null; }
}

function offItem(product: Record<string, any>): NutritionReference | null {
  const code = String(product.code || "");
  const name = String(product.product_name || product.product_name_en || product.product_name_zh || "").trim();
  const nutrients = product.nutriments || {};
  if (!code || !name) return null;
  return {
    ref: `open_food_facts:${code}`,
    source: "open_food_facts",
    sourceRef: code,
    name: name.slice(0, 160),
    brand: product.brands ? String(product.brands).slice(0, 120) : null,
    servingSize: product.serving_size ? String(product.serving_size).slice(0, 80) : null,
    per100g: {
      calories: safeNumber(nutrients["energy-kcal_100g"] ?? (safeNumber(nutrients.energy_100g) / 4.184)),
      proteinG: safeNumber(nutrients.proteins_100g),
      carbsG: safeNumber(nutrients.carbohydrates_100g),
      fatG: safeNumber(nutrients.fat_100g),
    },
    sourceKind: "community",
    dataQuality: safeNumber(product.completeness, .55),
    attribution: "Open Food Facts contributors · ODbL 1.0",
    region: null,
  };
}

function usdaItem(food: Record<string, any>): NutritionReference | null {
  const sourceRef = String(food.fdcId || "");
  const name = String(food.description || "").trim();
  if (!sourceRef || !name) return null;
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  const nutrient = (names: string[]) => {
    const match = nutrients.find((item: Record<string, any>) => names.some((namePart) => String(item.nutrientName || item.name || "").toLowerCase().includes(namePart)));
    return safeNumber(match?.value ?? match?.amount);
  };
  return {
    ref: `usda:${sourceRef}`,
    source: "usda",
    sourceRef,
    name: name.slice(0, 160),
    brand: food.brandOwner ? String(food.brandOwner).slice(0, 120) : null,
    servingSize: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || "g"}` : null,
    per100g: {
      calories: nutrient(["energy"]),
      proteinG: nutrient(["protein"]),
      carbsG: nutrient(["carbohydrate"]),
      fatG: nutrient(["total lipid", "fat"]),
    },
    sourceKind: "official",
    dataQuality: 1,
    attribution: "USDA FoodData Central · Public Domain",
    region: "US",
  };
}

export function foodDataConfigured(): boolean {
  // Open Food Facts is usable without a private key. USDA augments the
  // results when USDA_API_KEY is configured.
  return true;
}

function localFoodRow(row: Record<string, any>, locale = "zh"): NutritionReference {
  const source = String(row.source || "canonical") as NutritionReference["source"];
  return {
    ref: `${source}:${row.source_ref || row.id}`,
    source,
    sourceRef: String(row.source_ref || row.id),
    canonicalId: String(row.id),
    name: String(locale === "en" ? row.display_name_en || row.display_name_zh || row.canonical_name : row.display_name_zh || row.display_name_en || row.canonical_name),
    brand: row.brand ? String(row.brand) : null,
    servingSize: row.portion_label ? String(row.portion_label) : null,
    per100g: { calories: safeNumber(row.calories), proteinG: safeNumber(row.protein_g), carbsG: safeNumber(row.carbs_g), fatG: safeNumber(row.fat_g) },
    sourceKind: source === "user" ? "user" : String(row.source_kind || "official") as NutritionReference["sourceKind"],
    dataQuality: safeNumber(row.data_quality, .8), attribution: row.attribution_text ? String(row.attribution_text) : undefined,
    region: row.region ? String(row.region) : null, updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

async function localFoodSearch(env: WorkerEnv, query: string, userId?: string | null, _locale = "zh", region?: string | null): Promise<NutritionReference[]> {
  if (!env.DB) return [];
  const normalized = query.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const like = `%${normalized.replace(/[%_]/g, "")} %`.replace(/ %$/, "%");
  try {
    const rows = await env.DB.prepare(`SELECT DISTINCT f.id,f.canonical_name,f.display_name_zh,f.display_name_en,f.region,f.source_kind,f.data_quality,f.updated_at,
      r.source,r.source_ref,r.brand,n.calories,n.protein_g,n.carbs_g,n.fat_g,l.attribution_text,
      CASE WHEN lower(f.canonical_name)=? OR lower(COALESCE(f.display_name_zh,''))=? OR lower(f.display_name_en)=? THEN 0
        WHEN f.region=? THEN 1 ELSE 2 END AS rank
      FROM canonical_foods f
      LEFT JOIN food_aliases a ON a.canonical_food_id=f.id
      LEFT JOIN food_source_records r ON r.canonical_food_id=f.id
      LEFT JOIN food_nutrients n ON n.canonical_food_id=f.id
      LEFT JOIN food_source_licenses l ON l.source=r.source
      WHERE f.status='active' AND (lower(f.canonical_name) LIKE ? OR lower(COALESCE(f.display_name_zh,'')) LIKE ? OR lower(f.display_name_en) LIKE ? OR lower(COALESCE(a.normalized_alias,'')) LIKE ?)
      ORDER BY rank,f.data_quality DESC LIMIT 12`).bind(normalized, normalized, normalized, region || "", like, like, like, like).all<Record<string, any>>();
    const recent = userId ? await env.DB.prepare(`SELECT mi.name,mi.source,mi.source_ref,
      CASE WHEN mi.grams>0 THEN mi.calories*100/mi.grams ELSE 0 END AS calories,
      CASE WHEN mi.grams>0 THEN mi.protein_g*100/mi.grams ELSE 0 END AS protein_g,
      CASE WHEN mi.grams>0 THEN mi.carbs_g*100/mi.grams ELSE 0 END AS carbs_g,
      CASE WHEN mi.grams>0 THEN mi.fat_g*100/mi.grams ELSE 0 END AS fat_g,MAX(mi.created_at) AS updated_at
      FROM meal_items mi WHERE mi.user_id=? AND lower(mi.name) LIKE ? GROUP BY mi.name,mi.source,mi.source_ref ORDER BY updated_at DESC LIMIT 5`)
      .bind(userId, like).all<Record<string, any>>() : { results: [] };
    const recentItems = (recent.results || []).map((row) => ({ ref: `${row.source}:${row.source_ref || row.name}`, source: (row.source || "user") as NutritionReference["source"], sourceRef: String(row.source_ref || row.name),
      name: String(row.name), brand: null, servingSize: null, per100g: { calories: safeNumber(row.calories), proteinG: safeNumber(row.protein_g), carbsG: safeNumber(row.carbs_g), fatG: safeNumber(row.fat_g) },
      sourceKind: row.source === "manual" ? "user" : "official", dataQuality: .9, attribution: "你的最近记录", region: null, updatedAt: String(row.updated_at) } satisfies NutritionReference));
    return [...recentItems, ...(rows.results || []).map((row) => localFoodRow(row, _locale))];
  } catch {
    // Forward-compatible while a newly deployed migration is still being applied.
    return [];
  }
}

async function recordFoodSearch(env: WorkerEnv, userId: string | null | undefined, query: string, locale: string, region: string | null | undefined, resultCount: number, latencyMs: number) {
  if (!env.DB) return;
  try { await env.DB.prepare(`INSERT INTO food_search_events (id,user_id,query_hash,locale,region,result_count,latency_ms,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), userId || null, await sha256(query.toLocaleLowerCase()), locale, region || null, resultCount, latencyMs, new Date().toISOString()).run(); } catch { /* migration may still be pending */ }
}

export async function searchFoods(env: WorkerEnv, query: string, options: { userId?: string | null; locale?: string; region?: string | null; source?: string | null; limit?: number } = {}): Promise<NutritionReference[]> {
  const started = Date.now();
  const clean = query.trim().slice(0, 100);
  if (clean.length < 2) return [];
  const locale = toLocale(options.locale);
  const local = await localFoodSearch(env, clean, options.userId, locale, options.region);
  const requests: Promise<NutritionReference[]>[] = [];
  requests.push(fetch(`https://world.openfoodfacts.org/cgi/search.pl?${new URLSearchParams({
    search_terms: clean,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "10",
    fields: "code,product_name,product_name_en,product_name_zh,brands,serving_size,nutriments,completeness",
  })}`, {
    headers: { "user-agent": "Cmine Fit/1.0 (https://fit.chwjh.com)", accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) return [];
    const payload = await response.json() as { products?: Record<string, any>[] };
    return (payload.products || []).map(offItem).filter((item): item is NutritionReference => Boolean(item));
  }).catch(() => []));
  if (env.USDA_API_KEY) {
    // API key travels in a header, not the query string, so it never lands in
    // upstream access logs or referrers.
    requests.push(fetch("https://api.nal.usda.gov/fdc/v1/foods/search", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-api-key": env.USDA_API_KEY },
      body: JSON.stringify({ query: clean, pageSize: 8 }),
    }).then(async (response) => {
      if (!response.ok) return [];
      const payload = await response.json() as { foods?: Record<string, any>[] };
      return (payload.foods || []).map(usdaItem).filter((item): item is NutritionReference => Boolean(item));
    }).catch(() => []));
  }
  const remote = (await Promise.all(requests)).flat().filter((item) =>
    item.per100g.calories > 0 || item.per100g.proteinG > 0 || item.per100g.carbsG > 0 || item.per100g.fatG > 0);
  const filtered = options.source ? [...local, ...remote].filter((item) => item.source === options.source) : [...local, ...remote];
  const unique = [...new Map(filtered.map((item) => [item.ref, item])).values()].slice(0, Math.min(30, Math.max(1, options.limit || 15)));
  await Promise.all(unique.map((item) => cacheReference(env, item)));
  await recordFoodSearch(env, options.userId, clean, locale, options.region, unique.length, Date.now() - started);
  return unique;
}

export async function foodByBarcode(env: WorkerEnv, barcode: string): Promise<NutritionReference | null> {
  const clean = barcode.replace(/\D/g, "").slice(0, 20);
  if (clean.length < 8) return null;
  const cached = await cachedReference(env, `open_food_facts:${clean}`);
  if (cached) return cached;
  const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${clean}.json?fields=code,product_name,product_name_en,product_name_zh,brands,serving_size,nutriments,completeness`, {
    headers: { "user-agent": "Cmine Fit/1.0 (https://fit.chwjh.com)", accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json() as { status?: string | number; product?: Record<string, any> };
  const item = payload.product ? offItem(payload.product) : null;
  if (item) await cacheReference(env, item);
  return item;
}

export async function uploadMealImage(env: WorkerEnv, user: StoredUser, file: File, mealType: string, eatenAt: string) {
  // IMAGES is checked here for the same reason DB and R2 are: without the guard
  // the call below throws a TypeError that the route reports as "invalid image",
  // blaming the user's photo for a missing binding.
  if (!env.DB || !env.R2 || !env.IMAGES) throw new Error("MEAL_STORAGE_NOT_CONFIGURED");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 64 || file.size > 8 * 1024 * 1024) {
    throw new Error("INVALID_MEAL_IMAGE");
  }
  const original = await file.arrayBuffer();
  if (!validImageMagic(new Uint8Array(original).subarray(0, 16))) throw new Error("INVALID_MEAL_IMAGE");
  const transformed = await env.IMAGES.input(new Blob([original]).stream())
    .transform({ width: 1600, fit: "scale-down" })
    .output({ format: "image/jpeg", quality: 82 });
  const output = await transformed.response();
  const bytes = await output.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("MEAL_IMAGE_TOO_LARGE");
  const now = new Date();
  const mealId = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  const objectKey = `meals/${user.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${imageId}.jpg`;
  await env.R2.put(objectKey, bytes, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: "private, max-age=0" },
    customMetadata: { userId: user.id, mealId },
  });
  const retentionUntil = new Date(now.getTime() + 7 * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO meal_logs
      (id, user_id, meal_type, status, eaten_at, note, calories, protein_g, carbs_g, fat_g, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, '', 0, 0, 0, 0, ?, ?)`)
      .bind(mealId, user.id, mealType, eatenAt, now.toISOString(), now.toISOString()),
    env.DB.prepare(`INSERT INTO meal_images
      (id, meal_id, user_id, object_key, content_type, size_bytes, retention_until, created_at)
      VALUES (?, ?, ?, ?, 'image/jpeg', ?, ?, ?)`)
      .bind(imageId, mealId, user.id, objectKey, bytes.byteLength, retentionUntil, now.toISOString()),
  ]);
  return { mealId, imageId, retentionUntil };
}

export async function analyzeMeal(env: WorkerEnv, user: StoredUser, mealId: string) {
  if (!env.DB || !env.R2) throw new Error("MEAL_STORAGE_NOT_CONFIGURED");
  const image = await env.DB.prepare(`SELECT object_key FROM meal_images WHERE meal_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(mealId, user.id).first<{ object_key: string }>();
  if (!image) throw new Error("MEAL_NOT_FOUND");
  const quota = await consumeCapability(env, user.id, "meal.scan");
  if (!quota.ok) throw new Error("MEAL_SCAN_LIMIT_REACHED");
  const object = await env.R2.get(image.object_key);
  if (!object) {
    await refundCapability(env, user.id, "meal.scan");
    throw new Error("MEAL_IMAGE_NOT_FOUND");
  }
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  try {
    const bytes = await object.arrayBuffer();
    const tier = await tierForUser(env, user.id);
    const result = await generateMealVision(env, `data:image/jpeg;base64,${arrayBufferToBase64(bytes)}`, tier, user.id, toLocale(user.locale));
    // Recorded immediately: assertAiBudget sums generation_runs, and the food
    // lookups below can throw, which would otherwise lose an already-billed
    // call from the spend total.
    await recordGenerationRun(env, {
      userId: user.id, status: "succeeded", model: result.model, provider: result.provider, task: "meal_vision",
      latencyMs: Date.now() - startedAt, requestId: result.requestId,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      // As with training_plan: the candidate names are bilingual, so there is no
      // single content language to record until this task goes single-locale.
      locale: toLocale(user.locale),
    }).catch((error) => console.error("generation_run_write_failed", "meal_vision", error instanceof Error ? error.message : "UNKNOWN"));
    const suggestions: Array<NutritionReference | null> = [];
    for (const candidate of result.candidates.slice(0, 3)) {
      const matches = await searchFoods(env, candidate.nameEn || candidate.nameZh);
      suggestions.push(matches[0] || null);
    }
    const candidates = result.candidates.map((candidate, index) => ({ ...candidate, suggestedFood: suggestions[index] || null }));
    await env.DB.prepare(`INSERT INTO meal_analysis_runs
      (id, meal_id, user_id, provider, model, status, result_json, confidence, latency_ms, error_code, estimated_cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, NULL, ?, ?)`)
      .bind(runId, mealId, user.id, result.provider, result.model, JSON.stringify({ candidates, needsReview: result.needsReview }),
        result.candidates.reduce((sum, item) => sum + item.confidence, 0) / result.candidates.length,
        Date.now() - startedAt, result.estimatedCostUsd, new Date().toISOString()).run();
    return { ...result, candidates, quota };
  } catch (error) {
    await refundCapability(env, user.id, "meal.scan");
    // Meal failures are tracked in meal_analysis_runs (mealAnalysisSuccessRate).
    // They are deliberately NOT written to generation_runs: a budget refusal or
    // a missing route never reached a provider, and counting it as a failed
    // generation would make the admin AI success rate drop every time the spend
    // guard did its job.
    await env.DB.prepare(`INSERT INTO meal_analysis_runs
      (id, meal_id, user_id, provider, model, status, result_json, confidence, latency_ms, error_code, estimated_cost_usd, created_at)
      VALUES (?, ?, ?, 'none', 'none', 'failed', NULL, NULL, ?, ?, 0, ?)`)
      .bind(runId, mealId, user.id, Date.now() - startedAt, error instanceof Error ? error.message.slice(0, 100) : "UNKNOWN",
        new Date().toISOString()).run();
    throw error;
  }
}

async function resolveMealItems(env: WorkerEnv, items: MealItemInput[]) {
  if (!items.length || items.length > 20) throw new Error("INVALID_MEAL_ITEMS");
  const resolved = [];
  for (const item of items) {
    const name = String(item.name || "").trim().slice(0, 120);
    const grams = Number(item.grams);
    if (!name || !Number.isFinite(grams) || grams < 1 || grams > 5000) throw new Error("INVALID_MEAL_ITEMS");
    const reference = item.nutritionRef ? await cachedReference(env, item.nutritionRef) : null;
    const manual = item.manualPer100g;
    const per100g = reference?.per100g || (manual ? {
      calories: safeNumber(manual.calories),
      proteinG: safeNumber(manual.proteinG),
      carbsG: safeNumber(manual.carbsG),
      fatG: safeNumber(manual.fatG),
    } : null);
    if (!per100g) throw new Error("NUTRITION_REFERENCE_REQUIRED");
    if (per100g.calories <= 0 && per100g.proteinG <= 0 && per100g.carbsG <= 0 && per100g.fatG <= 0) {
      throw new Error("NUTRITION_REFERENCE_REQUIRED");
    }
    const factor = grams / 100;
    resolved.push({
      name,
      grams: round(grams),
      source: reference?.source || "manual",
      sourceRef: reference?.sourceRef || null,
      calories: round(per100g.calories * factor),
      proteinG: round(per100g.proteinG * factor),
      carbsG: round(per100g.carbsG * factor),
      fatG: round(per100g.fatG * factor),
      confidence: item.confidence === undefined ? null : Math.max(0, Math.min(1, Number(item.confidence))),
      userCorrected: Boolean(item.userCorrected),
    });
  }
  return resolved;
}

export async function confirmMeal(env: WorkerEnv, user: StoredUser, mealId: string, input: {
  mealType?: string;
  eatenAt?: string;
  note?: string;
  items: MealItemInput[];
}) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const meal = await env.DB.prepare("SELECT id FROM meal_logs WHERE id = ? AND user_id = ?").bind(mealId, user.id).first();
  if (!meal) throw new Error("MEAL_NOT_FOUND");
  const items = await resolveMealItems(env, input.items);
  const totals = items.reduce((sum, item) => ({
    calories: sum.calories + item.calories,
    proteinG: sum.proteinG + item.proteinG,
    carbsG: sum.carbsG + item.carbsG,
    fatG: sum.fatG + item.fatG,
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare("DELETE FROM meal_items WHERE meal_id = ? AND user_id = ?").bind(mealId, user.id),
    env.DB.prepare(`UPDATE meal_logs SET meal_type=COALESCE(?, meal_type), eaten_at=COALESCE(?, eaten_at), note=?,
      status='confirmed', calories=?, protein_g=?, carbs_g=?, fat_g=?, updated_at=? WHERE id=? AND user_id=?`)
      .bind(input.mealType || null, input.eatenAt || null, String(input.note || "").slice(0, 300),
        round(totals.calories), round(totals.proteinG), round(totals.carbsG), round(totals.fatG), now, mealId, user.id),
    ...items.map((item) => env.DB!.prepare(`INSERT INTO meal_items
      (id, meal_id, user_id, name, grams, source, source_ref, calories, protein_g, carbs_g, fat_g, confidence, user_corrected, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), mealId, user.id, item.name, item.grams, item.source, item.sourceRef,
        item.calories, item.proteinG, item.carbsG, item.fatG, item.confidence, item.userCorrected ? 1 : 0, now)),
  ];
  await env.DB.batch(statements);
  return { mealId, totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value)])), items };
}

export async function createManualMeal(env: WorkerEnv, user: StoredUser, input: {
  mealType: string;
  eatenAt: string;
  note?: string;
  items: MealItemInput[];
}) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const mealId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO meal_logs
    (id, user_id, meal_type, status, eaten_at, note, calories, protein_g, carbs_g, fat_g, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, 0, 0, 0, 0, ?, ?)`)
    .bind(mealId, user.id, input.mealType, input.eatenAt, String(input.note || "").slice(0, 300), now, now).run();
  return confirmMeal(env, user, mealId, input);
}

export async function mealsForUser(env: WorkerEnv, userId: string, limit = 30) {
  if (!env.DB) return [];
  const rows = await env.DB.prepare(`SELECT id, meal_type, status, eaten_at, note, calories, protein_g, carbs_g, fat_g, created_at
    FROM meal_logs WHERE user_id = ? ORDER BY eaten_at DESC LIMIT ?`).bind(userId, Math.min(100, Math.max(1, limit)))
    .all<Record<string, any>>();
  const meals = [];
  for (const row of rows.results || []) {
    const items = await env.DB.prepare(`SELECT id, name, grams, source, source_ref, calories, protein_g, carbs_g, fat_g,
      confidence, user_corrected FROM meal_items WHERE meal_id = ? AND user_id = ? ORDER BY created_at`)
      .bind(row.id, userId).all<Record<string, any>>();
    meals.push({
      id: row.id,
      mealType: row.meal_type,
      status: row.status,
      eatenAt: row.eaten_at,
      note: row.note || "",
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      items: (items.results || []).map((item) => ({
        id: item.id, name: item.name, grams: item.grams, source: item.source, sourceRef: item.source_ref,
        calories: item.calories, proteinG: item.protein_g, carbsG: item.carbs_g, fatG: item.fat_g,
        confidence: item.confidence, userCorrected: Boolean(item.user_corrected),
      })),
    });
  }
  return meals;
}

export async function dailyNutrition(env: WorkerEnv, userId: string, date: string) {
  if (!env.DB) return { date, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: 0 };
  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS meals, COALESCE(SUM(calories), 0) AS calories,
    COALESCE(SUM(protein_g), 0) AS protein_g, COALESCE(SUM(carbs_g), 0) AS carbs_g, COALESCE(SUM(fat_g), 0) AS fat_g
    FROM meal_logs WHERE user_id = ? AND status = 'confirmed' AND eaten_at BETWEEN ? AND ?`)
    .bind(userId, start, end).first<Record<string, any>>();
  return {
    date,
    meals: Number(row?.meals || 0),
    calories: round(Number(row?.calories || 0)),
    proteinG: round(Number(row?.protein_g || 0)),
    carbsG: round(Number(row?.carbs_g || 0)),
    fatG: round(Number(row?.fat_g || 0)),
  };
}

export async function deleteMealImage(env: WorkerEnv, userId: string, imageId: string) {
  if (!env.DB || !env.R2) throw new Error("MEAL_STORAGE_NOT_CONFIGURED");
  const row = await env.DB.prepare("SELECT object_key FROM meal_images WHERE id = ? AND user_id = ?")
    .bind(imageId, userId).first<{ object_key: string }>();
  if (!row) throw new Error("MEAL_IMAGE_NOT_FOUND");
  await env.R2.delete(row.object_key);
  await env.DB.prepare("DELETE FROM meal_images WHERE id = ? AND user_id = ?").bind(imageId, userId).run();
}

export async function foodReference(env: WorkerEnv, ref: string): Promise<NutritionReference | null> {
  return cachedReference(env, ref);
}

export async function createCustomFood(env: WorkerEnv, user: StoredUser, input: {
  name: string; nameEn?: string; servingLabel?: string; servingGrams?: number;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
}) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const name = String(input.name || "").trim().slice(0, 120);
  const values = input.per100g || {} as typeof input.per100g;
  const per100g = { calories: safeNumber(values.calories), proteinG: safeNumber(values.proteinG), carbsG: safeNumber(values.carbsG), fatG: safeNumber(values.fatG) };
  if (!name || Object.values(per100g).every((value) => value <= 0) || per100g.calories > 1000 || per100g.proteinG > 100 || per100g.carbsG > 100 || per100g.fatG > 100) throw new Error("INVALID_CUSTOM_FOOD");
  const canonicalId = crypto.randomUUID(); const sourceRef = `${user.id}:${canonicalId}`; const recordId = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO canonical_foods (id,canonical_name,display_name_zh,display_name_en,category,region,source_kind,data_quality,status,created_at,updated_at)
      VALUES (?,?,?,?,NULL,NULL,'user',1,'active',?,?)`).bind(canonicalId, name.toLocaleLowerCase(), name, String(input.nameEn || name).trim().slice(0, 120), now, now),
    env.DB.prepare(`INSERT INTO food_source_records (id,canonical_food_id,source,source_ref,source_revision,brand,locale,payload_json,retrieved_at,updated_at)
      VALUES (?,?,'user',?,NULL,NULL,?,?,?,?)`).bind(recordId, canonicalId, sourceRef, user.locale, JSON.stringify({ owner: user.id }), now, now),
    env.DB.prepare(`INSERT INTO food_nutrients (id,canonical_food_id,source_record_id,basis_grams,calories,protein_g,carbs_g,fat_g,calculation_method,updated_at)
      VALUES (?,?,?,100,?,?,?,?, 'user_label',?)`).bind(crypto.randomUUID(), canonicalId, recordId, per100g.calories, per100g.proteinG, per100g.carbsG, per100g.fatG, now),
    env.DB.prepare(`INSERT INTO food_aliases (id,canonical_food_id,locale,alias,normalized_alias,kind) VALUES (?,?,?,?,?,'primary')`)
      .bind(crypto.randomUUID(), canonicalId, user.locale, name, name.toLocaleLowerCase()),
  ]);
  const food: NutritionReference = { ref: `user:${sourceRef}`, source: "user", sourceRef, canonicalId, name, brand: null,
    servingSize: input.servingLabel ? `${String(input.servingLabel).slice(0, 50)}${input.servingGrams ? ` · ${safeNumber(input.servingGrams)}g` : ""}` : null,
    per100g, sourceKind: "user", dataQuality: 1, attribution: "由你录入", region: null, updatedAt: now };
  await cacheReference(env, food);
  return food;
}

export async function submitFoodCorrection(env: WorkerEnv, userId: string, ref: string, correction: Record<string, unknown>) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const [source, ...parts] = ref.split(":"); const sourceRef = parts.join(":");
  if (!source || !sourceRef || JSON.stringify(correction).length > 2000) throw new Error("INVALID_CORRECTION");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO food_corrections (id,user_id,canonical_food_id,source,source_ref,correction_json,status,created_at)
    VALUES (?,?,NULL,?,?,?,'pending',?)`).bind(id, userId, source, sourceRef, JSON.stringify(correction), now).run();
  return { id, status: "pending", createdAt: now };
}

export async function createRecipe(env: WorkerEnv, user: StoredUser, input: { name: string; servings: number; cookedWeightG?: number | null; items: MealItemInput[] }) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const name = String(input.name || "").trim().slice(0, 120); const servings = Number(input.servings);
  if (!name || !Number.isFinite(servings) || servings <= 0 || servings > 100) throw new Error("INVALID_RECIPE");
  const items = await resolveMealItems(env, input.items);
  const totals = items.reduce((sum, item) => ({ calories: sum.calories + item.calories, proteinG: sum.proteinG + item.proteinG, carbsG: sum.carbsG + item.carbsG, fatG: sum.fatG + item.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const cookedWeight = input.cookedWeightG === null || input.cookedWeightG === undefined ? null : safeNumber(input.cookedWeightG);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO recipes (id,user_id,name,servings,cooked_weight_g,calories,protein_g,carbs_g,fat_g,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)`).bind(id, user.id, name, servings, cookedWeight, round(totals.calories), round(totals.proteinG), round(totals.carbsG), round(totals.fatG), now, now),
    ...items.map((item) => env.DB!.prepare(`INSERT INTO recipe_items (id,recipe_id,user_id,name,grams,source,source_ref,calories,protein_g,carbs_g,fat_g,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, user.id, item.name, item.grams, item.source, item.sourceRef, item.calories, item.proteinG, item.carbsG, item.fatG, now)),
  ]);
  return { id, name, servings, cookedWeightG: cookedWeight, totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value)])),
    perServing: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value / servings)])), items, createdAt: now };
}

export async function recipesForUser(env: WorkerEnv, userId: string) {
  if (!env.DB) return [];
  const rows = await env.DB.prepare(`SELECT id,name,servings,cooked_weight_g,calories,protein_g,carbs_g,fat_g,updated_at FROM recipes
    WHERE user_id=? AND status='active' ORDER BY updated_at DESC LIMIT 100`).bind(userId).all<Record<string, any>>();
  return (rows.results || []).map((row) => ({ id: row.id, name: row.name, servings: row.servings, cookedWeightG: row.cooked_weight_g,
    totals: { calories: row.calories, proteinG: row.protein_g, carbsG: row.carbs_g, fatG: row.fat_g }, updatedAt: row.updated_at }));
}

export async function recalculateRecipe(env: WorkerEnv, userId: string, recipeId: string, input?: { servings?: number; cookedWeightG?: number | null; items?: MealItemInput[] }) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const recipe = await env.DB.prepare("SELECT id,servings FROM recipes WHERE id=? AND user_id=? AND status='active'").bind(recipeId, userId).first<{ id: string; servings: number }>();
  if (!recipe) throw new Error("RECIPE_NOT_FOUND");
  let items: Array<{ name: string; grams: number; source: string; sourceRef: string | null; calories: number; proteinG: number; carbsG: number; fatG: number }>;
  if (input?.items?.length) {
    items = await resolveMealItems(env, input.items);
  } else {
    const rows = await env.DB.prepare(`SELECT name,grams,source,source_ref,calories,protein_g,carbs_g,fat_g FROM recipe_items WHERE recipe_id=? AND user_id=? ORDER BY created_at`)
      .bind(recipeId, userId).all<Record<string, any>>();
    items = (rows.results || []).map((row) => ({ name: String(row.name), grams: Number(row.grams), source: String(row.source), sourceRef: row.source_ref ? String(row.source_ref) : null,
      calories: Number(row.calories), proteinG: Number(row.protein_g), carbsG: Number(row.carbs_g), fatG: Number(row.fat_g) }));
  }
  if (!items.length) throw new Error("INVALID_RECIPE");
  const servings = Number(input?.servings || recipe.servings); if (!Number.isFinite(servings) || servings <= 0 || servings > 100) throw new Error("INVALID_RECIPE");
  const totals = items.reduce((sum, item) => ({ calories: sum.calories + item.calories, proteinG: sum.proteinG + item.proteinG, carbsG: sum.carbsG + item.carbsG, fatG: sum.fatG + item.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const now = new Date().toISOString(); const cookedWeight = input?.cookedWeightG === undefined ? null : input.cookedWeightG === null ? null : safeNumber(input.cookedWeightG);
  const statements = [env.DB.prepare(`UPDATE recipes SET servings=?,cooked_weight_g=COALESCE(?,cooked_weight_g),calories=?,protein_g=?,carbs_g=?,fat_g=?,updated_at=? WHERE id=? AND user_id=?`)
    .bind(servings, cookedWeight, round(totals.calories), round(totals.proteinG), round(totals.carbsG), round(totals.fatG), now, recipeId, userId)];
  if (input?.items?.length) {
    statements.push(env.DB.prepare("DELETE FROM recipe_items WHERE recipe_id=? AND user_id=?").bind(recipeId, userId));
    for (const item of items) statements.push(env.DB.prepare(`INSERT INTO recipe_items (id,recipe_id,user_id,name,grams,source,source_ref,calories,protein_g,carbs_g,fat_g,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), recipeId, userId, item.name, item.grams, item.source, item.sourceRef, item.calories, item.proteinG, item.carbsG, item.fatG, now));
  }
  await env.DB.batch(statements);
  return { id: recipeId, servings, cookedWeightG: cookedWeight, totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value)])),
    perServing: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value / servings)])), items, updatedAt: now };
}

export async function createMealTemplate(env: WorkerEnv, userId: string, input: { name: string; mealType: string; items: MealItemInput[] }) {
  if (!env.DB) throw new Error("DATABASE_NOT_CONFIGURED");
  const name = String(input.name || "").trim().slice(0, 100); if (!name) throw new Error("INVALID_TEMPLATE");
  const items = await resolveMealItems(env, input.items);
  const totals = items.reduce((sum, item) => ({ calories: sum.calories + item.calories, proteinG: sum.proteinG + item.proteinG, carbsG: sum.carbsG + item.carbsG, fatG: sum.fatG + item.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO meal_templates (id,user_id,name,meal_type,items_json,calories,protein_g,carbs_g,fat_g,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id, userId, name, String(input.mealType || "other").slice(0, 30), JSON.stringify(items), round(totals.calories), round(totals.proteinG), round(totals.carbsG), round(totals.fatG), now, now).run();
  return { id, name, mealType: input.mealType, items, totals, createdAt: now };
}

export async function mealTemplatesForUser(env: WorkerEnv, userId: string) {
  if (!env.DB) return [];
  const rows = await env.DB.prepare(`SELECT id,name,meal_type,items_json,calories,protein_g,carbs_g,fat_g,last_used_at,updated_at
    FROM meal_templates WHERE user_id=? ORDER BY COALESCE(last_used_at,updated_at) DESC LIMIT 100`).bind(userId).all<Record<string, any>>();
  return (rows.results || []).map((row) => ({ id: row.id, name: row.name, mealType: row.meal_type,
    items: (() => { try { return JSON.parse(row.items_json); } catch { return []; } })(), totals: { calories: row.calories, proteinG: row.protein_g, carbsG: row.carbs_g, fatG: row.fat_g }, lastUsedAt: row.last_used_at, updatedAt: row.updated_at }));
}

export type { MealCandidate };
