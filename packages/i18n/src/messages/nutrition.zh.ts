// Copy for app/nutrition. Chinese is the schema: a key added here must be
// added to nutrition.en.ts or the build fails.
export const nutritionZh = {
  // Page metadata (rendered on the server, so it is read through
  // `translator(locale)` rather than `useT`).
  metaTitle: "饮食记录 · Cmine Fit",
  metaDescription: "拍照、扫码或手动记录餐食，在确认份量后计算每日热量和宏量营养。",

  loading: "正在读取今天的饮食记录…",

  // Signed-out screen.
  signedOutTitleLine1: "先识别，",
  signedOutTitleLine2: "再由你确认。",
  signedOutBody: "登录后可以拍照、扫码或手动记录餐食。我们只在你确认份量后计算营养，不把照片估算包装成精确答案。",
  signedOutAction: "使用 Cmine ID 登录 ",

  navMyTraining: "我的训练",
  navPricing: "专业计划",

  // Hero and daily totals.
  heroTitleLine1: "今天吃了什么，",
  heroTitleLine2: "由你确认后再计算。",
  heroBody: "照片用于识别候选食物；重量、油量和混合菜成分仍需确认。营养结果来自 USDA、Open Food Facts 或你的手动输入。",
  caloriesToday: "今日热量",
  protein: "蛋白质",
  carbs: "碳水",
  fat: "脂肪",

  // 01 / PHOTO
  photoCardTitle: "拍照识别",
  photoPickLabel: "选择饭菜照片",
  photoHint: "拍清整餐，识别后确认食物与份量。",
  mealTypeBreakfast: "早餐",
  mealTypeLunch: "午餐",
  mealTypeDinner: "晚餐",
  mealTypeSnack: "加餐",
  analyzing: "正在识别…",
  uploadAndAnalyze: "上传并识别 ",

  // 02 / BARCODE
  barcodeCardTitle: "包装食品",
  barcodePlaceholder: "输入包装条码",
  barcodeLookup: "查询",
  scannerStop: "停止摄像头",
  scannerStart: "使用摄像头扫码",

  // Candidate review. This copy is safety-relevant: it must keep saying the
  // numbers are estimates the user confirms, never that they are exact.
  reviewTitle: "确认识别结果",
  reviewUncertain: "这张图片存在份量、油量或成分不确定项，请逐项确认。",
  reviewConfident: "识别置信度较高，但仍需由你确认份量。",
  candidateConfidence: "{percent}% 置信度",
  candidateGrams: "份量 g",
  candidateNutritionRef: "营养参考",
  candidateManualPer100g: "每 100g 手动营养",
  saving: "正在保存…",
  confirmAndCalculate: "确认份量并计算营养 ",

  // 03 / SEARCH
  searchCardTitle: "手动搜索食品",
  searchCardHint: "适合没有照片、没有条码或需要修正识别结果时使用。",
  searchPlaceholder: "例如：鸡胸肉、Greek yogurt、燕麦",
  searchButton: "搜索",
  sourceFilterLabel: "食品数据来源",
  sourceAll: "全部来源",
  sourceUsda: "USDA 官方数据",
  sourcePackaged: "包装食品",
  sourceMine: "我的食品",
  badgeOfficial: "官方成分数据",
  badgeCommunity: "社区包装数据",
  badgeGeneric: "营养数据",
  logFood: "记录",
  addToRecipe: "加入菜谱",
  searchEmpty: "没有匹配结果。可尝试英文名称、品牌或创建自定义食品。",
  gramsEaten: "食用克数",
  addToToday: "加入今天",
  coachDraftEyebrow: "COACH 餐食草稿",
  coachDraftTitle: "把建议变成你确认的餐食记录",
  coachDraftBody: "Coach 只准备了记录意图，不会猜测你实际吃了什么。选择“开始填写”，再搜索食品、确认克数并保存。",
  coachDraftStart: "开始填写",
  coachDraftReject: "不记录",
  coachDraftCompleted: "Coach 餐食草稿已完成。",

  // 04 / CUSTOM FOOD
  customFoodTitle: "创建自定义食品",
  customFoodHint: "包装标签或本地食品未收录时，按每 100g 录入。系统会明确标记为“用户录入”。",
  customFoodNameLabel: "食品名称",
  customFoodPlaceholder: "例如：自制低脂酸奶酱",
  macroCalories: "热量 kcal",
  macroProtein: "蛋白质 g",
  macroCarbs: "碳水 g",
  macroFat: "脂肪 g",
  saveCustomFood: "保存自定义食品 ",

  // 05 / RECIPE
  recipeCardTitle: "菜谱与餐食模板",
  recipeNamePlaceholder: "菜谱或模板名称",
  servings: "份数",
  removeItem: "移除",
  recipeEmpty: "从搜索结果选择“加入菜谱”。记得包含烹饪油、酱料和糖。",
  saveAsRecipe: "保存为菜谱",
  saveAsTemplate: "保存为餐食模板",

  // 06 / SAVED
  savedTitle: "常用菜谱与模板",
  savedHint: "低成本地复用真实记录，不需要再次调用 AI。",
  templateMacros: "{calories} kcal · 蛋白质 {protein}g",
  templateAddToToday: "一键加入今天 ",
  recipeSummary: "{servings} 份 · 全菜谱 {calories} kcal",
  // The counted phrase interpolated into `recipeSummary`. Chinese keeps its
  // measure word (份) in the sentence, so the counted form here is the numeral
  // alone; English has to inflect the noun, which is why this is a plural group
  // rather than a bare number. Chinese has one plural category, so `one` is
  // never selected for zh — it is present because every locale must carry the
  // same key set.
  recipeServingsCount: { one: "{count}", other: "{count}" },
  recipePerServing: "每份约 {calories} kcal",

  // 07 / HISTORY
  historyTitle: "最近餐食",
  historyHint: "结构化营养记录会保留到你主动删除账户数据。",
  // List separator between the foods in one meal. Punctuation is locale copy:
  // the ideographic comma is not what an English reader expects.
  itemSeparator: "、",
  mealMacros: "{calories} kcal · 蛋白质 {protein}g · 碳水 {carbs}g · 脂肪 {fat}g",
  historyEmpty: "今天还没有确认过的餐食。",

  footerSources: "数据来源：USDA FoodData Central、Open Food Facts",
  footerDisclaimer: "营养估算不替代医生或注册营养师的诊断与建议。",

  // Toasts.
  noticePhotoRequired: "请先选择一张饭菜照片。",
  noticeUploadFailed: "图片上传失败。",
  noticeAnalyzeFailed: "饭菜识别失败。",
  noticeAnalyzeDone: "识别完成。请确认食物、份量和营养参考后再保存。",
  noticeConfirmIncomplete: "请为每种食物确认份量，并选择营养参考或填写每 100g 营养。",
  noticeMealSaveFailed: "餐食保存失败。",
  noticeMealSaved: "餐食和营养数据已经保存。",
  noticeSearchFailed: "食品搜索失败。",
  noticeBarcodeNotFound: "没有找到该条码。",
  noticeBarcodeFound: "已找到包装食品，请确认食用克数。",
  noticeCameraUnavailable: "无法使用摄像头，可手动输入条码。",
  noticeFoodLogFailed: "食品记录失败。",
  noticeFoodLogged: "食品已经加入今天的记录。",
  noticeRecipeItemAdded: "{name} 已加入菜谱草稿。",
  noticeRecipeIncomplete: "请填写菜谱名称并至少加入一种食材。",
  noticeRecipeSaveFailed: "菜谱保存失败。",
  noticeRecipeSaved: "菜谱已保存，并按份数计算营养。",
  noticeTemplateIncomplete: "请填写模板名称并至少加入一种食物。",
  noticeTemplateSaveFailed: "餐食模板保存失败。",
  noticeTemplateSaved: "餐食模板已保存。",
  noticeCustomFoodNameRequired: "请填写食品名称。",
  noticeCustomFoodSaveFailed: "自定义食品保存失败。",
  noticeCustomFoodSaved: "自定义食品已保存，请确认食用克数。",
  noticeTemplateLogFailed: "模板记录失败。",
  noticeTemplateLogged: "{name} 已加入今天。",
} as const;
