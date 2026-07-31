import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Screen, styles } from "../src/Screen";
import { api } from "../src/api";
import { cachedValue, cacheValue, synchronize } from "../src/offline";

type Localized = { zh: string; en?: string };
type Exercise = {
  id: string;
  target: Localized;
  name: Localized;
  sets: number;
  reps: string | number;
  rest: string;
};
type PlanDay = { title: Localized; focus: Localized; duration: number; exercises: Exercise[] };
type AccountSnapshot = { latestPlan?: { plan?: { schedule?: PlanDay[] } } };

export default function Today() {
  const [data, setData] = useState<AccountSnapshot | null>(null);
  useEffect(() => {
    void (async () => {
      const cached = await cachedValue<AccountSnapshot>("account");
      if (cached) setData(cached);
      try {
        const fresh = await api<AccountSnapshot>("/api/v1/me");
        setData(fresh);
        await cacheValue("account", fresh);
        await synchronize();
      } catch { /* Keep the cached plan useful while offline. */ }
    })();
  }, []);
  const day = data?.latestPlan?.plan?.schedule?.[(new Date().getDay() + 6) % 7];
  return <Screen eyebrow="TODAY / 今日训练" title={day?.title?.zh || "今天，按自己的节奏来"}>
    <View style={styles.card}>
      <Text style={styles.label}>{day?.focus?.zh || "登录后同步你的专属计划"}</Text>
      <Text style={styles.value}>{day ? `${day.duration} 分钟 · ${day.exercises.length} 个动作` : "尚无可用计划"}</Text>
    </View>
    {day?.exercises?.map((exercise, index) => <View key={exercise.id} style={styles.card}>
      <Text style={styles.label}>{String(index + 1).padStart(2, "0")} · {exercise.target.zh}</Text>
      <Text style={styles.value}>{exercise.name.zh}</Text>
      <Text>{exercise.sets} 组 · {exercise.reps} 次 · {exercise.rest}</Text>
    </View>)}
  </Screen>;
}
