import { Tabs } from "expo-router";
import { useEffect } from "react";
import { initializeOfflineStore } from "../src/offline";
import { theme } from "../src/theme";
export default function Layout() { useEffect(() => { void initializeOfflineStore(); }, []); return <Tabs screenOptions={{ headerStyle: { backgroundColor: theme.paper }, headerShadowVisible: false, tabBarStyle: { backgroundColor: theme.ink }, tabBarActiveTintColor: theme.acid, tabBarInactiveTintColor: "#777b72" }}><Tabs.Screen name="index" options={{ title: "今日" }} /><Tabs.Screen name="coach" options={{ title: "Coach" }} /><Tabs.Screen name="nutrition" options={{ title: "饮食" }} /><Tabs.Screen name="progress" options={{ title: "进度" }} /><Tabs.Screen name="account" options={{ title: "我的" }} /></Tabs>; }
