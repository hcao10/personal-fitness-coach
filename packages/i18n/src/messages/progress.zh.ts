// Copy for app/progress. Chinese is the schema: a key added here must be
// added to progress.en.ts or the build fails.
export const progressZh = {
  eyebrow: "PROGRESS / 长期进度",
  title: "看清变化，再决定下一步",

  // Weekly review panel.
  reviewEyebrow: "本周复盘",
  reviewPrompt: "先告诉我们这一周的恢复情况",
  metricAdherence: "完成率",
  metricSessions: "有效训练",
  metricAverageRpe: "平均 RPE",
  metricPeakPain: "最高疼痛",
  // {stalled} is the optional clause below; {teaser} is the locked-preview line
  // the server already sends per locale.
  engineSummary: "教练引擎在你的数据里找到了 {count} 条针对性调整{stalled}。{teaser}",
  engineStagnation: "，并检测到 {count} 个停滞动作",
  unlockAdjustments: "升级 Pro，解锁并一键采纳完整调整方案 →",
  keepCurrentPlan: "保留当前计划",
  acceptAdjustments: "接受并启用调整",

  // Check-in sliders.
  recoveryLabel: "恢复状态",
  sleepLabel: "睡眠质量",
  painLabel: "疼痛程度",
  generating: "正在分析…",
  generateReview: "生成本周复盘 →",

  // Result messages.
  generateFailed: "复盘生成失败。",
  planActivated: "新计划版本已启用，旧版本仍可追溯。",
  planKept: "已保留当前计划。",
  actionFailed: "操作失败，请重试。",

  // History rail.
  historyEyebrow: "历史复盘",
  historyPlaceholderTitle: "记录收集中",
  historyEmpty: "完成几周训练后，趋势和计划版本会显示在这里。",

  // Charts.
  chartsEyebrow: "进步曲线",
  chartsEmptyTitle: "还没有足够的训练记录",
  chartsEmptyBody: "完成并记录几次带重量的训练后，这里会显示每周训练量和主要动作的估算 1RM 趋势。",
  chartsTitle: "看得见的变化",
  chartsSummary: "累计训练量 {tonnes} 吨 · 共 {sessions} 次训练记录。以下数据全部来自你实际记录的组数，未做平滑处理。",
  weeklyTonnageHeading: "每周训练量（kg）",
  weeklyTonnageChartLabel: "每周训练量：{data}",
  // Joins the per-week readings inside the chart's aria-label. Punctuation, but
  // a screen reader speaks it, so it belongs to the locale.
  listSeparator: "，",
  weeklyTonnageBarTitle: "{date}：{tonnage} kg · {sessions} 次训练",
  weeklyTonnageRange: "{from} — {to}，峰值 {peak} kg",
  e1rmHeading: "主要动作估算 1RM",
  exerciseChange: "　{change}%",
  e1rmChartLabel: "{name} 估算 1RM 从 {from} kg 到 {to} kg",
  e1rmNote: "估算 1RM 按 Epley 公式从你完成的组数换算，用于观察趋势，不建议直接当作实测最大重量。",
  weightHeading: "体重趋势",
  weightChartLabel: "体重从 {from} kg 到 {to} kg",
  planAdjustments: "　·　期间计划调整 {count} 次（最近 {date}）",
} as const;
