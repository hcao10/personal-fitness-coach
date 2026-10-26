"use client";

import ProductShell from "../components/product-shell";
import { Icon } from "../shared/ui/icon";
import { CmineSignInButton } from "../shared/async-state/account-mode-notice";
import { useEffect, useRef, useState } from "react";
import { localizeApiError } from "../lib/api-error";
import { useCapabilities } from "../shared/api/capability-provider";
import { useLocale, useT } from "../lib/i18n-provider";
import { dateFormatter, plural } from "../../packages/i18n/src";
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
type Daily = { date: string; meals: number; calories: number; proteinG: number; carbsG: number; fatG: number; targets: { calories: number; proteinG: number; carbsG: number; fatG: number } | null };
type CoachMealDraft = { id: string; payload: { title?: string; description?: string; after?: string }; createdAt: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function NutritionDashboard() {
  const t = useT();
  const { locale } = useLocale();
  // A sign-in button is only honest when signing in is configured.
  const accountsConfigured = Boolean(useCapabilities().capabilities?.accounts);
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
  const [coachDrafts, setCoachDrafts] = useState<CoachMealDraft[]>([]);
  const [activeCoachDraft, setActiveCoachDraft] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControls = useRef<{ stop(): void } | null>(null);

  const load = async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).catch(() => null);
    const active = Boolean(me?.user);
    setSignedIn(active);
    if (!active) return;
    const [dailyResponse, mealsResponse, recipesResponse, templatesResponse, draftsResponse] = await Promise.all([
      fetch(`/api/v1/nutrition/daily?date=${today()}`, { cache: "no-store" }),
      fetch("/api/v1/meals?limit=12", { cache: "no-store" }),
      fetch("/api/v1/recipes", { cache: "no-store" }),
      fetch("/api/v1/meal-templates", { cache: "no-store" }),
      fetch("/api/v1/record-drafts?type=meal", { cache: "no-store" }),
    ]);
    if (dailyResponse.ok) setDaily(await dailyResponse.json());
    if (mealsResponse.ok) setMeals((await mealsResponse.json()).meals || []);
    if (recipesResponse.ok) setRecipes((await recipesResponse.json()).recipes || []);
    if (templatesResponse.ok) setTemplates((await templatesResponse.json()).templates || []);
    if (draftsResponse.ok) setCoachDrafts((await draftsResponse.json()).drafts || []);
  };

  const finishCoachDraft = async (decision: "complete" | "reject", draftId = activeCoachDraft) => {
    if (!draftId) return;
    const response = await fetch(`/api/v1/record-drafts/${encodeURIComponent(draftId)}/${decision}`, { method: "POST" });
    if (response.ok) { setCoachDrafts((current) => current.filter((draft) => draft.id !== draftId)); setActiveCoachDraft(null); }
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
    if (!file) return setNotice(t("nutrition.noticePhotoRequired"));
    setWorking(true);
    const form = new FormData();
    form.set("image", file);
    form.set("mealType", mealType);
    form.set("eatenAt", new Date().toISOString());
    const upload = await fetch("/api/v1/meals/upload", { method: "POST", body: form });
    const uploadBody = await upload.json().catch(() => null);
    if (!upload.ok) {
      setWorking(false);
      return setNotice(localizeApiError(uploadBody, locale, t("nutrition.noticeUploadFailed")));
    }
    setMealId(uploadBody.mealId);
    const analysis = await fetch("/api/v1/meals/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mealId: uploadBody.mealId }),
    });
    const analysisBody = await analysis.json().catch(() => null);
    setWorking(false);
    if (!analysis.ok) return setNotice(localizeApiError(analysisBody, locale, t("nutrition.noticeAnalyzeFailed")));
    setNeedsReview(Boolean(analysisBody.needsReview));
    setCandidates((analysisBody.candidates || []).map((item: Candidate) => ({
      ...item,
      grams: Math.round((item.estimatedMinG + item.estimatedMaxG) / 2),
      calories: item.suggestedFood?.per100g.calories || 0,
      proteinG: item.suggestedFood?.per100g.proteinG || 0,
      carbsG: item.suggestedFood?.per100g.carbsG || 0,
      fatG: item.suggestedFood?.per100g.fatG || 0,
    })));
    setNotice(t("nutrition.noticeAnalyzeDone"));
  };

  const updateCandidate = (index: number, patch: Partial<Candidate>) => {
    setCandidates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const confirm = async () => {
    if (!mealId || !candidates.length) return;
    const invalid = candidates.some((item) => !item.grams || item.grams <= 0 ||
      (!item.suggestedFood && !Number(item.calories) && !Number(item.proteinG) && !Number(item.carbsG) && !Number(item.fatG)));
    if (invalid) return setNotice(t("nutrition.noticeConfirmIncomplete"));
    setWorking(true);
    const response = await fetch(`/api/v1/meals/${encodeURIComponent(mealId)}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mealType,
        eatenAt: new Date().toISOString(),
        items: candidates.map((item) => ({
          name: item.name,
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
    if (!response.ok) return setNotice(localizeApiError(body, locale, t("nutrition.noticeMealSaveFailed")));
    setCandidates([]);
    setMealId("");
    setFile(null);
    setNotice(t("nutrition.noticeMealSaved"));
    await load();
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    setWorking(true);
    // The search index returns display names per locale; pinning this to "zh"
    // handed Chinese food names to every English reader.
    const params = new URLSearchParams({ q: query, locale, limit: "24" });
    if (sourceFilter) params.set("source", sourceFilter);
    const response = await fetch(`/api/v1/foods/search?${params}`);
    const body = await response.json().catch(() => null);
    setWorking(false);
    setFoods(response.ok ? body.foods || [] : []);
    if (!response.ok) setNotice(localizeApiError(body, locale, t("nutrition.noticeSearchFailed")));
  };

  const findBarcode = async (value = barcode) => {
    if (!value) return;
    setWorking(true);
    const response = await fetch(`/api/v1/foods/barcode/${encodeURIComponent(value)}`);
    const body = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) return setNotice(localizeApiError(body, locale, t("nutrition.noticeBarcodeNotFound")));
    setManualFood(body.food);
    setNotice(t("nutrition.noticeBarcodeFound"));
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
      setNotice(t("nutrition.noticeCameraUnavailable"));
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
    if (!response.ok) return setNotice(localizeApiError(body, locale, t("nutrition.noticeFoodLogFailed")));
    setManualFood(null);
    setNotice(t("nutrition.noticeFoodLogged"));
    if (activeCoachDraft) { await finishCoachDraft("complete"); setNotice(t("nutrition.coachDraftCompleted")); }
    await load();
  };

  const addRecipeItem = (food: Food) => {
    setRecipeItems((current) => current.some((item) => item.food.ref === food.ref) ? current : [...current, { food, grams: 100 }]);
    setNotice(t("nutrition.noticeRecipeItemAdded", { name: food.name }));
  };

  const saveRecipe = async () => {
    if (!recipeName.trim() || !recipeItems.length) return setNotice(t("nutrition.noticeRecipeIncomplete"));
    setWorking(true);
    const response = await fetch("/api/v1/recipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: recipeName, servings: recipeServings, items: recipeItems.map((item) => ({ name: item.food.name, grams: item.grams, nutritionRef: item.food.ref, userCorrected: true })),
    }) });
    const body = await response.json().catch(() => null); setWorking(false);
    if (!response.ok) return setNotice(localizeApiError(body, locale, t("nutrition.noticeRecipeSaveFailed")));
    setRecipeName(""); setRecipeItems([]); setNotice(t("nutrition.noticeRecipeSaved")); await load();
  };

  const saveTemplate = async () => {
    if (!recipeName.trim() || !recipeItems.length) return setNotice(t("nutrition.noticeTemplateIncomplete"));
    setWorking(true);
    const response = await fetch("/api/v1/meal-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: recipeName, mealType, items: recipeItems.map((item) => ({ name: item.food.name, grams: item.grams, nutritionRef: item.food.ref, userCorrected: true })),
    }) });
    setWorking(false); if (!response.ok) return setNotice(t("nutrition.noticeTemplateSaveFailed"));
    setNotice(t("nutrition.noticeTemplateSaved")); await load();
  };

  const saveCustomFood = async () => {
    if (!customName.trim()) return setNotice(t("nutrition.noticeCustomFoodNameRequired"));
    setWorking(true);
    const response = await fetch("/api/v1/foods/custom", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: customName, per100g: customMacros }) });
    const body = await response.json().catch(() => null); setWorking(false);
    if (!response.ok) return setNotice(localizeApiError(body, locale, t("nutrition.noticeCustomFoodSaveFailed")));
    setManualFood(body.food); setCustomName(""); setCustomMacros({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }); setNotice(t("nutrition.noticeCustomFoodSaved"));
  };

  const logTemplate = async (template: MealTemplate) => {
    setWorking(true);
    const response = await fetch("/api/v1/meals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      mealType: template.mealType, eatenAt: new Date().toISOString(), items: template.items.map((item) => ({ name: item.name, grams: item.grams,
        manualPer100g: { calories: item.grams ? item.calories * 100 / item.grams : 0, proteinG: item.grams ? item.proteinG * 100 / item.grams : 0, carbsG: item.grams ? item.carbsG * 100 / item.grams : 0, fatG: item.grams ? item.fatG * 100 / item.grams : 0 }, userCorrected: true })),
    }) });
    setWorking(false); if (!response.ok) return setNotice(t("nutrition.noticeTemplateLogFailed")); setNotice(t("nutrition.noticeTemplateLogged", { name: template.name })); await load();
  };

  if (signedIn === null) return <main className="nutrition-page"><div className="nutrition-loading">{t("nutrition.loading")}</div></main>;
  if (!signedIn) return <ProductShell active="/nutrition" title={t("nav.nutrition")} eyebrow={t("product.design.nutritionSubtitle")}>
    <section className="nutrition-signin nutrition-access"><span>{t("product.access.photoAi")}</span><h2>{t("nutrition.signedOutTitleLine1")}<br />{t("nutrition.signedOutTitleLine2")}</h2><p>{t("nutrition.signedOutBody")}</p>{accountsConfigured
      ? <CmineSignInButton returnTo="/nutrition">{t("product.access.signInAi")}</CmineSignInButton>
      : <p className="account-signin-unavailable">{t("product.entry.accountOnlyUnavailable")}</p>}
      <p className="nutrition-barcode-note">{t("product.access.barcodeNote")}</p>
    </section>
  </ProductShell>;

  return <ProductShell active="/nutrition" title={t("nav.nutrition")} eyebrow={t("product.design.nutritionSubtitle")}><div className="nutrition-content">
      <section className="fit-surface-intro"><Icon name="nutrition" /><div><h2>{t("refresh.nutrition.title")}</h2><p>{t("refresh.nutrition.body")}</p></div></section>
    <section className="nutrition-hero">
      <div><h2>{t("product.design.nutritionToday")}</h2><p>{t("nutrition.heroBody")}</p></div>
      <div className="nutrition-totals">
        <article><span>{t("nutrition.caloriesToday")}</span><b>{daily?.calories || 0}</b><small>{daily?.targets ? `/ ${daily.targets.calories} kcal` : "kcal"}</small></article>
        <article><span>{t("nutrition.protein")}</span><b>{daily?.proteinG || 0}</b><small>{daily?.targets ? `/ ${daily.targets.proteinG} g` : "g"}</small></article>
        <article><span>{t("nutrition.carbs")}</span><b>{daily?.carbsG || 0}</b><small>{daily?.targets ? `/ ${daily.targets.carbsG} g` : "g"}</small></article>
        <article><span>{t("nutrition.fat")}</span><b>{daily?.fatG || 0}</b><small>{daily?.targets ? `/ ${daily.targets.fatG} g` : "g"}</small></article>
      </div>
    </section>

    {coachDrafts[0] && <section className="nutrition-card" id="coach-meal-draft">
      <header><div><span>{t("nutrition.coachDraftEyebrow")}</span><h2>{coachDrafts[0].payload.title || t("nutrition.coachDraftTitle")}</h2></div><p>{t("nutrition.coachDraftBody")}</p></header>
      <div className="recipe-actions"><button onClick={() => { setActiveCoachDraft(coachDrafts[0].id); setQuery(coachDrafts[0].payload.after || coachDrafts[0].payload.description || ""); }}>{t("nutrition.coachDraftStart")}</button><button onClick={() => void finishCoachDraft("reject", coachDrafts[0].id)}>{t("nutrition.coachDraftReject")}</button></div>
    </section>}

    <section className="nutrition-workflow-grid">
      <article className="nutrition-card meal-photo-card">
        <header><h2>{t("nutrition.photoCardTitle")}</h2><p className="nutrition-service-note">{t("product.access.photoAi")}</p></header>
        <label className="photo-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /><b>{file ? file.name : t("nutrition.photoPickLabel")}</b><small>{t("nutrition.photoHint")}</small></label>
        <select aria-label={t("refresh.nutrition.mealType")} value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="breakfast">{t("nutrition.mealTypeBreakfast")}</option><option value="lunch">{t("nutrition.mealTypeLunch")}</option><option value="dinner">{t("nutrition.mealTypeDinner")}</option><option value="snack">{t("nutrition.mealTypeSnack")}</option></select>
        <button onClick={() => void uploadAndAnalyze()} disabled={working}>{working ? t("nutrition.analyzing") : t("nutrition.uploadAndAnalyze")}</button>
      </article>

      <article className="nutrition-card barcode-card">
        <header><h2>{t("nutrition.barcodeCardTitle")}</h2></header>
        <p className="nutrition-service-note">{t("product.access.barcodeNote")}</p>
        <div className="barcode-input"><input aria-label={t("nutrition.barcodePlaceholder")} value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder={t("nutrition.barcodePlaceholder")} /><button onClick={() => void findBarcode()}>{t("nutrition.barcodeLookup")}</button></div>
        <button className="camera-button" onClick={() => scanning ? scannerControls.current?.stop() : void startScanner()}>{scanning ? t("nutrition.scannerStop") : t("nutrition.scannerStart")}</button>
        <video ref={videoRef} className={scanning ? "scanner-video active" : "scanner-video"} muted playsInline />
      </article>
    </section>

    {candidates.length > 0 && <section className="nutrition-card recognition-review">
      <header><div><h2>{t("nutrition.reviewTitle")}</h2></div><p>{needsReview ? t("nutrition.reviewUncertain") : t("nutrition.reviewConfident")}</p></header>
      <div className="candidate-list">{candidates.map((item, index) => <article key={`${item.searchTermEn}-${index}`}>
        <div><b>{item.name}</b><span>{t("nutrition.candidateConfidence", { percent: Math.round(item.confidence * 100) })}</span><p>{item.preparation}{item.uncertainty && ` · ${item.uncertainty}`}</p></div>
        <label>{t("nutrition.candidateGrams")}<input type="number" value={item.grams || 0} onChange={(event) => updateCandidate(index, { grams: Number(event.target.value) })} /></label>
        {item.suggestedFood ? <div className="candidate-source"><span>{t("nutrition.candidateNutritionRef")}</span><b>{item.suggestedFood.name}</b><small>{item.suggestedFood.source === "usda" ? "USDA FoodData Central" : "Open Food Facts"}</small></div> : <div className="candidate-macros">
          <span>{t("nutrition.candidateManualPer100g")}</span>
          <input type="number" placeholder="kcal" value={item.calories || ""} onChange={(event) => updateCandidate(index, { calories: Number(event.target.value) })} />
          <input type="number" placeholder={t("nutrition.protein")} value={item.proteinG || ""} onChange={(event) => updateCandidate(index, { proteinG: Number(event.target.value) })} />
          <input type="number" placeholder={t("nutrition.carbs")} value={item.carbsG || ""} onChange={(event) => updateCandidate(index, { carbsG: Number(event.target.value) })} />
          <input type="number" placeholder={t("nutrition.fat")} value={item.fatG || ""} onChange={(event) => updateCandidate(index, { fatG: Number(event.target.value) })} />
        </div>}
      </article>)}</div>
      <button onClick={() => void confirm()} disabled={working}>{working ? t("nutrition.saving") : t("nutrition.confirmAndCalculate")}</button>
    </section>}

    <section className="nutrition-card food-search-card">
      <header><div><h2>{t("nutrition.searchCardTitle")}</h2></div><p>{t("nutrition.searchCardHint")}</p></header>
      <div className="food-search-toolbar"><div className="food-search"><input aria-label={t("nutrition.searchCardTitle")} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder={t("nutrition.searchPlaceholder")} /><button onClick={() => void search()} disabled={working}>{t("nutrition.searchButton")}</button></div><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label={t("nutrition.sourceFilterLabel")}><option value="">{t("nutrition.sourceAll")}</option><option value="usda">{t("nutrition.sourceUsda")}</option><option value="open_food_facts">{t("nutrition.sourcePackaged")}</option><option value="user">{t("nutrition.sourceMine")}</option></select></div>
      {foods.length > 0 ? <div className="food-results enriched">{foods.map((food) => <article key={food.ref}><div><span className={`source-badge ${food.sourceKind || food.source}`}>{food.sourceKind === "official" ? t("nutrition.badgeOfficial") : food.source === "open_food_facts" ? t("nutrition.badgeCommunity") : food.source === "user" ? t("nutrition.sourceMine") : t("nutrition.badgeGeneric")}</span><b>{food.name}</b><span>{food.brand || food.attribution || (food.source === "usda" ? "USDA FoodData Central" : "Open Food Facts")}</span><small>{Math.round(food.per100g.calories)} kcal · P {food.per100g.proteinG.toFixed(1)} · C {food.per100g.carbsG.toFixed(1)} · F {food.per100g.fatG.toFixed(1)} / 100g</small></div><div><button onClick={() => setManualFood(food)}>{t("nutrition.logFood")}</button><button onClick={() => addRecipeItem(food)}>{t("nutrition.addToRecipe")}</button></div></article>)}</div> : query.trim().length >= 2 && !working && <div className="account-empty">{t("nutrition.searchEmpty")}</div>}
      {manualFood && <div className="food-selected inline"><b>{manualFood.name}</b><span>{manualFood.attribution || manualFood.source}</span><label>{t("nutrition.gramsEaten")}<input type="number" min="1" max="5000" value={manualGrams} onChange={(event) => setManualGrams(Number(event.target.value))} /></label><button onClick={() => void saveManual()} disabled={working}>{t("nutrition.addToToday")}</button></div>}
    </section>

    <section className="nutrition-workflow-grid nutrition-builders">
      <article className="nutrition-card custom-food-card"><header><h2>{t("nutrition.customFoodTitle")}</h2></header><p>{t("nutrition.customFoodHint")}</p><label>{t("nutrition.customFoodNameLabel")}<input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={t("nutrition.customFoodPlaceholder")} /></label><div className="macro-input-grid">{([['calories','nutrition.macroCalories'],['proteinG','nutrition.macroProtein'],['carbsG','nutrition.macroCarbs'],['fatG','nutrition.macroFat']] as const).map(([key,labelKey]) => <label key={key}>{t(labelKey)}<input type="number" min="0" value={customMacros[key] || ""} onChange={(event) => setCustomMacros((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div><button onClick={() => void saveCustomFood()} disabled={working}>{t("nutrition.saveCustomFood")}</button></article>
      <article className="nutrition-card recipe-builder"><header><h2>{t("nutrition.recipeCardTitle")}</h2></header><div className="recipe-meta"><input aria-label={t("nutrition.recipeNamePlaceholder")} value={recipeName} onChange={(event) => setRecipeName(event.target.value)} placeholder={t("nutrition.recipeNamePlaceholder")} /><label>{t("nutrition.servings")}<input type="number" min="1" max="100" value={recipeServings} onChange={(event) => setRecipeServings(Number(event.target.value))} /></label></div>{recipeItems.length ? <div className="recipe-item-list">{recipeItems.map((item, index) => <div key={item.food.ref}><b>{item.food.name}</b><input type="number" min="1" max="5000" value={item.grams} onChange={(event) => setRecipeItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, grams: Number(event.target.value) } : entry))} /><span>g</span><button onClick={() => setRecipeItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{t("nutrition.removeItem")}</button></div>)}</div> : <div className="account-empty">{t("nutrition.recipeEmpty")}</div>}<div className="recipe-actions"><button onClick={() => void saveRecipe()} disabled={working}>{t("nutrition.saveAsRecipe")}</button><button onClick={() => void saveTemplate()} disabled={working}>{t("nutrition.saveAsTemplate")}</button></div></article>
    </section>

    {(templates.length > 0 || recipes.length > 0) && <section className="nutrition-card saved-food-tools"><header><div><h2>{t("nutrition.savedTitle")}</h2></div><p>{t("nutrition.savedHint")}</p></header>{templates.length > 0 && <div className="template-list">{templates.map((template) => <button key={template.id} onClick={() => void logTemplate(template)}><b>{template.name}</b><span>{t("nutrition.templateMacros", { calories: Math.round(template.totals.calories), protein: Math.round(template.totals.proteinG) })}</span><small>{t("nutrition.templateAddToToday")}</small></button>)}</div>}{recipes.length > 0 && <div className="recipe-summary-list">{recipes.map((recipe) => <article key={recipe.id}><b>{recipe.name}</b><span>{t("nutrition.recipeSummary", { servings: plural(locale, recipe.servings, { one: t("nutrition.recipeServingsCount.one"), other: t("nutrition.recipeServingsCount.other") }), calories: Math.round(recipe.totals.calories) })}</span><small>{t("nutrition.recipePerServing", { calories: Math.round(recipe.totals.calories / recipe.servings) })}</small></article>)}</div>}</section>}

    <section className="nutrition-card meal-history">
      <header><div><h2>{t("nutrition.historyTitle")}</h2></div><p>{t("nutrition.historyHint")}</p></header>
      {meals.length ? <div>{meals.map((meal) => <article key={meal.id}><time>{dateFormatter(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(meal.eatenAt))}</time><div><b>{meal.items.map((item) => item.name).join(t("nutrition.itemSeparator")) || meal.mealType}</b><span>{t("nutrition.mealMacros", { calories: meal.calories, protein: meal.proteinG, carbs: meal.carbsG, fat: meal.fatG })}</span></div></article>)}</div> : <div className="account-empty">{t("nutrition.historyEmpty")}</div>}
    </section>
    <footer className="nutrition-footer"><span>{t("nutrition.footerSources")}</span><p>{t("nutrition.footerDisclaimer")}</p></footer>
    {notice && <div className="toast account-toast">{notice}</div>}
  </div></ProductShell>;
}
