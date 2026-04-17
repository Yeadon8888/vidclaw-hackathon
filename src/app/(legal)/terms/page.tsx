import type { Metadata } from "next";
import "../legal.css";

export const metadata: Metadata = {
  title: "服务条款 / Terms of Service",
  description:
    "使用 VidClaw AI 视频生成服务的条款与条件。Terms and conditions for using VidClaw AI video generation service.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "2026-04-17";

export default function TermsPage() {
  return (
    <article className="legal-prose">
      <h1>服务条款</h1>
      <p className="updated">最后更新：{UPDATED}</p>

      <p>
        欢迎使用 VidClaw（下称"本服务"，运营 <strong>video.yeadon.top</strong>）。请您在注册或使用前仔细阅读本条款。一旦注册或使用，即视为您已接受全部条款内容。
      </p>

      <h2>1. 服务说明</h2>
      <p>
        VidClaw 是一款面向内容创作者和电商卖家的 AI 视频生成 SaaS。用户通过上传产品图片、参考视频或提示词，由平台调用第三方 AI 模型（如 Google VEO、OpenAI Sora、阿里 Seedance、Hailuo 等）生成短视频、分镜脚本与配套文案。服务按积分/套餐计费。
      </p>

      <h2>2. 账户注册</h2>
      <ul>
        <li>您须年满 <strong>18 岁</strong>才能注册使用本服务</li>
        <li>您必须提供真实、准确、完整的注册信息，并在信息变更时及时更新</li>
        <li>您有责任保管账户凭证；由于您未妥善保管导致的损失由您自行承担</li>
        <li>一个自然人/实体仅可注册一个账户；发现重复注册我们有权合并或关闭</li>
      </ul>

      <h2>3. 可接受使用</h2>
      <p>您同意<strong>不</strong>使用本服务生成、上传、传播以下内容：</p>
      <ul>
        <li>违反中国大陆、香港或服务所在地法律法规的内容</li>
        <li>色情、暴力、血腥、恐怖、自残相关内容</li>
        <li>涉及未成年人的不当内容（<strong>严格禁止</strong>）</li>
        <li>侵犯他人知识产权、肖像权、隐私权的内容</li>
        <li>虚假信息、诈骗、误导性广告</li>
        <li>仇恨言论、歧视、骚扰</li>
        <li>涉及政治敏感话题、国家领导人形象的内容</li>
        <li>任何被 AI 模型提供方的使用政策禁止的内容</li>
      </ul>
      <p>您也不得：</p>
      <ul>
        <li>逆向工程、反编译、试图破解平台</li>
        <li>使用爬虫、自动化脚本批量抓取生成结果</li>
        <li>转售、转让或向第三方开放您的账户</li>
        <li>使用服务从事与其 intended 用途无关的活动</li>
      </ul>

      <h2>4. 用户内容与生成输出</h2>
      <ul>
        <li><strong>您的输入</strong>（图片、视频、提示词）所有权归您；您授予 VidClaw 为提供服务所需的处理、存储、传输权限</li>
        <li><strong>生成输出</strong>的商用权归您；但受限于各 AI 模型提供方的使用条款（例如 Sora、VEO 的商用许可）</li>
        <li>您对上传内容的合法性负全责——如您上传他人作品、竞品视频做"二创"，相关版权风险由您承担</li>
        <li>我们保留因内容违规而删除、隐藏用户内容的权利</li>
      </ul>

      <h2>5. 订阅与计费</h2>
      <ul>
        <li>本服务采用<strong>积分预充值</strong>模式。不同 AI 模型消耗不同积分数</li>
        <li>支付通过 Stripe 统一处理（支持信用卡/借记卡，以及通过 Stripe 渠道的支付宝），金额以下单页展示的为准</li>
        <li>积分<strong>一旦购买不可退换</strong>（但可申请退款，参见 <a href="/refund">退款政策</a>）</li>
        <li>积分在购买后一般 <strong>180 天内有效</strong>，到期未使用的部分自动作废</li>
        <li>部分套餐可能为订阅制，自动续费规则会在结算页明确告知</li>
        <li>我们保留调整价格的权利；调整前通过邮件或应用内公告提前 15 天通知</li>
      </ul>

      <h2>6. 取消与终止</h2>
      <ul>
        <li>您可随时在账户设置中申请注销账户</li>
        <li>我们保留因您违反本条款而中止或终止您账户的权利，情节严重的不予退还积分</li>
      </ul>

      <h2>7. 免责声明</h2>
      <ul>
        <li>AI 生成的内容存在不确定性，可能与预期不一致；我们不对特定输出效果做保证</li>
        <li>服务可能存在停机、维护、API 供应商故障等情况，我们尽最大努力维持可用</li>
        <li>生成内容仅供参考，您自行评估是否满足商业、法律、广告规范要求</li>
      </ul>

      <h2>8. 责任限制</h2>
      <p>
        在法律允许的最大限度内：(a) 本服务按"现状"与"可用性"提供；(b) 我们对间接、附带、惩罚性或后果性损失不承担责任；(c) 我们的累计赔偿责任不超过您过去 <strong>12 个月</strong>支付给本服务的费用总额。
      </p>

      <h2>9. 知识产权</h2>
      <p>
        VidClaw 的品牌、Logo、代码、界面、文档均受著作权与商标法保护，未经许可不得复制、模仿或使用。
      </p>

      <h2>10. 适用法律与争议解决</h2>
      <p>
        本条款受<strong>中华人民共和国香港特别行政区</strong>法律管辖。因本条款产生的争议，双方应友好协商；协商不成的，提交香港国际仲裁中心（HKIAC）仲裁解决。
      </p>

      <h2>11. 条款修改</h2>
      <p>我们保留随时修改本条款的权利。重大修改将提前 15 天通知。持续使用即视为接受新版条款。</p>

      <h2>12. 联系我们</h2>
      <p>
        邮箱：<a href="mailto:support@yeadon.top">support@yeadon.top</a>
      </p>

      <div className="lang-divider">English Version</div>

      <h1>Terms of Service</h1>
      <p className="updated">Last updated: {UPDATED}</p>

      <p>
        Welcome to VidClaw (the "Service", operating <strong>video.yeadon.top</strong>). Please read these Terms carefully before registering or using the Service. By registering or using, you agree to be bound by these Terms in full.
      </p>

      <h2>1. Service Description</h2>
      <p>
        VidClaw is a SaaS platform providing AI-generated short videos for content creators and e-commerce merchants. Users upload product images, reference videos, or prompts, and the platform invokes third-party AI models (Google VEO, OpenAI Sora, Alibaba Seedance, Hailuo, etc.) to produce videos, storyboards, and copy. The service is billed on a credit/plan basis.
      </p>

      <h2>2. Account Registration</h2>
      <ul>
        <li>You must be at least <strong>18 years old</strong> to register</li>
        <li>You must provide true, accurate, and current information</li>
        <li>You are responsible for safeguarding your credentials</li>
        <li>One account per person or entity</li>
      </ul>

      <h2>3. Acceptable Use</h2>
      <p>You agree <strong>not</strong> to generate, upload, or distribute content that:</p>
      <ul>
        <li>Violates applicable laws of Mainland China, Hong Kong, or your jurisdiction</li>
        <li>Is sexual, violent, gory, or self-harm related</li>
        <li>Involves minors inappropriately (<strong>strictly prohibited</strong>)</li>
        <li>Infringes IP, likeness, or privacy rights of others</li>
        <li>Is false, fraudulent, or misleading</li>
        <li>Is hateful, discriminatory, or harassing</li>
        <li>Involves political sensitivity or depictions of state leaders</li>
        <li>Violates any AI model provider's usage policies</li>
      </ul>
      <p>You also agree not to reverse-engineer, scrape, share your account, or use the service outside its intended purpose.</p>

      <h2>4. User Content &amp; Generated Output</h2>
      <ul>
        <li>You retain ownership of your inputs. You grant VidClaw a license to process and store them for service delivery</li>
        <li>You own commercial rights to generated output, subject to the license of each AI model provider (e.g., Sora, VEO)</li>
        <li>You are solely responsible for the legality of uploaded content, including copyright on reference videos</li>
        <li>We reserve the right to remove content that violates these Terms</li>
      </ul>

      <h2>5. Subscription &amp; Billing</h2>
      <ul>
        <li>The service uses a <strong>prepaid credits</strong> model; different AI models consume different credit amounts</li>
        <li>Payments are processed by Stripe (cards and Alipay-via-Stripe)</li>
        <li>Credits are <strong>non-transferable and generally non-refundable</strong> once consumed; see <a href="/refund">Refund Policy</a> for exceptions</li>
        <li>Credits typically expire after <strong>180 days</strong></li>
        <li>Subscription auto-renewal, where applicable, is disclosed at checkout</li>
        <li>Price changes will be notified at least 15 days in advance</li>
      </ul>

      <h2>6. Termination</h2>
      <ul>
        <li>You may close your account anytime from account settings</li>
        <li>We may suspend or terminate accounts that violate these Terms; in serious cases, unused credits will not be refunded</li>
      </ul>

      <h2>7. Disclaimers</h2>
      <ul>
        <li>AI-generated output is probabilistic and may not match expectations; we do not guarantee specific results</li>
        <li>The service may experience downtime or AI provider outages</li>
        <li>Generated content is provided for reference; you are responsible for compliance with commercial, legal, and advertising standards</li>
      </ul>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law: (a) the Service is provided "as is" and "as available"; (b) we are not liable for indirect, incidental, punitive, or consequential damages; (c) our aggregate liability shall not exceed the amount you paid us in the preceding <strong>12 months</strong>.
      </p>

      <h2>9. Intellectual Property</h2>
      <p>
        VidClaw's brand, logo, code, UI, and documentation are protected by copyright and trademark law. Unauthorized reproduction is prohibited.
      </p>

      <h2>10. Governing Law &amp; Dispute Resolution</h2>
      <p>
        These Terms are governed by the laws of the <strong>Hong Kong Special Administrative Region</strong>. Disputes shall be resolved through good-faith negotiation or, failing that, arbitration at the Hong Kong International Arbitration Centre (HKIAC).
      </p>

      <h2>11. Changes</h2>
      <p>We may update these Terms. Material changes will be notified 15 days in advance.</p>

      <h2>12. Contact</h2>
      <p>
        Email: <a href="mailto:support@yeadon.top">support@yeadon.top</a>
      </p>
    </article>
  );
}
