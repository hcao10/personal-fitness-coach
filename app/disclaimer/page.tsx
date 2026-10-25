import { DocumentHeader } from "../components/document-header";
import type { Metadata } from "next";
import { resolveLocale } from "../lib/locale-server";

const COPY = {
  zh: { title: "健康免责声明 — Cmine Fit", description: "Cmine Fit 健康免责声明：服务性质、使用前确认、停止条件、估算说明与用户责任。" },
  en: { title: "Health Disclaimer — Cmine Fit", description: "Important limits, safety conditions and user responsibilities when using Cmine Fit." },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await resolveLocale()];
}

const sectionStyle = { maxWidth: 760, margin: "0 auto", padding: "48px 20px", lineHeight: 1.8 } as const;

export default async function DisclaimerPage() {
  const locale = await resolveLocale();
  if (locale === "en") return <main className="legal-page" style={sectionStyle}>
    <DocumentHeader locale={locale} />
    <p style={{ opacity: 0.7 }}>Health v3 · Updated August 20, 2026 · Alpha</p>
    <h1>Cmine Fit Health Disclaimer</h1>
    <p><strong>Cmine Fit is an Alpha fitness product. Features and recommendations may change, and generated information may be incomplete or inaccurate.</strong></p>
    <h2>1. Nature of the service</h2>
    <p>Cmine Fit provides general fitness, exercise and nutrition information, including estimated energy needs, training plans, movement guidance and lifestyle suggestions. It does not provide diagnosis, treatment, rehabilitation, prescriptions, psychotherapy or individualized medical care, and it does not replace a doctor, physical therapist, registered dietitian or qualified coach.</p>
    <p>Do not rely on this service for emergencies, illness, injury or serious health risks.</p>
    <h2>2. Before you begin</h2>
    <p>Assess your health before starting a new exercise or eating plan. Seek appropriate professional advice first if you have:</p>
    <ul>
      <li>cardiovascular, respiratory, metabolic, neurological or musculoskeletal conditions;</li>
      <li>pregnancy, postpartum recovery or related restrictions;</li>
      <li>an injury, recent surgery, persistent pain or limited mobility;</li>
      <li>a history of eating disorders, severe underweight or unusually rapid weight change;</li>
      <li>medication that may affect exercise, heart rate, blood pressure, blood glucose or body weight; or</li>
      <li>instructions from a clinician to restrict exercise or diet.</li>
    </ul>
    <h2>3. Stop immediately</h2>
    <p>Stop exercising and seek appropriate medical help for chest pain or pressure, fainting, significant dizziness, unusual breathing difficulty, palpitations, loss of coordination, sudden severe headache, sharp pain, obvious swelling or other concerning symptoms. Contact local emergency services in an emergency.</p>
    <h2>4. Estimates and results</h2>
    <p>BMR, TDEE, calorie balance, macros, timelines, weight change and training outcomes are estimates. Actual results vary with measurement error, metabolism, sleep, medication, stress and adherence. Cmine Fit does not guarantee a particular weight, measurement, appearance, strength result or completion date.</p>
    <h2>5. User responsibility</h2>
    <p>You are responsible for providing accurate information, choosing a safe environment and appropriate load, learning correct technique, following equipment and facility rules, and not applying your personal plan directly to someone else.</p>
    <h2>6. Minors</h2>
    <p>Minors should use the service only with guardian consent and appropriate qualified supervision.</p>
    <h2>7. Alpha terms</h2>
    <p>Use of the Alpha service is voluntary. To the extent permitted by applicable law, Cmine Fit is responsible for interpreting and updating the service rules and product descriptions.</p>
    <p><a href="/privacy">Read the privacy notice </a></p>
  </main>;

  return <main className="legal-page" style={sectionStyle}>
    <DocumentHeader locale={locale} />
    <p style={{ opacity: 0.7 }}>版本 health-v3 · 更新于 2026-08-20 · Alpha 测试</p>
    <h1>Cmine Fit 健康免责声明</h1>
    <p><strong>Cmine Fit 是 Alpha 测试阶段的健身产品。功能与建议可能调整，生成的信息也可能不完整或不准确。</strong></p>
    <h2>1. 服务性质</h2>
    <p>Cmine Fit 提供一般性的健身、运动与营养信息，包括估算热量、训练计划、动作说明和生活方式建议。服务不提供医疗诊断、治疗、康复、处方、心理治疗或个体化医疗服务，也不能替代医生、物理治疗师、注册营养师或合格教练的专业判断。</p>
    <p>请勿依赖本服务处理紧急情况、疾病、伤病或严重健康风险。</p>
    <h2>2. 使用前确认</h2>
    <p>开始新的运动或饮食计划前，请先评估自身健康状况。存在以下情况时，应先取得适当的专业建议：</p>
    <ul>
      <li>心血管、呼吸、代谢、神经或骨骼肌肉疾病；</li>
      <li>怀孕、产后恢复或相关限制；</li>
      <li>当前伤病、手术恢复、持续疼痛或活动受限；</li>
      <li>进食障碍史、严重低体重或异常快速的体重变化；</li>
      <li>正在使用可能影响运动、心率、血压、血糖或体重的药物；</li>
      <li>医生曾建议限制运动或饮食。</li>
    </ul>
    <h2>3. 立即停止条件</h2>
    <p>运动中出现胸痛或胸闷、晕厥或明显眩晕、异常呼吸困难、心悸、失去协调、突发剧烈头痛、锐痛、明显肿胀或其他令人担忧的症状时，应立即停止运动并寻求适当的医疗帮助。紧急情况请联系当地急救服务。</p>
    <h2>4. 估算与结果</h2>
    <p>BMR、TDEE、热量差、宏量营养、目标周期、体重变化和训练效果均为估算。实际结果受测量误差、个体代谢、睡眠、药物、压力和执行情况等因素影响。Cmine Fit 不保证特定的体重、围度、外观、力量结果或完成时间。</p>
    <h2>5. 用户责任</h2>
    <p>用户负责提供准确完整的信息、选择安全的训练环境与负重、学习正确动作、遵守器械和场馆要求，并且不把自己的个性化计划直接用于他人。</p>
    <h2>6. 未成年人</h2>
    <p>未成年人仅应在监护人同意和适当的合格人员指导下使用。</p>
    <h2>7. Alpha 规则</h2>
    <p>使用 Alpha 服务属于自愿行为。在适用法律允许的范围内，Cmine Fit 负责对服务规则和产品说明进行解释与调整。</p>
    <p><a href="/privacy">查看隐私说明 </a></p>
  </main>;
}
