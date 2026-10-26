import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Screen, styles } from "../src/Screen";
import { api, ApiError } from "../src/api";
import { theme } from "../src/theme";
import {
  analyzeMeal, confirmMeal, foodByBarcode, logSingleFood, mealScanQuota, uploadMealPhoto,
  MEAL_TYPES, type MealCandidate, type MealType, type NutritionReference,
} from "../src/meals";

type Daily = { calories: number; proteinG: number; carbsG: number; fatG: number };
type Quota = { used: number; limit: number; remaining: number } | null;
const today = () => new Date().toISOString().slice(0, 10);
const sourceLabel = (source: string) =>
  source === "usda" ? "官方成分数据" : source === "open_food_facts" ? "社区包装数据" : "我的食品";

export default function Nutrition() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [quota, setQuota] = useState<Quota>(null);
  const [mealType, setMealType] = useState<MealType>("other");
  const [message, setMessage] = useState("");

  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<NutritionReference[]>([]);
  const [selected, setSelected] = useState<NutritionReference | null>(null);
  const [grams, setGrams] = useState("100");

  const [busy, setBusy] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mealId, setMealId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MealCandidate[] | null>(null);
  const [portions, setPortions] = useState<Record<number, string>>({});

  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  // RN camera callbacks fire repeatedly for the same symbol; a ref lock is the
  // only thing that reliably stops a burst of duplicate lookups.
  const scanLock = useRef(false);

  const load = async () => {
    try { setDaily(await api<Daily>(`/api/v1/nutrition/daily?date=${today()}`)); } catch { /* offline: keep last view */ }
    setQuota(await mealScanQuota());
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const fail = (error: unknown, fallback: string) =>
    setMessage(error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback);

  const search = async () => {
    if (query.trim().length < 2) return;
    try {
      const body = await api<{ foods: NutritionReference[] }>(`/api/v1/foods/search?q=${encodeURIComponent(query)}&locale=zh&limit=20`);
      setFoods(body.foods);
    } catch (error) { fail(error, "搜索失败"); }
  };

  const saveSelected = async () => {
    if (!selected || Number(grams) <= 0) return;
    try {
      await logSingleFood(selected, Number(grams), mealType);
      setSelected(null);
      setMessage("已加入今天的营养记录。");
      await load();
    } catch (error) { fail(error, "记录失败"); }
  };

  // --- photo flow -----------------------------------------------------------

  const startPhoto = async (fromLibrary: boolean) => {
    setMessage("");
    if (quota && quota.remaining <= 0) {
      setMessage("本周期的饭菜识别额度已用完，可用积分兑换或升级 Pro。");
      return;
    }
    const permissionResult = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      // Do not dead-end on a denial: offer Settings and the manual paths.
      setMessage(fromLibrary ? "没有相册权限。可在系统设置中开启，或直接搜索食物记录。" : "没有相机权限。可在系统设置中开启，或改用扫码/搜索。");
      return;
    }
    const picked = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const uri = picked.assets[0].uri;
    setPhotoUri(uri);
    try {
      setBusy("正在上传照片…");
      const uploaded = await uploadMealPhoto(uri, mealType);
      setMealId(uploaded.mealId);
      setBusy("正在识别候选食物…");
      const result = await analyzeMeal(uploaded.mealId);
      setCandidates(result.candidates);
      setPortions(Object.fromEntries(result.candidates.map((candidate, index) =>
        [index, String(Math.round((candidate.estimatedMinG + candidate.estimatedMaxG) / 2))])));
    } catch (error) {
      setPhotoUri(null);
      setMealId(null);
      fail(error, "识别失败，额度已退回。");
    } finally {
      setBusy("");
      await load();
    }
  };

  const confirmCandidates = async () => {
    if (!mealId || !candidates) return;
    const items = candidates
      .map((candidate, index) => ({ candidate, grams: Number(portions[index] || 0) }))
      .filter(({ candidate, grams: value }) => candidate.suggestedFood && value > 0)
      .map(({ candidate, grams: value }) => ({ name: candidate.suggestedFood!.name, grams: value, nutritionRef: candidate.suggestedFood!.ref }));
    if (!items.length) {
      setMessage("请至少为一个已匹配到食物库的候选填写克数。");
      return;
    }
    try {
      setBusy("正在记录…");
      await confirmMeal(mealId, items, mealType);
      setCandidates(null); setMealId(null); setPhotoUri(null);
      setMessage("已记录，热量由数据库条目与你确认的克数计算。");
      await load();
    } catch (error) { fail(error, "记录失败"); }
    finally { setBusy(""); }
  };

  // --- barcode flow ---------------------------------------------------------

  const openScanner = async () => {
    setMessage("");
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setMessage("没有相机权限。可在系统设置中开启，或在下方手动输入条码。");
        return;
      }
    }
    scanLock.current = false;
    setScannerOpen(true);
  };

  const lookupBarcode = async (code: string) => {
    setScannerOpen(false);
    try {
      const body = await foodByBarcode(code);
      setSelected(body.food);
      setGrams("100");
      setMessage(`已找到：${body.food.name}。确认食用克数后记录。`);
    } catch (error) { fail(error, "没有找到这个条码对应的食品。"); }
  };

  const canConfirm = Boolean(candidates?.some((candidate, index) => candidate.suggestedFood && Number(portions[index] || 0) > 0));

  return <Screen eyebrow="NUTRITION / 饮食" title="先找到，再由你确认">
    <View style={styles.card}>
      <Text style={styles.label}>今日营养</Text>
      <Text style={styles.value}>{Math.round(daily?.calories || 0)} kcal</Text>
      <Text>蛋白质 {Math.round(daily?.proteinG || 0)}g · 碳水 {Math.round(daily?.carbsG || 0)}g · 脂肪 {Math.round(daily?.fatG || 0)}g</Text>
      {quota && <Text style={{ color: theme.muted, marginTop: 8 }}>本周期还可识别 {quota.remaining}/{quota.limit} 次</Text>}
    </View>

    <View style={styles.card}>
      <Text style={styles.label}>记入哪一餐</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {MEAL_TYPES.map((option) => <Pressable key={option.value} accessibilityRole="radio"
          accessibilityState={{ selected: mealType === option.value }} onPress={() => setMealType(option.value)}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, borderColor: theme.line, backgroundColor: mealType === option.value ? theme.ink : "transparent" }}>
          <Text style={{ color: mealType === option.value ? "white" : theme.ink }}>{option.label}</Text>
        </Pressable>)}
      </View>
    </View>

    <View style={{ flexDirection: "row", gap: 8 }}>
      <Pressable style={[styles.button, { flex: 1 }]} onPress={() => void startPhoto(false)}><Text style={styles.buttonText}>拍照识别</Text></Pressable>
      <Pressable style={[styles.button, { flex: 1 }]} onPress={() => void startPhoto(true)}><Text style={styles.buttonText}>从相册选择</Text></Pressable>
      <Pressable style={[styles.button, { flex: 1 }]} onPress={() => void openScanner()}><Text style={styles.buttonText}>扫码</Text></Pressable>
    </View>

    {busy ? <View style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
      <ActivityIndicator color={theme.ink} /><Text>{busy}</Text>
    </View> : null}

    <View style={{ flexDirection: "row", gap: 8 }}>
      <TextInput accessibilityLabel="搜索食物" value={query} onChangeText={setQuery} onSubmitEditing={() => void search()}
        placeholder="鸡胸肉、燕麦、品牌" style={[styles.card, { flex: 1, padding: 14 }]} />
      <Pressable style={[styles.button, { justifyContent: "center" }]} onPress={() => void search()}><Text style={styles.buttonText}>搜索</Text></Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.label}>手动输入条码</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <TextInput accessibilityLabel="条码数字" value={manualCode} onChangeText={setManualCode} keyboardType="number-pad"
          placeholder="8 位以上数字" style={{ flex: 1, borderWidth: 1, borderColor: theme.line, borderRadius: 8, padding: 10 }} />
        <Pressable style={[styles.button, { justifyContent: "center" }]} onPress={() => manualCode.length >= 8 && void lookupBarcode(manualCode)}>
          <Text style={styles.buttonText}>查询</Text>
        </Pressable>
      </View>
    </View>

    {foods.map((food) => <Pressable key={food.ref} style={styles.card} onPress={() => { setSelected(food); setGrams("100"); }}>
      <Text style={styles.label}>{sourceLabel(food.source)}</Text>
      <Text style={styles.value}>{food.name}</Text>
      <Text>{Math.round(food.per100g.calories)} kcal / 100g · 蛋白质 {food.per100g.proteinG.toFixed(1)}g</Text>
    </Pressable>)}

    {selected && <View style={styles.card}>
      <Text style={styles.value}>{selected.name}</Text>
      <Text style={{ color: theme.muted, marginTop: 4 }}>{sourceLabel(selected.source)}</Text>
      <TextInput accessibilityLabel="食用克数" keyboardType="decimal-pad" value={grams} onChangeText={setGrams} placeholder="食用克数"
        style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 8, padding: 10, marginVertical: 12 }} />
      <Pressable style={styles.button} onPress={() => void saveSelected()}><Text style={styles.buttonText}>确认份量并记录</Text></Pressable>
    </View>}

    {message ? <Text style={styles.label}>{message}</Text> : null}

    <View style={styles.card}>
      <Text>拍照与扫码只产生「候选食物」。热量与宏量始终由你确认的克数乘以食物库条目计算，不会把一张照片的估算包装成精确热量。</Text>
    </View>

    {/* Candidate review — the honesty boundary: nothing is logged until a
        portion and a database-backed food are confirmed for each item. */}
    <Modal visible={Boolean(candidates)} animationType="slide" onRequestClose={() => setCandidates(null)}>
      <Screen eyebrow="REVIEW / 确认识别结果" title="这些是候选，不是结论">
        {photoUri && <Image source={{ uri: photoUri }} style={{ width: "100%", height: 180, borderRadius: 16 }} accessibilityLabel="你拍摄的饭菜照片" />}
        {candidates?.map((candidate, index) => <View key={`${candidate.searchTermEn}:${index}`} style={styles.card}>
          <Text style={styles.label}>置信度 {Math.round(candidate.confidence * 100)}%{candidate.preparation ? ` · ${candidate.preparation}` : ""}</Text>
          <Text style={styles.value}>{candidate.name}</Text>
          {candidate.uncertainty ? <Text style={{ marginTop: 6 }}>{candidate.uncertainty}</Text> : null}
          <Text style={{ marginTop: 8 }}>
            {candidate.suggestedFood
              ? `匹配到：${candidate.suggestedFood.name}（${sourceLabel(candidate.suggestedFood.source)}）`
              : "没有匹配到食物库条目——无法计算热量，请改用搜索或扫码记录这一项。"}
          </Text>
          {candidate.suggestedFood && <TextInput accessibilityLabel={`${candidate.name} 的食用克数`} keyboardType="decimal-pad"
            value={portions[index] ?? ""} onChangeText={(text) => setPortions((current) => ({ ...current, [index]: text }))}
            placeholder={`估算 ${candidate.estimatedMinG}–${candidate.estimatedMaxG} 克，请确认`}
            style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 8, padding: 10, marginTop: 10 }} />}
        </View>)}
        <Pressable style={[styles.button, { opacity: canConfirm ? 1 : 0.5 }]} disabled={!canConfirm} onPress={() => void confirmCandidates()}>
          <Text style={styles.buttonText}>确认份量并记录</Text>
        </Pressable>
        <Pressable onPress={() => { setCandidates(null); setMealId(null); setPhotoUri(null); }}>
          <Text style={{ textAlign: "center", marginTop: 14 }}>放弃这次识别</Text>
        </Pressable>
      </Screen>
    </Modal>

    <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
      <View style={{ flex: 1, backgroundColor: "black" }}>
        <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"] }}
          onBarcodeScanned={({ data }) => {
            if (scanLock.current) return;
            scanLock.current = true;
            void lookupBarcode(data);
          }} />
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={{ color: "white", textAlign: "center" }}>把包装上的条码对准取景框</Text>
          <Pressable style={styles.button} onPress={() => setScannerOpen(false)}><Text style={styles.buttonText}>取消</Text></Pressable>
        </View>
      </View>
    </Modal>

    {permission && !permission.granted && !permission.canAskAgain && <Pressable onPress={() => void Linking.openSettings()}>
      <Text style={{ textAlign: "center", color: theme.coral }}>前往系统设置开启相机权限</Text>
    </Pressable>}
  </Screen>;
}
