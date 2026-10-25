import { DocumentHeader } from "../components/document-header";
import type { Metadata } from "next";
import { resolveLocale } from "../lib/locale-server";

const COPY = {
  zh: {
    title: "隐私说明 — Cmine Fit",
    description: "Cmine Fit 隐私说明：收集的数据、用途、保存期限、服务提供方及用户权利。",
  },
  en: {
    title: "Privacy Notice — Cmine Fit",
    description: "How Cmine Fit collects, uses, retains and protects your information, and the choices available to you.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await resolveLocale()];
}

const sectionStyle = { maxWidth: 760, margin: "0 auto", padding: "48px 20px", lineHeight: 1.8 } as const;

export default async function PrivacyPage() {
  const locale = await resolveLocale();
  if (locale === "en") return <main className="legal-page" style={sectionStyle}>
    <DocumentHeader locale={locale} />
    <p style={{ opacity: 0.7 }}>Privacy v2 · Updated August 20, 2026 · Alpha</p>
    <h1>Cmine Fit Privacy Notice</h1>
    <p><strong>Cmine Fit is currently an Alpha service. Features, data handling practices and this notice may change as testing continues.</strong></p>
    <h2>1. Information we collect</h2>
    <ul>
      <li><strong>Account information:</strong> account identifier, name, email, profile image, language and time zone.</li>
      <li><strong>Fitness profile:</strong> age, sex, height, weight, goals, experience, available equipment and schedule.</li>
      <li><strong>Training and body records:</strong> sessions, sets, load, RPE, pain feedback, weight and measurements.</li>
      <li><strong>Nutrition records:</strong> foods and portions you confirm, plus meal photos when you choose to upload them.</li>
      <li><strong>Connected health summaries:</strong> only after you grant access to a supported health service.</li>
      <li><strong>Coach conversations:</strong> your messages, generated replies and coaching memories used to maintain continuity.</li>
    </ul>
    <p>Body metrics, goals, injuries and training records may be sensitive. Do not enter unnecessary medical records, identity documents or other highly sensitive information into free-text fields.</p>
    <h2>2. How we use information</h2>
    <p>We use this information to generate and adjust training or nutrition plans, record progress, provide Coach conversations, operate accounts and subscriptions, improve reliability, protect safety and prevent abuse. We do not sell personal information or use health and fitness data for advertising.</p>
    <h2>3. Retention</h2>
    <ul>
      <li>Uploaded meal photos are retained for up to seven days after analysis and then deleted automatically.</li>
      <li>Sign-in sessions expire after no more than seven days.</li>
      <li>Account records remain until you delete the account, subject to limited records that must be retained for security, dispute or legal obligations.</li>
    </ul>
    <h2>4. Service providers</h2>
    <p>We may use specialized providers for hosting and storage, identity verification, AI processing, payments, food information and optional device services. They receive only the information needed to provide the requested function and process it under their own applicable terms and privacy commitments.</p>
    <h2>5. Your choices</h2>
    <p>You can export your account data or request account deletion from the Account page. You can also remove supported Coach memories and individual records in the product. Material changes to this notice may require renewed acceptance.</p>
    <h2>6. Contact</h2>
    <p>Use the in-product feedback channel for privacy questions or requests.</p>
    <h2>7. Alpha terms</h2>
    <p>To the extent permitted by applicable law, Cmine Fit is responsible for interpreting and updating the Alpha service rules and product descriptions.</p>
    <p><a href="/disclaimer">Read the health disclaimer </a></p>
  </main>;

  return <main className="legal-page" style={sectionStyle}>
    <DocumentHeader locale={locale} />
    <p style={{ opacity: 0.7 }}>版本 privacy-v2 · 更新于 2026-08-20 · Alpha 测试</p>
    <h1>Cmine Fit 隐私说明</h1>
    <p><strong>Cmine Fit 目前处于 Alpha 测试阶段。随着测试推进，功能、数据处理方式和本说明可能调整。</strong></p>
    <h2>1. 我们收集哪些数据</h2>
    <ul>
      <li><strong>账户信息</strong>：账户标识、昵称、邮箱、头像、语言与时区。</li>
      <li><strong>健身档案</strong>：年龄、性别、身高、体重、目标、经验、器械与可训练时间。</li>
      <li><strong>训练与身体记录</strong>：训练完成情况、组次与负重、RPE、疼痛反馈、体重与围度测量。</li>
      <li><strong>饮食记录</strong>：你确认记录的食物、份量，以及你选择上传的饭菜照片。</li>
      <li><strong>健康数据摘要</strong>：仅在你授权后，从支持的健康服务导入的摘要数据。</li>
      <li><strong>Coach 对话</strong>：你的消息、生成的回复，以及用于保持连续性的教练记忆。</li>
    </ul>
    <p>身体指标、目标、伤病与训练记录可能属于敏感个人信息。请勿在自由文本中提交不必要的医疗记录、身份证件或其他高敏感信息。</p>
    <h2>2. 数据用途</h2>
    <p>数据用于生成和调整训练或营养计划、记录进度、提供 Coach 对话、维持账户与订阅、改善可靠性、保障安全和防止滥用。我们不出售个人信息，也不将健康和健身数据用于广告。</p>
    <h2>3. 保存期限</h2>
    <ul>
      <li>上传的饭菜照片在识别后保留至多 7 天，随后自动删除。</li>
      <li>登录会话最长 7 天，过期自动失效。</li>
      <li>账户记录保存至你删除账户；为安全、争议处理或履行法律义务所必需的有限记录除外。</li>
    </ul>
    <h2>4. 服务提供方</h2>
    <p>我们可能使用专业服务提供方完成托管与存储、身份验证、AI 处理、支付、食品信息和可选设备服务。服务提供方仅接收完成相应功能所需的信息，并按其适用条款和隐私承诺处理。</p>
    <h2>5. 你的选择</h2>
    <p>你可以在「我的」页面导出账户数据或申请删除账户，也可以在产品支持的范围内删除 Coach 记忆和单项记录。对本说明的实质性更新可能要求你重新确认。</p>
    <h2>6. 联系方式</h2>
    <p>隐私相关问题或请求请通过产品内反馈渠道联系我们。</p>
    <h2>7. Alpha 规则</h2>
    <p>在适用法律允许的范围内，Cmine Fit 负责对 Alpha 服务规则和产品说明进行解释与调整。</p>
    <p><a href="/disclaimer">查看健康免责声明 </a></p>
  </main>;
}
