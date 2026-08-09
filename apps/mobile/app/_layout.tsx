import { Tabs } from "expo-router";
import { useEffect } from "react";
import { initializeOfflineStore } from "../src/offline";
import { theme } from "../src/theme";
import { LocaleProvider, useT } from "../src/locale";

// Split out because the tab titles need the translator, and a hook cannot be
// called in the same component that renders the provider supplying it.
function TabsNavigator() {
  const t = useT();
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: theme.paper }, headerShadowVisible: false, tabBarStyle: { backgroundColor: theme.ink }, tabBarActiveTintColor: theme.acid, tabBarInactiveTintColor: "#777b72" }}>
    <Tabs.Screen name="index" options={{ title: t("nav.today") }} />
    <Tabs.Screen name="coach" options={{ title: t("nav.coach") }} />
    <Tabs.Screen name="nutrition" options={{ title: t("nav.nutrition") }} />
    <Tabs.Screen name="progress" options={{ title: t("nav.progress") }} />
    <Tabs.Screen name="account" options={{ title: t("nav.account") }} />
  </Tabs>;
}

export default function Layout() {
  useEffect(() => { void initializeOfflineStore(); }, []);
  return <LocaleProvider><TabsNavigator /></LocaleProvider>;
}
