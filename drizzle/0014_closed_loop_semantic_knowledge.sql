ALTER TABLE coach_conversation_summaries ADD COLUMN method TEXT NOT NULL DEFAULT 'legacy_excerpt';
ALTER TABLE coach_conversation_summaries ADD COLUMN provider TEXT;
ALTER TABLE coach_conversation_summaries ADD COLUMN model TEXT;
ALTER TABLE coach_conversation_summaries ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE knowledge_embeddings (
  article_id TEXT PRIMARY KEY NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX knowledge_embeddings_model_idx ON knowledge_embeddings(model,updated_at);

INSERT OR IGNORE INTO knowledge_sources (id,title,publisher,url,locale,status,reviewed_at) VALUES
  ('cdc-healthy-weight-2025','Steps for Losing Weight','CDC','https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html','en','active','2026-08-20'),
  ('nhlbi-bmi','Overweight and Obesity: Symptoms and Diagnosis','NHLBI','https://www.nhlbi.nih.gov/health/overweight-and-obesity/symptoms','en','active','2026-08-20'),
  ('issn-protein','Position Stand: Protein and Exercise','Journal of the International Society of Sports Nutrition','https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8','en','active','2026-08-20');

INSERT OR REPLACE INTO knowledge_articles (id,source_id,topic,title,summary,keywords,status,reviewed_at) VALUES
  ('kb-resistance-consistency','acsm-resistance-2026','training','持续执行优先于复杂方案','对大多数健康成年人，从不进行阻力训练转向规律训练带来的收益最大。计划应适合时间、偏好、器械和能力，优先保证长期执行。','坚持 规律 训练频率 新手 计划 复杂 周期','active','2026-08-20'),
  ('kb-resistance-strength','acsm-resistance-2026','training','力量目标的负荷与组数','以力量为主要目标时，可把较重负荷安排在主要动作，并以每个动作约 2–3 个工作组作为可调整起点；必须结合技术、恢复和疼痛反馈。','力量 负重 80% 1RM 工作组 渐进','active','2026-08-20'),
  ('kb-resistance-hypertrophy','acsm-resistance-2026','training','增肌训练量应逐步建立','增肌可受益于较高周训练量，约每个肌群每周 10 组可作为一般参考，而不是所有人的固定最低值；新手和恢复不足者应从更低训练量开始。','增肌 肌肥大 周组数 训练量 10组 恢复','active','2026-08-20'),
  ('kb-resistance-equipment','acsm-resistance-2026','training','器械不是效果的前提','弹力带、自重、自由重量和器械训练都可以改善力量和身体功能；动作选择应由可获得器械、技术能力、舒适度和安全限制决定。','居家 自重 哑铃 弹力带 器械 动作替换','active','2026-08-20'),
  ('kb-resistance-failure','acsm-resistance-2026','training','多数训练不必做到力竭','对一般健康和健身目标，训练到瞬间力竭和复杂高级技术通常不是必要条件。保留适当 RIR 更利于动作质量和恢复管理。','力竭 RIR RPE 高级技巧 动作质量 恢复','active','2026-08-20'),
  ('kb-activity-baseline','who-physical-activity','activity','从可执行的活动量开始','规律身体活动和减少久坐有益。当前活动不足的人可以从少量步行或其他可承受活动开始，再逐步增加频率、时长或强度。','步数 步行 有氧 久坐 活动量 新手','active','2026-08-20'),
  ('kb-aerobic-guideline','odphp-physical-activity','activity','成人一般有氧与力量活动基线','一般成年人可把每周 150–300 分钟中等强度有氧活动和至少 2 天肌力活动作为公共健康参考，再按当前能力逐步接近。','有氧 150分钟 300分钟 每周 两天 力量 心肺','active','2026-08-20'),
  ('kb-weight-loss-pace','cdc-healthy-weight-2025','nutrition','减重目标应渐进且可持续','渐进、稳定的减重通常比极快减重更容易维持。睡眠、压力、饮食和活动共同影响体重，单周波动不能直接当作脂肪变化。','减脂 减重 速度 每周 体重波动 睡眠 压力','active','2026-08-20'),
  ('kb-bmi-screening','nhlbi-bmi','measurement','BMI 是筛查指标而不是诊断','BMI 根据身高和体重计算，适合观察一般范围，但不直接测量体脂，也不能区分脂肪和肌肉。应结合腰围、体脂趋势和个人情况理解。','BMI 体重 身高 腰围 体脂 肌肉 筛查','active','2026-08-20'),
  ('kb-protein-exercise','issn-protein','nutrition','规律训练者的蛋白质参考范围','对多数进行规律训练的健康成年人，每日蛋白质约 1.4–2.0 g/kg 可作为一般参考范围；具体目标仍应结合总能量、饮食偏好和专业医疗限制。','蛋白质 增肌 减脂 每公斤 1.4 2.0 饮食','active','2026-08-20');

