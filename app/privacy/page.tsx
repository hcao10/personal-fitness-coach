import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私说明 — Cmine Fit",
  description: "Cmine Fit 隐私说明：收集哪些数据、用途、保存期限、第三方处理者、导出与删除方式。",
};

const sectionStyle = { maxWidth: 760, margin: "0 auto", padding: "48px 20px", lineHeight: 1.8 } as const;

export default function PrivacyPage() {
  return <main style={sectionStyle}>
    <p style={{ opacity: 0.7 }}>版本 privacy-v1 · 更新于 2026-08-08</p>
    <h1>Cmine Fit 隐私说明</h1>
    <p><strong>本文为草案，正式上线前须经运营地区执业律师审核。</strong></p>
    <h2>1. 我们收集哪些数据</h2>
    <ul>
      <li><strong>账户信息</strong>：Cmine ID 提供的标识、昵称、邮箱、头像、语言与时区。</li>
      <li><strong>健身档案</strong>：年龄、性别、身高、体重、目标、经验、器械与可训练时间。</li>
      <li><strong>训练与身体记录</strong>：训练完成情况、组次与负重、RPE、疼痛反馈、体重与围度测量。</li>
      <li><strong>饮食记录</strong>：你确认记录的食物、份量与（若上传）饭菜照片。</li>
      <li><strong>健康平台数据</strong>：仅在你授权后，从 HealthKit / Health Connect 导入的摘要数据。</li>
      <li><strong>教练对话</strong>：你与 AI Coach 的消息及由此生成的教练记忆（可在产品内查看与删除）。</li>
    </ul>
    <p>身体指标、目标、伤病与训练记录可能属于敏感个人信息。请勿在自由文本中提交不必要的医疗记录、身份证件或其他高敏感信息。</p>
    <h2>2. 用途</h2>
    <p>数据仅用于生成与调整你的训练/营养计划、记录进度、提供教练对话、维持账户与订阅状态、保障安全与防滥用。我们不将你的数据用于广告，也不向第三方出售。</p>
    <h2>3. 保存期限</h2>
    <ul>
      <li>上传的饭菜照片在识别后保留至多 7 天，随后自动删除。</li>
      <li>登录会话最长 7 天，过期自动失效。</li>
      <li>账户数据在你删除账户前持续保存；删除账户会一并删除数据库记录与已上传文件。</li>
    </ul>
    <h2>4. 第三方处理者</h2>
    <ul>
      <li><strong>Cloudflare</strong>：托管、数据库（D1）、文件存储（R2）与默认 AI 推理（Workers AI）。</li>
      <li><strong>Cmine ID</strong>：账户登录与身份验证。</li>
      <li><strong>AI 供应商</strong>：按部署配置，计划/对话/图片识别请求可能发送至 OpenAI 或自托管兼容服务。</li>
      <li><strong>Stripe / RevenueCat</strong>：订阅支付处理（我们不接触你的完整卡号）。</li>
      <li><strong>Open Food Facts / USDA FoodData Central</strong>：食物搜索关键词会发送至这些公开数据库。</li>
      <li><strong>Google Fonts</strong>：网页字体加载会向 Google 发起请求。</li>
    </ul>
    <h2>5. 你的权利</h2>
    <p>你可以随时在「我的」页面导出全部数据（JSON）或删除账户；也可以在产品内删除单条教练记忆、饮食与训练记录。对本说明的实质性更新会要求你重新确认后才能继续使用。</p>
    <h2>6. 联系方式</h2>
    <p>隐私相关问题请通过产品内反馈或仓库 Issue 联系我们。</p>
    <p><a href="/disclaimer">查看健康免责声明 →</a></p>
  </main>;
}
