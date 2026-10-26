import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";
const extra = Constants.expoConfig?.extra as { revenueCatAppleKey?: string; revenueCatGoogleKey?: string } | undefined;
export async function configureBilling(userId: string) { const key = Platform.OS === "ios" ? extra?.revenueCatAppleKey : extra?.revenueCatGoogleKey; if (!key) return false; Purchases.configure({ apiKey: key, appUserID: userId }); return true; }
export async function offerings() { return Purchases.getOfferings(); }
export async function purchase(packageToBuy: Parameters<typeof Purchases.purchasePackage>[0]) { return Purchases.purchasePackage(packageToBuy); }
export async function restorePurchases() { return Purchases.restorePurchases(); }
