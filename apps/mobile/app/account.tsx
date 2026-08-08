import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen, styles } from "../src/Screen";
import { deviceId, signIn, signOut } from "../src/auth";
import { connectHealth } from "../src/health";
import { api } from "../src/api";
import { configureBilling, offerings, purchase, restorePurchases } from "../src/billing";
import type { PurchasesPackage } from "react-native-purchases";
import { registerPush, scheduleLocalTraining } from "../src/notifications";

export default function Account() {
  const [message, setMessage] = useState("");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const loadBilling = async () => {
    const me = await api<{ user: { id: string } }>("/api/v1/me");
    if (!await configureBilling(me.user.id)) { setMessage("应用内购尚未配置"); return; }
    const value = await offerings(); setPackages(value.current?.availablePackages || []);
  };
  return <Screen eyebrow="ACCOUNT / 我的" title="你的训练与数据">
    <Pressable style={styles.button} onPress={async () => { try { await signIn(); setMessage("Cmine ID 登录成功"); await loadBilling(); } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); } }}><Text style={styles.buttonText}>使用 Cmine ID 登录</Text></Pressable>
    <Pressable style={styles.button} onPress={async () => { try { await connectHealth(); setMessage("健康数据已授权"); } catch { setMessage("未获得健康数据授权"); } }}><Text style={styles.buttonText}>连接健康数据</Text></Pressable>
    <Pressable style={styles.button} onPress={async () => { try { const id = await deviceId(); await registerPush(id); await scheduleLocalTraining(); setMessage("本地训练提醒已开启（每天 18:00）"); } catch { setMessage("暂时无法开启提醒"); } }}><Text style={styles.buttonText}>开启本地训练提醒</Text></Pressable>
    {packages.map((item) => <Pressable key={item.identifier} style={styles.button} onPress={async () => { try { await purchase(item); setMessage("Cmine Fit Pro 已启用"); } catch { setMessage("购买未完成"); } }}><Text style={styles.buttonText}>{item.product.title} · {item.product.priceString}</Text></Pressable>)}
    <Pressable onPress={async () => { try { await restorePurchases(); setMessage("购买记录已恢复"); } catch { setMessage("没有可恢复的购买"); } }}><Text>恢复购买</Text></Pressable>
    <View style={styles.card}><Text>{message || "Token 仅存 SecureStore；训练草稿和同步队列保存在本地 SQLite。"}</Text></View>
    <Pressable onPress={() => void signOut()}><Text>安全退出</Text></Pressable>
  </Screen>;
}
