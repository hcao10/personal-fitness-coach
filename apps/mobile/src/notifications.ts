import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";
export async function registerPush(deviceId: string) { if (!Device.isDevice) return null; const permission = await Notifications.requestPermissionsAsync(); if (permission.status !== "granted") return null; const projectId = Constants.easConfig?.projectId; const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data; return api("/api/v1/devices", { method: "POST", body: JSON.stringify({ id: deviceId, platform: Device.osName?.toLowerCase().includes("ios") ? "ios" : "android", name: Device.deviceName, pushToken: token }) }); }
export async function scheduleLocalTraining(hour = 18) { return Notifications.scheduleNotificationAsync({ content: { title: "今天的训练准备好了吗？", body: "打开 Cmine Fit，按自己的节奏完成今天的安排。" }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 } }); }
