import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen, styles } from "../src/Screen";
import { deviceId, signIn, signOut } from "../src/auth";
import { connectHealth } from "../src/health";
import { api } from "../src/api";
import { configureBilling, offerings, purchase, restorePurchases } from "../src/billing";
import type { PurchasesPackage } from "react-native-purchases";
import { registerPush, scheduleLocalTraining } from "../src/notifications";
import { theme } from "../src/theme";

export default function Account() {
  const [message, setMessage] = useState("");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [cueTime, setCueTime] = useState("18:00");
  const [cuePlace, setCuePlace] = useState("");
  useEffect(() => {
    void api<{ commitment: { cueTime: string; cuePlace: string | null } | null }>("/api/v1/habits")
      .then((habit) => {
        if (!habit.commitment) return;
        setCueTime(habit.commitment.cueTime);
        setCuePlace(habit.commitment.cuePlace || "");
      })
      .catch(() => undefined);
  }, []);
  // The committed time is when the server-side training reminder fires, so this
  // editor and the push schedule are the same setting.
  const saveCommitment = async () => {
    try {
      await api("/api/v1/habits/commitment", { method: "PUT", body: JSON.stringify({ cueTime, cuePlace }) });
      setMessage(`训练承诺已保存：${cueTime}${cuePlace ? ` · ${cuePlace}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败，时间需为 HH:MM");
    }
  };
  const loadBilling = async () => {
    const me = await api<{ user: { id: string } }>("/api/v1/me");
    if (!await configureBilling(me.user.id)) { setMessage("应用内购尚未配置"); return; }
    const value = await offerings(); setPackages(value.current?.availablePackages || []);
  };
  return <Screen eyebrow="ACCOUNT / 我的" title="你的训练与数据">
    <Pressable style={styles.button} onPress={async () => { try { await signIn(); setMessage("Cmine ID 登录成功"); await loadBilling(); } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); } }}><Text style={styles.buttonText}>使用 Cmine ID 登录</Text></Pressable>
    <Pressable style={styles.button} onPress={async () => { try { await connectHealth(); setMessage("健康数据已授权"); } catch { setMessage("未获得健康数据授权"); } }}><Text style={styles.buttonText}>连接健康数据</Text></Pressable>
    <Pressable style={styles.button} onPress={async () => { try { const id = await deviceId(); await registerPush(id); await scheduleLocalTraining(Number(cueTime.slice(0, 2)) || 18); setMessage(`训练提醒已开启（${cueTime}）`); } catch { setMessage("暂时无法开启提醒"); } }}><Text style={styles.buttonText}>开启训练提醒</Text></Pressable>
    <View style={styles.card} accessibilityLabel="训练承诺">
      <Text style={styles.label}>我的训练承诺</Text>
      <Text style={{ marginTop: 6 }}>固定到具体的时间和地点，坚持会容易得多。提醒会在这个时间发送。</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <TextInput accessibilityLabel="训练时间，24 小时制 HH:MM" value={cueTime} onChangeText={setCueTime} placeholder="18:00"
          style={{ width: 90, borderWidth: 1, borderColor: theme.line, borderRadius: 8, padding: 10 }} />
        <TextInput accessibilityLabel="训练地点" value={cuePlace} onChangeText={setCuePlace} placeholder="如：小区健身房" maxLength={60}
          style={{ flex: 1, borderWidth: 1, borderColor: theme.line, borderRadius: 8, padding: 10 }} />
      </View>
      <Pressable style={[styles.button, { marginTop: 12 }]} onPress={() => void saveCommitment()}><Text style={styles.buttonText}>保存承诺</Text></Pressable>
    </View>
    {packages.map((item) => <Pressable key={item.identifier} style={styles.button} onPress={async () => { try { await purchase(item); setMessage("Cmine Fit Pro 已启用"); } catch { setMessage("购买未完成"); } }}><Text style={styles.buttonText}>{item.product.title} · {item.product.priceString}</Text></Pressable>)}
    <Pressable onPress={async () => { try { await restorePurchases(); setMessage("购买记录已恢复"); } catch { setMessage("没有可恢复的购买"); } }}><Text>恢复购买</Text></Pressable>
    <View style={styles.card}><Text>{message || "Token 仅存 SecureStore；训练草稿和同步队列保存在本地 SQLite。"}</Text></View>
    <Pressable onPress={() => void signOut()}><Text>安全退出</Text></Pressable>
  </Screen>;
}
