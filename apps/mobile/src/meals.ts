import * as ImageManipulator from "expo-image-manipulator";
import { api, apiRequest, ApiError } from "./api";

export type { FoodReference as NutritionReference } from "../../../packages/api-contracts/src";
export type { MealCandidateMatch as MealCandidate } from "../../../packages/api-contracts/src";

export type AnalyzeResult = {
  candidates: MealCandidate[];
  needsReview: boolean;
  quota?: { remaining: number; limit: number };
};

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
  { value: "snack", label: "加餐" },
  { value: "other", label: "其他" },
];

// The server rejects anything over 8MB or not JPEG/PNG/WebP, and rejects again
// if its own transform still leaves the image above 2MB. iOS hands back HEIC by
// default, which fails both checks — so normalize to JPEG and downscale here
// rather than letting the upload fail after the user has already waited.
export async function prepareImage(uri: string): Promise<string> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri).resize({ width: 1600 });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.75, format: ImageManipulator.SaveFormat.JPEG });
  return result.uri;
}

export async function uploadMealPhoto(uri: string, mealType: MealType): Promise<{ mealId: string; imageId: string }> {
  const prepared = await prepareImage(uri);
  const form = new FormData();
  // React Native's FormData takes this file descriptor shape; the cast is the
  // documented way to satisfy the DOM typings it does not actually implement.
  form.append("image", { uri: prepared, name: "meal.jpg", type: "image/jpeg" } as unknown as Blob);
  form.append("mealType", mealType);
  form.append("eatenAt", new Date().toISOString());
  const response = await apiRequest("/api/v1/meals/upload", { method: "POST", body: form });
  const body = await response.json().catch(() => null) as { mealId?: string; imageId?: string; message?: string } | null;
  if (!response.ok || !body?.mealId) throw new ApiError(body?.message || `API_${response.status}`, response.status);
  return { mealId: body.mealId, imageId: body.imageId || "" };
}

export const analyzeMeal = (mealId: string) =>
  api<AnalyzeResult>("/api/v1/meals/analyze", { method: "POST", body: JSON.stringify({ mealId }) });

export type ConfirmItem = { name: string; grams: number; nutritionRef: string };

export const confirmMeal = (mealId: string, items: ConfirmItem[], mealType: MealType) =>
  api<{ meal: { id: string; calories: number } }>(`/api/v1/meals/${encodeURIComponent(mealId)}/confirm`, {
    method: "POST",
    // userCorrected records that a human set the portion — the server refuses to
    // compute macros from a photo estimate alone (NUTRITION_REFERENCE_REQUIRED).
    body: JSON.stringify({ mealType, items: items.map((item) => ({ ...item, userCorrected: true })) }),
  });

export const foodByBarcode = (code: string) =>
  api<{ food: NutritionReference }>(`/api/v1/foods/barcode/${encodeURIComponent(code)}`);

export const logSingleFood = (food: NutritionReference, grams: number, mealType: MealType) =>
  api<{ meal: { id: string } }>("/api/v1/meals", {
    method: "POST",
    body: JSON.stringify({
      mealType, eatenAt: new Date().toISOString(),
      items: [{ name: food.name, grams, nutritionRef: food.ref, userCorrected: true }],
    }),
  });

export const mealScanQuota = () =>
  api<{ capabilities: Record<string, { used: number; limit: number; remaining: number }> }>("/api/v1/usage")
    .then((usage) => usage.capabilities["meal.scan"] || null)
    .catch(() => null);
