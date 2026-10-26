export type BmiCategory = "underweight" | "reference_range" | "above_reference" | "high";

/** BMI is a screening ratio, not a diagnosis or a direct body-fat measure. */
export function calculateBmi(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  return Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1));
}

export function bmiCategory(bmi: number): BmiCategory | null {
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "reference_range";
  if (bmi < 30) return "above_reference";
  return "high";
}

