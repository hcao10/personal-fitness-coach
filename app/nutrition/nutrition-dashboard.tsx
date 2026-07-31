"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { beginCmineLogin } from "../lib/auth";

type Food = {
  ref: string;
  source: "usda" | "open_food_facts";
  sourceRef: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
};
type Candidate = {
  nameZh: string;
  nameEn: string;
  preparation: string;
  estimatedMinG: number;
  estimatedMaxG: number;
  confidence: number;
  uncertainty: string;
  suggestedFood: Food | null;
  grams?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};
type Meal = {
  id: string;
  mealType: string;
  eatenAt: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: { id: string; name: string; grams: number }[];
};
type Daily = { date: string; meals: number; calories: number; proteinG: number; carbsG: number; fatG: number };

const today = () => new Date().toISOString().slice(0, 10);

export default function NutritionDashboard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [mealType, setMealType] = useState("lunch");
  const [mealId, setMealId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [needsReview, setNeedsReview] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [barcode, setBarcode] = useState("");
  const [manualFood, setManualFood] = useState<Food | null>(null);
  const [manualGrams, setManualGrams] = useState(100);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControls = useRef<{ stop(): void } | null>(null);

  const load = async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).catch(() => null);
    const active = Boolean(me?.user);
    setSignedIn(active);
    if (!active) return;
    const [dailyResponse, mealsResponse] = await Promise.all([
      fetch(`/api/v1/nutrition/daily?date=${today()}`, { cache: "no-store" }),
      fetch("/api/v1/meals?limit=12", { cache: "no-store" }),
    ]);
    if (dailyResponse.ok) setDaily(await dailyResponse.json());
    if (mealsResponse.ok) setMeals((await mealsResponse.json()).meals || []);
  };

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(task);
      scannerControls.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const uploadAndAnalyze = async () => {
    if (!file) return setNotice("请先选择一张饭菜照片。");
    setWorking(true);
    const form = new FormData();
    form.set("image", file);
    form.set("mealType", mealType);
    form.set("eatenAt", new Date().toISOString());
    const upload = await fetch("/api/v1/meals/upload", { method: "POST", body: form });
    const uploadBody = await upload.json().catch(() => null);
    if (!upload.ok) {
      setWorking(false);
      return setNotice(uploadBody?.message || "图片上传失败。");
    }
    setMealId(uploadBody.mealId);
    const analysis = await fetch("/api/v1/meals/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mealId: uploadBody.mealId }),
    });
    const analysisBody = await analysis.json().catch(() => null);
    setWorking(false);
    if (!analysis.ok) return setNotice(analysisBody?.message || "饭菜识别失败。");
    setNeedsReview(Boolean(analysisBody.needsReview));
    setCandidates((analysisBody.candidates || []).map((item: Candidate) => ({
      ...item,
      grams: Math.round((item.estimatedMinG + item.estimatedMaxG) / 2),
      calories: item.suggestedFood?.per100g.calories || 0,
      proteinG: item.suggestedFood?.per100g.proteinG || 0,
      carbsG: item.suggestedFood?.per100g.carbsG || 0,
      fatG: item.suggestedFood?.per100g.fatG || 0,
    })));
    setNotice("识别完成。请确认食物、份量和营养参考后再保存。");
  };

  const updateCandidate = (index: number, patch: Partial<Candidate>) => {
    setCandidates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const confirm = async () => {
    if (!mealId || !candidates.length) return;
    const invalid = candidates.some((item) => !item.grams || item.grams <= 0 ||
      (!item.suggestedFood && !Number(item.calories) && !Number(item.proteinG) && !Number(item.carbsG) && !Number(item.fatG)));
    if (invalid) return setNotice("请为每种食物确认份量，并选择营养参考或填写每 100g 营养。");
    setWorking(true);
    const response = await fetch(`/api/v1/meals/${encodeURIComponent(mealId)}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mealType,
        eatenAt: new Date().toISOString(),
        items: candidates.map((item) => ({
          name: item.nameZh || item.nameEn,
          grams: item.grams,
          ...(item.suggestedFood ? { nutritionRef: item.suggestedFood.ref } : {
            manualPer100g: {
              calories: item.calories || 0,
              proteinG: item.proteinG || 0,
              carbsG: item.carbsG || 0,
              fatG: item.fatG || 0,
            },
          }),
          confidence: item.confidence,
          userCorrected: true,
        })),
      }),
    });
    const body = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) return setNotice(body?.message || "餐食保存失败。");
    setCandidates([]);
    setMealId("");
    setFile(null);
    setNotice("餐食和营养数据已经保存。");
    await load();
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    setWorking(true);
    const response = await fetch(`/api/v1/foods/search?q=${encodeURIComponent(query)}`);
    const body = await response.json().catch(() => null);
    setWorking(false);
    setFoods(response.ok ? body.foods || [] : []);
    if (!response.ok) setNotice(body?.message || "食品搜索失败。");
  };

  const findBarcode = async (value = barcode) => {
    if (!value) return;
    setWorking(true);
    const response = await fetch(`/api/v1/foods/barcode/${encodeURIComponent(value)}`);
    const body = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) return setNotice(body?.message || "没有找到该条码。");
    setManualFood(body.food);
    setNotice("已找到包装食品，请确认食用克数。");
  };

  const startScanner = async () => {
    if (!videoRef.current) return;
    try {
      setScanning(true);
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      scannerControls.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result) return;
        const value = result.getText();
        setBarcode(value);
        scannerControls.current?.stop();
        setScanning(false);
        void findBarcode(value);
      });
    } catch {
      setScanning(false);
      setNotice("无法使用摄像头，可手动输入条码。");
    }
  };

  const saveManual = async () => {
    if (!manualFood || manualGrams <= 0) return;
    setWorking(true);
    const response = await fetch("/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mealType,
        eatenAt: new Date().toISOString(),
        items: [{ name: manualFood.name, grams: manualGrams, nutritionRef: manualFood.ref, userCorrected: true }],
      }),
    });
    const body = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) return setNotice(body?.message || "食品记录失败。");
    setManualFood(null);
    setNotice("食品已经加入今天的记录。");
    await load();
  };

  if (signedIn === null) return <main className="nutrition-page"><div className="nutrition-loading">正在读取今天的饮食记录…</div></main>;
  if (!signedIn) return <main className="nutrition-page">
    <header className="nutrition-header"><Link className="brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link></header>
    <section className="nutrition-signin"><span>NUTRITION, CONFIRMED BY YOU</span><h1>先识别，<br />再由你确认。</h1><p>登录后可以拍照、扫码或手动记录餐食。我们只在你确认份量后计算营养，不把照片估算包装成精确答案。</p><button onClick={() => void beginCmineLogin("/nutrition")}>使用 Cmine ID 登录 →</button></section>
  </main>;

  return <main className="nutrition-page">
    <header className="nutrition-header">
      <Link className="brand" href="/"><span className="brand-mark">C</span><span>CMINE <b>FIT</b></span></Link>
      <nav><Link href="/account">我的训练</Link><Link href="/pricing">专业计划</Link></nav>
    </header>
    <section className="nutrition-hero">
      <div><span>FOOD & ENERGY</span><h1>今天吃了什么，<br /><em>由你确认后再计算。</em></h1><p>照片用于识别候选食物；重量、油量和混合菜成分仍需确认。营养结果来自 USDA、Open Food Facts 或你的手动输入。</p></div>
      <div className="nutrition-totals">
        <article><span>今日热量</span><b>{daily?.calories || 0}</b><small>kcal</small></article>
        <article><span>蛋白质</span><b>{daily?.proteinG || 0}</b><small>g</small></article>
        <article><span>碳水</span><b>{daily?.carbsG || 0}</b><small>g</small></article>
        <article><span>脂肪</span><b>{daily?.fatG || 0}</b><small>g</small></article>
      </div>
    </section>

    <section className="nutrition-workflow-grid">
      <article className="nutrition-card meal-photo-card">
        <header><span>01 / PHOTO</span><h2>拍照识别</h2></header>
        <label className="photo-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /><b>{file ? file.name : "选择饭菜照片"}</b><small>JPEG、PNG 或 WebP；上传后会压缩并清除 EXIF</small></label>
        <select value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="breakfast">早餐</option><option value="lunch">午餐</option><option value="dinner">晚餐</option><option value="snack">加餐</option></select>
        <button onClick={() => void uploadAndAnalyze()} disabled={working}>{working ? "正在识别…" : "上传并识别 →"}</button>
      </article>

      <article className="nutrition-card barcode-card">
        <header><span>02 / BARCODE</span><h2>包装食品</h2></header>
        <div className="barcode-input"><input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="输入包装条码" /><button onClick={() => void findBarcode()}>查询</button></div>
        <button className="camera-button" onClick={() => scanning ? scannerControls.current?.stop() : void startScanner()}>{scanning ? "停止摄像头" : "使用摄像头扫码"}</button>
        <video ref={videoRef} className={scanning ? "scanner-video active" : "scanner-video"} muted playsInline />
        {manualFood && <div className="food-selected"><b>{manualFood.name}</b><span>{manualFood.brand || manualFood.source}</span><label>食用克数<input type="number" min="1" max="5000" value={manualGrams} onChange={(event) => setManualGrams(Number(event.target.value))} /></label><button onClick={() => void saveManual()} disabled={working}>加入今天</button></div>}
      </article>
    </section>

    {candidates.length > 0 && <section className="nutrition-card recognition-review">
      <header><div><span>REVIEW REQUIRED</span><h2>确认识别结果</h2></div><p>{needsReview ? "这张图片存在份量、油量或成分不确定项，请逐项确认。" : "识别置信度较高，但仍需由你确认份量。"}</p></header>
      <div className="candidate-list">{candidates.map((item, index) => <article key={`${item.nameEn}-${index}`}>
        <div><b>{item.nameZh}</b><span>{item.nameEn} · {Math.round(item.confidence * 100)}% 置信度</span><p>{item.preparation}{item.uncertainty && ` · ${item.uncertainty}`}</p></div>
        <label>份量 g<input type="number" value={item.grams || 0} onChange={(event) => updateCandidate(index, { grams: Number(event.target.value) })} /></label>
        {item.suggestedFood ? <div className="candidate-source"><span>营养参考</span><b>{item.suggestedFood.name}</b><small>{item.suggestedFood.source === "usda" ? "USDA FoodData Central" : "Open Food Facts"}</small></div> : <div className="candidate-macros">
          <span>每 100g 手动营养</span>
          <input type="number" placeholder="kcal" value={item.calories || ""} onChange={(event) => updateCandidate(index, { calories: Number(event.target.value) })} />
          <input type="number" placeholder="蛋白质" value={item.proteinG || ""} onChange={(event) => updateCandidate(index, { proteinG: Number(event.target.value) })} />
          <input type="number" placeholder="碳水" value={item.carbsG || ""} onChange={(event) => updateCandidate(index, { carbsG: Number(event.target.value) })} />
          <input type="number" placeholder="脂肪" value={item.fatG || ""} onChange={(event) => updateCandidate(index, { fatG: Number(event.target.value) })} />
        </div>}
      </article>)}</div>
      <button onClick={() => void confirm()} disabled={working}>{working ? "正在保存…" : "确认份量并计算营养 →"}</button>
    </section>}

    <section className="nutrition-card food-search-card">
      <header><div><span>03 / SEARCH</span><h2>手动搜索食品</h2></div><p>适合没有照片、没有条码或需要修正识别结果时使用。</p></header>
      <div className="food-search"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="例如：鸡胸肉、Greek yogurt" /><button onClick={() => void search()} disabled={working}>搜索</button></div>
      {foods.length > 0 && <div className="food-results">{foods.map((food) => <button key={food.ref} onClick={() => setManualFood(food)}><b>{food.name}</b><span>{food.brand || (food.source === "usda" ? "USDA" : "Open Food Facts")}</span><small>{Math.round(food.per100g.calories)} kcal / 100g</small></button>)}</div>}
    </section>

    <section className="nutrition-card meal-history">
      <header><div><span>04 / HISTORY</span><h2>最近餐食</h2></div><p>结构化营养记录会保留到你主动删除账户数据。</p></header>
      {meals.length ? <div>{meals.map((meal) => <article key={meal.id}><time>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(meal.eatenAt))}</time><div><b>{meal.items.map((item) => item.name).join("、") || meal.mealType}</b><span>{meal.calories} kcal · 蛋白质 {meal.proteinG}g · 碳水 {meal.carbsG}g · 脂肪 {meal.fatG}g</span></div></article>)}</div> : <div className="account-empty">今天还没有确认过的餐食。</div>}
    </section>
    <footer className="nutrition-footer"><span>数据来源：USDA FoodData Central、Open Food Facts</span><p>营养估算不替代医生或注册营养师的诊断与建议。</p></footer>
    {notice && <div className="toast account-toast">{notice}</div>}
  </main>;
}
