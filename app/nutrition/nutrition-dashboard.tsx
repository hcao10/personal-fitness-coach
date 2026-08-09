"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { beginCmineLogin } from "../lib/auth";
import type { FoodReference, MealCandidateMatch } from "../../packages/api-contracts/src";

type Food = FoodReference;
type RecipeIngredient = { food: Food; grams: number };
type Recipe = { id: string; name: string; servings: number; totals: { calories: number; proteinG: number; carbsG: number; fatG: number } };
type MealTemplate = { id: string; name: string; mealType: string; totals: { calories: number; proteinG: number; carbsG: number; fatG: number }; items: Array<{ name: string; grams: number; source: string; sourceRef?: string; calories: number; proteinG: number; carbsG: number; fatG: number }> };
// The server contract plus the fields the review panel fills in locally as the
// user corrects portions before confirming.
type Candidate = MealCandidateMatch & {
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
  const [sourceFilter, setSourceFilter] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [recipeName, setRecipeName] = useState("");
  const [recipeServings, setRecipeServings] = useState(2);
  const [recipeItems, setRecipeItems] = useState<RecipeIngredient[]>([]);
  const [customName, setCustomName] = useState("");
  const [customMacros, setCustomMacros] = useState({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControls = useRef<{ stop(): void } | null>(null);

  const load = async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).catch(() => null);
    const active = Boolean(me?.user);
    setSignedIn(active);
    if (!active) return;
    const [dailyResponse, mealsResponse, recipesResponse, templatesResponse] = await Promise.all([
      fetch(`/api/v1/nutrition/daily?date=${today()}`, { cache: "no-store" }),
      fetch("/api/v1/meals?limit=12", { cache: "no-store" }),
      fetch("/api/v1/recipes", { cache: "no-store" }),
      fetch("/api/v1/meal-templates", { cache: "no-store" }),
    ]);
    if (dailyResponse.ok) setDaily(await dailyResponse.json());
    if (mealsResponse.ok) setMeals((await mealsResponse.json()).meals || []);
    if (recipesResponse.ok) setRecipes((await recipesResponse.json()).recipes || []);
    if (templatesResponse.ok) setTemplates((await templatesResponse.json()).templates || []);
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
    const params = new URLSearchParams({ q: query, locale: "zh", limit: "24" });
    if (sourceFilter) params.set("source", sourceFilter);
    const response = await fetch(`/api/v1/foods/search?${params}`);
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

  const addRecipeItem = (food: Food) => {
    setRecipeItems((current) => current.some((item) => item.food.ref === food.ref) ? current : [...current, { food, grams: 100 }]);
    setNotice(`${food.name} 已加入菜谱草稿。`);
  };

  const saveRecipe = async () => {
    if (!recipeName.trim() || !recipeItems.length) return setNotice("请填写菜谱名称并至少加入一种食材。");
    setWorking(true);
    const response = await fetch("/api/v1/recipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: recipeName, servings: recipeServings, items: recipeItems.map((item) => ({ name: item.food.name, grams: item.grams, nutritionRef: item.food.ref, userCorrected: true })),
    }) });
    const body = await response.json().catch(() => null); setWorking(false);
    if (!response.ok) return setNotice(body?.message || "菜谱保存失败。");
    setRecipeName(""); setRecipeItems([]); setNotice("菜谱已保存，并按份数计算营养。"); await load();
  };

  const saveTemplate = async () => {
    if (!recipeName.trim() || !recipeItems.length) return setNotice("请填写模板名称并至少加入一种食物。");
    setWorking(true);
    const response = await fetch("/api/v1/meal-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: recipeName, mealType, items: recipeItems.map((item) => ({ name: item.food.name, grams: item.grams, nutritionRef: item.food.ref, userCorrected: true })),
    }) });
    setWorking(false); if (!response.ok) return setNotice("餐食模板保存失败。");
    setNotice("餐食模板已保存。"); await load();
  };

  const saveCustomFood = async () => {
    if (!customName.trim()) return setNotice("请填写食品名称。");
    setWorking(true);
    const response = await fetch("/api/v1/foods/custom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: customName, per100g: customMacros }) });
    const body = await response.json().catch(() => null); setWorking(false);
    if (!response.ok) return setNotice(body?.message || "自定义食品保存失败。");
    setManualFood(body.food); setCustomName(""); setCustomMacros({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }); setNotice("自定义食品已保存，请确认食用克数。");
  };

  const logTemplate = async (template: MealTemplate) => {
    setWorking(true);
    const response = await fetch("/api/v1/meals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      mealType: template.mealType, eatenAt: new Date().toISOString(), items: template.items.map((item) => ({ name: item.name, grams: item.grams,
        manualPer100g: { calories: item.grams ? item.calories * 100 / item.grams : 0, proteinG: item.grams ? item.proteinG * 100 / item.grams : 0, carbsG: item.grams ? item.carbsG * 100 / item.grams : 0, fatG: item.grams ? item.fatG * 100 / item.grams : 0 }, userCorrected: true })),
    }) });
    setWorking(false); if (!response.ok) return setNotice("模板记录失败。"); setNotice(`${template.name} 已加入今天。`); await load();
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
      <div className="food-search-toolbar"><div className="food-search"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="例如：鸡胸肉、Greek yogurt、燕麦" /><button onClick={() => void search()} disabled={working}>搜索</button></div><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="食品数据来源"><option value="">全部来源</option><option value="usda">USDA 官方数据</option><option value="open_food_facts">包装食品</option><option value="user">我的食品</option></select></div>
      {foods.length > 0 ? <div className="food-results enriched">{foods.map((food) => <article key={food.ref}><div><span className={`source-badge ${food.sourceKind || food.source}`}>{food.sourceKind === "official" ? "官方成分数据" : food.source === "open_food_facts" ? "社区包装数据" : food.source === "user" ? "我的食品" : "营养数据"}</span><b>{food.name}</b><span>{food.brand || food.attribution || (food.source === "usda" ? "USDA FoodData Central" : "Open Food Facts")}</span><small>{Math.round(food.per100g.calories)} kcal · P {food.per100g.proteinG.toFixed(1)} · C {food.per100g.carbsG.toFixed(1)} · F {food.per100g.fatG.toFixed(1)} / 100g</small></div><div><button onClick={() => setManualFood(food)}>记录</button><button onClick={() => addRecipeItem(food)}>加入菜谱</button></div></article>)}</div> : query.trim().length >= 2 && !working && <div className="account-empty">没有匹配结果。可尝试英文名称、品牌或创建自定义食品。</div>}
      {manualFood && <div className="food-selected inline"><b>{manualFood.name}</b><span>{manualFood.attribution || manualFood.source}</span><label>食用克数<input type="number" min="1" max="5000" value={manualGrams} onChange={(event) => setManualGrams(Number(event.target.value))} /></label><button onClick={() => void saveManual()} disabled={working}>加入今天</button></div>}
    </section>

    <section className="nutrition-workflow-grid nutrition-builders">
      <article className="nutrition-card custom-food-card"><header><span>04 / CUSTOM FOOD</span><h2>创建自定义食品</h2></header><p>包装标签或本地食品未收录时，按每 100g 录入。系统会明确标记为“用户录入”。</p><label>食品名称<input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="例如：自制低脂酸奶酱" /></label><div className="macro-input-grid">{([['calories','热量 kcal'],['proteinG','蛋白质 g'],['carbsG','碳水 g'],['fatG','脂肪 g']] as const).map(([key,label]) => <label key={key}>{label}<input type="number" min="0" value={customMacros[key] || ""} onChange={(event) => setCustomMacros((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div><button onClick={() => void saveCustomFood()} disabled={working}>保存自定义食品 →</button></article>
      <article className="nutrition-card recipe-builder"><header><span>05 / RECIPE</span><h2>菜谱与餐食模板</h2></header><div className="recipe-meta"><input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} placeholder="菜谱或模板名称" /><label>份数<input type="number" min="1" max="100" value={recipeServings} onChange={(event) => setRecipeServings(Number(event.target.value))} /></label></div>{recipeItems.length ? <div className="recipe-item-list">{recipeItems.map((item, index) => <div key={item.food.ref}><b>{item.food.name}</b><input type="number" min="1" max="5000" value={item.grams} onChange={(event) => setRecipeItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, grams: Number(event.target.value) } : entry))} /><span>g</span><button onClick={() => setRecipeItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>)}</div> : <div className="account-empty">从搜索结果选择“加入菜谱”。记得包含烹饪油、酱料和糖。</div>}<div className="recipe-actions"><button onClick={() => void saveRecipe()} disabled={working}>保存为菜谱</button><button onClick={() => void saveTemplate()} disabled={working}>保存为餐食模板</button></div></article>
    </section>

    {(templates.length > 0 || recipes.length > 0) && <section className="nutrition-card saved-food-tools"><header><div><span>06 / SAVED</span><h2>常用菜谱与模板</h2></div><p>低成本地复用真实记录，不需要再次调用 AI。</p></header>{templates.length > 0 && <div className="template-list">{templates.map((template) => <button key={template.id} onClick={() => void logTemplate(template)}><b>{template.name}</b><span>{Math.round(template.totals.calories)} kcal · 蛋白质 {Math.round(template.totals.proteinG)}g</span><small>一键加入今天 →</small></button>)}</div>}{recipes.length > 0 && <div className="recipe-summary-list">{recipes.map((recipe) => <article key={recipe.id}><b>{recipe.name}</b><span>{recipe.servings} 份 · 全菜谱 {Math.round(recipe.totals.calories)} kcal</span><small>每份约 {Math.round(recipe.totals.calories / recipe.servings)} kcal</small></article>)}</div>}</section>}

    <section className="nutrition-card meal-history">
      <header><div><span>07 / HISTORY</span><h2>最近餐食</h2></div><p>结构化营养记录会保留到你主动删除账户数据。</p></header>
      {meals.length ? <div>{meals.map((meal) => <article key={meal.id}><time>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(meal.eatenAt))}</time><div><b>{meal.items.map((item) => item.name).join("、") || meal.mealType}</b><span>{meal.calories} kcal · 蛋白质 {meal.proteinG}g · 碳水 {meal.carbsG}g · 脂肪 {meal.fatG}g</span></div></article>)}</div> : <div className="account-empty">今天还没有确认过的餐食。</div>}
    </section>
    <footer className="nutrition-footer"><span>数据来源：USDA FoodData Central、Open Food Facts</span><p>营养估算不替代医生或注册营养师的诊断与建议。</p></footer>
    {notice && <div className="toast account-toast">{notice}</div>}
  </main>;
}
