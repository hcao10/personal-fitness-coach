import type { ReviewMetrics, ReviewRecommendation } from "../../api-contracts/src";
import { median } from "simple-statistics";

export type WeeklyEvidence = {
  plannedSessions: number;
  sessions: Array<{ rpe: number | null; pain: number; completedAt: string }>;
  measurements: Array<{ weightKg: number | null; measuredAt: string }>;
  consecutiveEligibleWeeks: number;
  sets?: Array<{ weightKg: number | null; reps: number | null; rir: number | null; completed: boolean }>;
  previousWeeklyVolumes?: number[];
  nutritionDays?: Array<{ calories: number; proteinG: number }>;
  calorieTarget?: number;
  proteinTarget?: number;
};

function weightTrend(measurements: WeeklyEvidence["measurements"]): number | null {
  const points = measurements.filter((item) => Number.isFinite(item.weightKg)).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (points.length < 2) return null;
  const origin = new Date(points[0].measuredAt).getTime();
  const series = points.map((item) => [(new Date(item.measuredAt).getTime() - origin) / 86_400_000, Number(item.weightKg)] as [number, number]);
  const slopes: number[] = [];
  for (let left = 0; left < series.length; left += 1) {
    for (let right = left + 1; right < series.length; right += 1) {
      const days = series[right][0] - series[left][0];
      if (days > 0) slopes.push((series[right][1] - series[left][1]) / days);
    }
  }
  return slopes.length ? Number((median(slopes) * 7).toFixed(2)) : null;
}

export function calculateWeeklyReview(evidence: WeeklyEvidence, goal: string): ReviewMetrics {
  const completedSessions = evidence.sessions.length;
  const adherencePct = evidence.plannedSessions > 0 ? Math.min(100, Math.round(completedSessions / evidence.plannedSessions * 100)) : 0;
  const rpes = evidence.sessions.map((item) => item.rpe).filter((value): value is number => Number.isFinite(value));
  const averageRpe = rpes.length ? Number((rpes.reduce((sum, value) => sum + value, 0) / rpes.length).toFixed(1)) : null;
  const maxPain = evidence.sessions.reduce((max, item) => Math.max(max, Number(item.pain || 0)), 0);
  const trend = weightTrend(evidence.measurements);
  const completedSetRows = (evidence.sets || []).filter((item) => item.completed);
  const trainingVolumeKg = Number(completedSetRows.reduce((sum, item) => sum + Number(item.weightKg || 0) * Number(item.reps || 0), 0).toFixed(1));
  const rirs = completedSetRows.map((item) => item.rir).filter((value): value is number => Number.isFinite(value));
  const averageRir = rirs.length ? Number((rirs.reduce((sum, value) => sum + value, 0) / rirs.length).toFixed(1)) : null;
  const volumeHistory = [...(evidence.previousWeeklyVolumes || []), trainingVolumeKg].filter((value) => value > 0);
  const volumeTrendPct = volumeHistory.length >= 3 && volumeHistory[0] > 0 ? Number(((volumeHistory[volumeHistory.length - 1] - volumeHistory[0]) / volumeHistory[0] * 100).toFixed(1)) : null;
  const nutritionDays = evidence.nutritionDays || [];
  const calorieAdherencePct = evidence.calorieTarget && nutritionDays.length >= 3
    ? Math.round(nutritionDays.reduce((sum, day) => {
        const deviation = Math.abs(day.calories - evidence.calorieTarget!) / evidence.calorieTarget!;
        return sum + Math.max(0, 1 - deviation * 2);
      }, 0) / nutritionDays.length * 100) : null;
  const proteinAdherencePct = evidence.proteinTarget && nutritionDays.length >= 3
    ? Math.round(nutritionDays.reduce((sum, day) => sum + Math.min(1, day.proteinG / evidence.proteinTarget!), 0) / nutritionDays.length * 100) : null;
  const eligible = completedSessions >= 2;
  const stalledMetric = goal === "muscle"
    ? volumeTrendPct !== null && volumeTrendPct < 1
    : trend !== null && (goal === "fat_loss" ? trend > -0.1 : Math.abs(trend) < 0.05);
  const plateau = eligible && evidence.consecutiveEligibleWeeks >= 3 && adherencePct >= 70 && stalledMetric;
  return { eligible, completedSessions, adherencePct, averageRpe, maxPain, weightTrendKgPerWeek: trend,
    completedSets: completedSetRows.length, trainingVolumeKg, averageRir, volumeTrendPct, nutritionDays: nutritionDays.length,
    calorieAdherencePct, proteinAdherencePct, consecutiveEligibleWeeks: evidence.consecutiveEligibleWeeks, plateau };
}

export function recommendReview(metrics: ReviewMetrics): ReviewRecommendation {
  if (!metrics.eligible) return {
    kind: "collect_more_data", title: "先补充一周记录", explanation: "本周有效训练不足两次，暂时无法可靠判断计划是否需要调整。",
    changes: ["继续当前计划", "完成训练后记录 RPE 与疼痛"], volumeMultiplier: 1, loadMultiplier: 1,
  };
  if (metrics.maxPain >= 4 || (metrics.averageRpe || 0) >= 9) return {
    kind: "deload", title: "建议安排减量周", explanation: "疼痛或训练强度已经达到不适合继续加量的范围。",
    changes: ["训练总组数减少 10%", "负重目标不增加", "持续疼痛时停止相关动作并咨询专业人员"], volumeMultiplier: 0.9, loadMultiplier: 0.95,
  };
  if (metrics.plateau) return {
    kind: "progress", title: "建议小幅重排计划", explanation: "连续三个有效训练周执行稳定，但目标趋势低于预期。",
    changes: ["训练总组数最多增加 10%", "核心动作负重目标最多增加 5%", "保留现有器械与动作限制"], volumeMultiplier: 1.1, loadMultiplier: 1.05,
  };
  return {
    kind: "hold", title: "继续当前节奏", explanation: "当前执行和恢复没有显示需要立即改动计划的信号。",
    changes: ["保持当前训练结构", "下周继续记录恢复与疼痛"], volumeMultiplier: 1, loadMultiplier: 1,
  };
}

// Safety policy lives in ./safety.ts, where it is per-language and severity-
// graded. Re-exported here so existing importers keep working.
export {
  assessSafety, coachSafetyFlags, safetyGuidance, actionsAllowedUnderRisk,
  SAFETY_PATTERNS, SAFETY_GUIDANCE, PAIN_THRESHOLD, INTENSITY_RAISING_ACTIONS,
  MEDICAL_DISCLAIMER, medicalDisclaimer,
  type SafetyAssessment, type SafetyLevel,
} from "./safety.ts";

export {
  detectContentLocale, auditContentLocale, countScripts,
  type LanguageVerdict, type LocaleAudit, type ScriptCounts,
} from "./language.ts";
