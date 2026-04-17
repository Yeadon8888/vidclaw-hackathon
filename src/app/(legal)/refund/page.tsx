import type { Metadata } from "next";
import "../legal.css";

export const metadata: Metadata = {
  title: "退款政策 / Refund Policy",
  description:
    "VidClaw 关于订单退款、积分退还、交易纠纷处理的政策。VidClaw's refund, credit reversal, and dispute resolution policy.",
  alternates: { canonical: "/refund" },
};

const UPDATED = "2026-04-17";

export default function RefundPage() {
  return (
    <article className="legal-prose">
      <h1>退款政策</h1>
      <p className="updated">最后更新：{UPDATED}</p>

      <p>
        感谢您选择 VidClaw。我们致力于为您提供高质量的 AI 视频生成服务。本政策说明在什么情况下您可以申请退款、如何申请以及处理时效。
      </p>

      <h2>1. 适用范围</h2>
      <p>本政策适用于您通过 VidClaw 平台购买的所有积分套餐、订阅服务与增值服务。</p>

      <h2>2. 可退款情形</h2>
      <p>出于服务成本与防止滥用的考虑，本服务对积分采取<strong>"已售出不退换"</strong>政策。仅在以下严格情形下，您有权申请退款：</p>
      <ul>
        <li><strong>技术故障导致任务失败</strong>：平台或 AI 模型提供方故障导致您的生成任务失败，且系统未自动退回积分</li>
        <li><strong>重复扣费</strong>：同一订单被扣款两次或多次（我们将退回重复支付金额）</li>
        <li><strong>未授权交易</strong>：您的支付方式被他人盗用并发生扣费（须在 30 天内报告并提供必要证明，例如报案回执）</li>
      </ul>

      <h2>3. 不予退款情形</h2>
      <p>以下情况我们无法提供退款：</p>
      <ul>
        <li>积分已被使用（哪怕只消耗了 1 分）— 已消耗积分不可逆转</li>
        <li>对 AI 生成效果不满意（AI 生成具有概率性；我们在服务条款中已说明不保证特定效果）</li>
        <li>购买超过 7 天后的订单（技术故障除外）</li>
        <li>积分因 180 天有效期到期而作废</li>
        <li>因您违反服务条款被封号后的未使用积分</li>
        <li>Promotional（促销）或赠送的积分</li>
      </ul>

      <h2>4. 申请退款流程</h2>
      <ol>
        <li>发送邮件至 <a href="mailto:support@yeadon.top">support@yeadon.top</a>，邮件主题写明 <strong>"退款申请 - 订单号"</strong></li>
        <li>邮件内容包含：
          <ul>
            <li>您的注册邮箱</li>
            <li>订单号 / Stripe 收据号 / 支付宝交易号</li>
            <li>支付金额与时间</li>
            <li>退款原因与相关证据（如错误截图）</li>
          </ul>
        </li>
        <li>我们会在收到申请后 <strong>3 个工作日内</strong>回复审核结果</li>
        <li>审核通过后，退款原路返回您的原支付渠道（信用卡 / 支付宝）</li>
        <li>到账时间：
          <ul>
            <li>信用卡 / 借记卡：<strong>5–10 个工作日</strong>（由发卡行决定）</li>
            <li>支付宝（通过 Stripe）：<strong>1–5 个工作日</strong></li>
          </ul>
        </li>
      </ol>

      <h2>5. 自动退回积分</h2>
      <p>
        平台对部分失败情形有<strong>自动退回积分</strong>机制：当您的视频生成任务因技术原因失败（如 AI 供应商 API 返回错误、视频超时未产出等），系统会自动将对应积分退回您的账户，<strong>无需申请</strong>。您可在任务列表查看状态。
      </p>

      <h2>6. 交易纠纷</h2>
      <p>
        如您对扣款有疑问，建议优先联系我们 <a href="mailto:support@yeadon.top">support@yeadon.top</a> 协商处理。直接向发卡行发起 <strong>chargeback（拒付）</strong>会触发 Stripe 争议流程，可能导致您账户被暂停。我们会配合银行提供所有必要证据。
      </p>

      <h2>7. 订阅取消</h2>
      <p>
        如您订阅了月度/年度套餐，可随时在账户设置中取消自动续费。取消后，您仍可使用当期剩余服务至周期结束；已支付的当期费用不予退还，但不会被继续扣费。
      </p>

      <h2>8. 政策更新</h2>
      <p>我们保留根据法律要求或业务需要修改本政策的权利。重大变更将提前通知。</p>

      <h2>9. 联系我们</h2>
      <p>
        邮箱：<a href="mailto:support@yeadon.top">support@yeadon.top</a><br />
        通常在 <strong>24 小时内</strong>响应（工作日）。
      </p>

      <div className="lang-divider">English Version</div>

      <h1>Refund Policy</h1>
      <p className="updated">Last updated: {UPDATED}</p>

      <p>
        Thank you for choosing VidClaw. This policy explains when refunds are available, how to request one, and the processing timelines.
      </p>

      <h2>1. Scope</h2>
      <p>This policy covers all credit packs, subscriptions, and add-on services purchased through VidClaw.</p>

      <h2>2. Eligible for Refund</h2>
      <p>Given AI-generation costs and to prevent abuse, credit purchases are <strong>final sale</strong>. Refunds are only granted in the following strict cases:</p>
      <ul>
        <li><strong>Technical failure</strong>: a platform or AI-provider outage caused your generation to fail and credits were not auto-refunded</li>
        <li><strong>Duplicate charge</strong>: you were charged twice for the same order — we will refund the duplicate</li>
        <li><strong>Unauthorized transaction</strong>: your payment method was used without your authorization (must be reported within 30 days with reasonable evidence, e.g., police report)</li>
      </ul>

      <h2>3. Not Eligible</h2>
      <ul>
        <li>Credits that have been consumed (even partially)</li>
        <li>Dissatisfaction with AI output quality (AI generation is probabilistic; see Terms §7)</li>
        <li>Orders older than 7 days, except technical failures</li>
        <li>Credits expired after their 180-day validity</li>
        <li>Unused credits on accounts banned for Terms violations</li>
        <li>Promotional or gifted credits</li>
      </ul>

      <h2>4. How to Request</h2>
      <ol>
        <li>Email <a href="mailto:support@yeadon.top">support@yeadon.top</a> with subject <strong>"Refund Request - Order #"</strong></li>
        <li>Include: registered email, order ID / Stripe receipt / Alipay txn ID, amount and date, reason and evidence (screenshots)</li>
        <li>We respond within <strong>3 business days</strong></li>
        <li>Approved refunds are returned via the original payment method</li>
        <li>Arrival time: cards <strong>5–10 business days</strong>; Alipay (via Stripe) <strong>1–5 business days</strong></li>
      </ol>

      <h2>5. Automatic Credit Reversal</h2>
      <p>
        For technical failures (AI API errors, generation timeouts), the platform automatically refunds the consumed credits to your balance. No request required. Check your task list for status.
      </p>

      <h2>6. Disputes &amp; Chargebacks</h2>
      <p>
        Please contact us first at <a href="mailto:support@yeadon.top">support@yeadon.top</a>. Initiating a <strong>chargeback</strong> directly with your card issuer may trigger a Stripe dispute and cause your account to be suspended.
      </p>

      <h2>7. Subscription Cancellation</h2>
      <p>
        Cancel auto-renewal anytime in account settings. Access continues through the end of the current billing period; already-paid amounts are non-refundable but future billing stops.
      </p>

      <h2>8. Changes</h2>
      <p>We may update this policy. Material changes will be notified in advance.</p>

      <h2>9. Contact</h2>
      <p>
        Email: <a href="mailto:support@yeadon.top">support@yeadon.top</a> — typically within 24h on business days.
      </p>
    </article>
  );
}
