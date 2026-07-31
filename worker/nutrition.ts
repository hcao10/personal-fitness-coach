/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateMealVision, type MealCandidate } from "./llm";
import type { StoredUser } from "./db";
import type { WorkerEnv } from "./platform";
import { consumeCapability, refundCapability, tierForUser } from "./product";

export type NutritionReference = {
  ref: string;
  source: "usda" | "open_food_facts";
  sourceRef: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
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
  };
}

export function foodDataConfigured(): boolean {
  // Open Food Facts is usable without a private key. USDA augments the
  // results when USDA_API_KEY is configured.
  return true;
}

export async function searchFoods(env: WorkerEnv, query: string): Promise<NutritionReference[]> {
  const clean = query.trim().slice(0, 100);
  if (clean.length < 2) return [];
  const requests: Promise<NutritionReference[]>[] = [];
  requests.push(fetch(`https://world.openfoodfacts.org/cgi/search.pl?${new URLSearchParams({
    search_terms: clean,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "8",
    fields: "code,product_name,product_name_en,product_name_zh,brands,serving_size,nutriments",
  })}`, {
    headers: { "user-agent": "Cmine Fit/1.0 (https://fit.chwjh.com)", accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) return [];
    const payload = await response.json() as { products?: Record<string, any>[] };
    return (payload.products || []).map(offItem).filter((item): item is NutritionReference => Boolean(item));
  }).catch(() => []));
  if (env.USDA_API_KEY) {
    requests.push(fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(env.USDA_API_KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: clean, pageSize: 8 }),
    }).then(async (response) => {
      if (!response.ok) return [];
      const payload = await response.json() as { foods?: Record<string, any>[] };
      return (payload.foods || []).map(usdaItem).filter((item): item is NutritionReference => Boolean(item));
    }).catch(() => []));
  }
  const results = (await Promise.all(requests)).flat().filter((item) =>
    item.per100g.calories > 0 || item.per100g.proteinG > 0 || item.per100g.carbsG > 0 || item.per100g.fatG > 0);
  const unique = [...new Map(results.map((item) => [item.ref, item])).values()].slice(0, 12);
  await Promise.all(unique.map((item) => cacheReference(env, item)));
  return unique;
}

export async function foodByBarcode(env: WorkerEnv, barcode: string): Promise<NutritionReference | null> {
  const clean = barcode.replace(/\D/g, "").slice(0, 20);
  if (clean.length < 8) return null;
  const cached = await cachedReference(env, `open_food_facts:${clean}`);
  if (cached) return cached;
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=code,product_name,product_name_en,product_name_zh,brands,serving_size,nutriments`, {
    headers: { "user-agent": "Cmine Fit/1.0 (https://fit.chwjh.com)", accept: "application/json" },
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json() as { status?: number; product?: Record<string, any> };
  const item = payload.status === 1 && payload.product ? offItem(payload.product) : null;
  if (item) await cacheReference(env, item);
  return item;
}

export async function uploadMealImage(env: WorkerEnv, user: StoredUser, file: File, mealType: string, eatenAt: string) {
  if (!env.DB || !env.R2) throw new Error("MEAL_STORAGE_NOT_CONFIGURED");
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
    const result = await generateMealVision(env, `data:image/jpeg;base64,${arrayBufferToBase64(bytes)}`, tier);
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

export type { MealCandidate };
