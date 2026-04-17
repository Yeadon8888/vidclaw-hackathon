import type { Metadata } from "next";
import "../legal.css";

export const metadata: Metadata = {
  title: "隐私政策 / Privacy Policy",
  description:
    "VidClaw 如何收集、使用、存储和保护您的个人信息。How VidClaw collects, uses, stores, and protects your personal information.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "2026-04-17";

export default function PrivacyPage() {
  return (
    <article className="legal-prose">
      <h1>隐私政策</h1>
      <p className="updated">最后更新：{UPDATED}</p>

      <p>
        本隐私政策描述 VidClaw（下称"我们"或"本服务"，运营网站 <strong>video.yeadon.top</strong>）在您使用我们的 AI 视频生成服务时，如何收集、使用、存储和保护您的个人信息。您使用本服务即表示您已阅读并同意本政策。
      </p>

      <h2>1. 我们收集的信息</h2>
      <h3>1.1 您主动提供</h3>
      <ul>
        <li>账户信息：邮箱、显示名、头像</li>
        <li>内容：您上传的产品图片、参考视频、提示词文案</li>
        <li>支付信息：所有支付（包括信用卡、借记卡与通过 Stripe 渠道的支付宝）由 Stripe 统一处理。我们<strong>不存储</strong>您的完整卡号或银行账号；我们仅保存 Stripe 返回的 Customer ID、订单号、支付方式末四位（如有）与开票金额</li>
        <li>反馈和沟通记录</li>
      </ul>
      <h3>1.2 自动收集</h3>
      <ul>
        <li>技术数据：IP 地址、浏览器类型、设备类型、访问时间</li>
        <li>使用数据：生成记录、模型选择、积分消耗</li>
        <li>Cookie 与本地存储：用于登录会话、偏好设置、反作弊</li>
      </ul>

      <h2>2. 我们如何使用信息</h2>
      <ul>
        <li>提供、维护和改进 AI 视频生成服务</li>
        <li>处理支付、发送订单与发票</li>
        <li>与您沟通（服务通知、账单、安全提醒）</li>
        <li>防止欺诈、滥用、违反服务条款的行为</li>
        <li>遵守法律法规</li>
      </ul>

      <h2>3. 第三方服务提供方</h2>
      <p>为提供服务，我们必须与以下第三方共享必要数据（每方仅接收其履职所需最少信息）：</p>
      <ul>
        <li><strong>Supabase</strong>（数据库 + 身份认证）— 存储账户和业务数据</li>
        <li><strong>Vercel</strong>（托管与 CDN）— 应用部署</li>
        <li><strong>Cloudflare</strong>（CDN、DDoS 防护）</li>
        <li><strong>Stripe</strong>（支付处理，PCI-DSS Level 1 合规）— 处理信用卡、借记卡以及通过 Stripe 渠道发起的支付宝付款；支付宝付款由蚂蚁集团作为二级处理方共同处理</li>
        <li><strong>AI 模型提供方</strong>（OpenAI / Google / 阿里 / 字节 / 快手等）— 处理您提交的视频生成请求；您的提示词与参考资料将被上传至相应供应商的 API 以生成视频</li>
        <li><strong>Cloudflare R2 / 阿里云 OSS</strong>（对象存储）— 存储生成的视频与资源</li>
      </ul>
      <p>除上述情形外，我们不会将您的个人信息出售或出租给第三方。</p>

      <h2>4. 数据存储与安全</h2>
      <ul>
        <li>我们采用 TLS/HTTPS 加密所有传输链路</li>
        <li>账户密码通过 Supabase 的 bcrypt/Argon2 哈希存储，我们无法查看明文密码</li>
        <li>支付卡与支付宝交易信息由 Stripe 直接采集和处理，遵循 PCI-DSS Level 1 标准</li>
        <li>数据主要存储于新加坡/香港区域（Supabase）与全球 CDN 边缘节点（Cloudflare）</li>
      </ul>

      <h2>5. 数据保留</h2>
      <ul>
        <li>账户数据：在您账户存续期间保留；注销账户后 30 天内删除或匿名化（法律要求留存的除外，如开票记录依法保留 7 年）</li>
        <li>生成的视频资源：按生成任务的保留政策（通常 30 天后自动清理过期资源）</li>
        <li>支付与账务记录：按会计法规要求保留</li>
      </ul>

      <h2>6. 您的权利</h2>
      <p>您有权：</p>
      <ul>
        <li>访问我们持有的关于您的个人数据</li>
        <li>更正不准确的数据</li>
        <li>删除您的账户与关联数据（法定留存除外）</li>
        <li>导出您的数据（JSON 格式）</li>
        <li>反对或限制特定处理</li>
        <li>撤回您此前给予的同意</li>
      </ul>
      <p>如需行使以上任何一项权利，请发邮件至 <a href="mailto:support@yeadon.top">support@yeadon.top</a>，我们将在 30 天内响应。</p>

      <h2>7. 儿童隐私</h2>
      <p>本服务不面向 <strong>18 岁以下</strong>的个人提供。如果您是未成年人的监护人并发现您的孩子向我们提供了信息，请联系我们，我们将立即删除相关信息。</p>

      <h2>8. Cookie 政策</h2>
      <p>我们使用严格必要的 Cookie 保持登录状态和应用偏好。不使用第三方广告追踪 Cookie。</p>

      <h2>9. 政策更新</h2>
      <p>我们可能会不时更新本政策。重大变更时我们将通过邮件或应用内公告通知您。持续使用服务即视为接受更新后的政策。</p>

      <h2>10. 联系我们</h2>
      <p>
        邮箱：<a href="mailto:support@yeadon.top">support@yeadon.top</a><br />
        网站：<a href="https://video.yeadon.top">https://video.yeadon.top</a>
      </p>

      <div className="lang-divider">English Version</div>

      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: {UPDATED}</p>

      <p>
        This Privacy Policy describes how VidClaw ("we", "us", operating <strong>video.yeadon.top</strong>) collects, uses, stores, and protects your personal information when you use our AI video generation service. By using the service, you acknowledge and consent to this policy.
      </p>

      <h2>1. Information We Collect</h2>
      <h3>1.1 Information You Provide</h3>
      <ul>
        <li>Account: email, display name, avatar</li>
        <li>Content: product images, reference videos, prompts you upload</li>
        <li>Payment: all payments (including cards and Alipay-via-Stripe) are processed by Stripe. We do <strong>not</strong> store full card numbers; we only retain Stripe customer IDs, order IDs, last-four digits (where applicable), and billed amounts</li>
        <li>Support communications</li>
      </ul>
      <h3>1.2 Collected Automatically</h3>
      <ul>
        <li>Technical: IP address, browser, device type, access timestamps</li>
        <li>Usage: generation history, model selection, credit consumption</li>
        <li>Cookies &amp; local storage: for session management and preferences</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To provide, maintain, and improve our AI video generation service</li>
        <li>To process payments, send receipts and invoices</li>
        <li>To communicate with you about service, billing, and security</li>
        <li>To prevent fraud, abuse, and violations of our Terms of Service</li>
        <li>To comply with applicable laws</li>
      </ul>

      <h2>3. Third-Party Processors</h2>
      <p>We share the minimum necessary data with:</p>
      <ul>
        <li><strong>Supabase</strong> (database + auth)</li>
        <li><strong>Vercel</strong> (hosting &amp; CDN)</li>
        <li><strong>Cloudflare</strong> (CDN, DDoS protection)</li>
        <li><strong>Stripe</strong> (payment processing, PCI-DSS Level 1) — processes cards and Alipay payments initiated through Stripe; Alipay charges involve Ant Group as a sub-processor</li>
        <li><strong>AI model providers</strong> (OpenAI, Google, Alibaba, ByteDance, Kuaishou, etc.) — your prompts and reference materials are sent to the selected provider's API to produce output</li>
        <li><strong>Cloudflare R2 / Alibaba OSS</strong> (object storage for generated videos)</li>
      </ul>
      <p>We do not sell or rent your personal information to third parties.</p>

      <h2>4. Data Security</h2>
      <ul>
        <li>All connections use TLS/HTTPS</li>
        <li>Passwords are hashed (bcrypt/Argon2) via Supabase Auth</li>
        <li>Card and Alipay data are handled directly by Stripe under PCI-DSS Level 1</li>
      </ul>

      <h2>5. Data Retention</h2>
      <ul>
        <li>Account data is retained for the lifetime of your account and deleted within 30 days after account closure (except records legally required to retain, e.g., 7-year accounting records)</li>
        <li>Generated media is retained per the generation-task retention policy</li>
      </ul>

      <h2>6. Your Rights</h2>
      <p>You have the right to access, correct, delete, export, restrict, or object to our processing of your personal data, and to withdraw consent. Contact <a href="mailto:support@yeadon.top">support@yeadon.top</a> — we will respond within 30 days.</p>

      <h2>7. Children</h2>
      <p>The service is not directed to individuals under 18. If you believe a minor has provided us data, please contact us and we will promptly delete it.</p>

      <h2>8. Cookies</h2>
      <p>We use strictly-necessary cookies for authentication and preferences. We do not use third-party advertising trackers.</p>

      <h2>9. Changes</h2>
      <p>We may update this policy periodically. Material changes will be communicated via email or in-app notice.</p>

      <h2>10. Contact</h2>
      <p>
        Email: <a href="mailto:support@yeadon.top">support@yeadon.top</a><br />
        Website: <a href="https://video.yeadon.top">https://video.yeadon.top</a>
      </p>
    </article>
  );
}
