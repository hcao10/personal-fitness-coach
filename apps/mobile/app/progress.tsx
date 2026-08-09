import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen, styles } from "../src/Screen";
import { api } from "../src/api";
import { theme } from "../src/theme";

type Progress = { completedWorkouts: number; completedExercises: number; latestMeasurement?: { weightKg?: number; bodyFatPct?: number; waistCm?: number } };
type Review = { id: string; weekStart: string; status: string; plateau: boolean; metrics?: { adherencePct?: number; completedSets?: number; trainingVolumeKg?: number; weightTrendKgPerWeek?: number | null }; recommendation?: { title?: string; explanation?: string; locked?: boolean; engine?: { adjustmentCount?: number; teaser?: { zh: string } | null } } };
type Habit = {
  streak: { currentWeeks: number; longestWeeks: number; activeThisWeek: boolean; sessionsThisWeek: number };
  totalSessions: number;
  milestones: Array<{ kind: string; title: { zh: string }; message: { zh: string } }>;
};

export default function Progress() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [habit, setHabit] = useState<Habit | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [p, r, h] = await Promise.all([
        api<Progress>("/api/v1/progress"),
        api<{ reviews: Review[] }>("/api/v1/reviews"),
        api<Habit>("/api/v1/habits"),
      ]);
      setProgress(p);
      setReviews(r.reviews);
      setHabit(h);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败");
    }
  };

  // The request resolves asynchronously; the function is also reused after generating a review.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const current = reviews[0];
  const generate = async () => {
    if (!current) return;
    try {
      await api(`/api/v1/reviews/${current.id}/generate`, { method: "POST" });
      setMessage("复盘草案已生成，确认后才会调整计划。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复盘生成失败");
    }
  };

  const latestMilestone = habit?.milestones.at(-1);

  return <Screen eyebrow="PROGRESS / 周度复盘" title="看清变化，再决定下一步">
    {habit && <View style={[styles.card, { backgroundColor: theme.ink }]}>
      <Text style={[styles.label, { color: theme.acid }]}>训练习惯</Text>
      <Text style={[styles.value, { color: "white" }]}>
        {habit.streak.currentWeeks > 0 ? `连续训练第 ${habit.streak.currentWeeks} 周` : "本周开始你的第一周"}
      </Text>
      <Text style={{ color: "#c9ccc4", marginTop: 6 }}>
        最长 {habit.streak.longestWeeks} 周 · 累计 {habit.totalSessions} 次训练
        {habit.streak.activeThisWeek ? " · 本周已达标" : ` · 本周 ${habit.streak.sessionsThisWeek} 次`}
      </Text>
      {latestMilestone && <Text style={{ color: theme.acid, marginTop: 10 }}>{latestMilestone.title.zh} — {latestMilestone.message.zh}</Text>}
      <Text style={{ color: "#8d918a", marginTop: 10, fontSize: 12 }}>完成 20 分钟缩短版同样算数。</Text>
    </View>}

    <View style={styles.card}>
      <Text style={styles.label}>累计完成</Text>
      <Text style={styles.value}>{progress?.completedWorkouts || 0} 次训练</Text>
      <Text>{progress?.completedExercises || 0} 个动作完成记录</Text>
    </View>

    {progress?.latestMeasurement && <View style={styles.card}>
      <Text style={styles.label}>最近测量</Text>
      <Text style={styles.value}>{progress.latestMeasurement.weightKg || "—"} kg</Text>
      <Text>腰围 {progress.latestMeasurement.waistCm || "—"} cm · 体脂 {progress.latestMeasurement.bodyFatPct || "—"}%</Text>
    </View>}

    {current && <View style={styles.card}>
      <Text style={styles.label}>{current.weekStart} · {current.status}</Text>
      <Text style={styles.value}>{current.recommendation?.title || "本周复盘"}</Text>
      <Text>{current.recommendation?.explanation || "系统会结合完成率、组次、RIR、疼痛、营养和体重趋势。"}</Text>
      {current.metrics && <Text style={{ marginTop: 6 }}>
        完成率 {current.metrics.adherencePct || 0}% · {current.metrics.completedSets || 0} 组 · 训练量 {Math.round(current.metrics.trainingVolumeKg || 0)} kg
      </Text>}
      {current.recommendation?.locked && <Text style={{ marginTop: 8, color: theme.muted }}>
        教练引擎找到了 {current.recommendation.engine?.adjustmentCount || 0} 条针对性调整。{current.recommendation.engine?.teaser?.zh || "升级 Pro 可解锁完整调整方案。"}
      </Text>}
      <Pressable style={[styles.button, { marginTop: 12 }]} onPress={() => void generate()}>
        <Text style={styles.buttonText}>生成复盘草案</Text>
      </Pressable>
    </View>}

    {message ? <Text style={styles.label}>{message}</Text> : null}
  </Screen>;
}
