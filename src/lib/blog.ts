export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO date
  lang: "zh" | "en";
  tags: string[];
  readTime: string;
  content: string; // HTML content
}

export const posts: BlogPost[] = [
  {
    slug: "ai-product-video-generation-guide",
    title: "How to Create Product Videos with AI in 3 Minutes",
    description:
      "A complete guide to generating high-quality e-commerce product videos using AI. From pasting a link to getting a finished video — no editing skills needed.",
    date: "2025-07-10",
    lang: "en",
    tags: ["AI Video", "E-Commerce", "Tutorial"],
    readTime: "5 min",
    content: `
<p>Creating compelling product videos used to require a full production team — scriptwriter, videographer, and editor. With AI video generation, you can produce professional-quality product ads in under 3 minutes.</p>

<h2>The Three Modes of AI Video Creation</h2>

<h3>1. URL Remix Mode</h3>
<p>Paste a Douyin or TikTok link. The AI downloads the reference video, analyzes its visual composition, camera movements, and storytelling structure, then generates a brand-new video inspired by the original — but featuring your product.</p>
<p>This is perfect for replicating viral content styles. If a competitor's video went viral, you can create 10 variations in the time it takes to watch the original.</p>

<h3>2. Video Upload Mode</h3>
<p>Upload a local reference video. The AI performs deep visual analysis using Gemini, extracting scene transitions, lighting patterns, and product presentation techniques. It then creates an English prompt for video generation via VEO 3.1 or Sora.</p>

<h3>3. Theme Production Mode</h3>
<p>Describe a theme in plain text — for example, "a cat dancing in the streets of Kuala Lumpur." The AI expands your description into a full cinematic prompt with camera angles, lighting, and mood, then generates the video.</p>

<h2>What You Get</h2>
<p>Each generation produces:</p>
<ul>
<li><strong>A finished video</strong> — 10 or 15 seconds, portrait or landscape</li>
<li><strong>A creative script</strong> — shot-by-shot breakdown with camera directions</li>
<li><strong>Marketing copy</strong> — title, caption, and first comment, ready to paste into any social platform</li>
</ul>

<h2>Powered by the Best AI Models</h2>
<p>VidClaw V2 uses <strong>Gemini 3.1 Pro</strong> for intelligent video analysis and script generation, combined with <strong>VEO 3.1</strong> or <strong>Sora</strong> for photorealistic video synthesis. The result is content that looks professionally produced.</p>

<h2>Getting Started</h2>
<p>Sign up for free at <a href="https://video.yeadon.top/register">video.yeadon.top</a> and try your first generation — no credit card required.</p>
`,
  },
  {
    slug: "ai-duan-shi-pin-sheng-cheng-zhi-nan",
    title: "AI 短视频生成：从链接到成片的完整指南",
    description:
      "详解 AI 短视频自动生成的三种模式，从粘贴抖音链接到拿到成片，3 分钟搞定全流程。",
    date: "2025-07-08",
    lang: "zh",
    tags: ["AI 视频", "教程", "带货"],
    readTime: "4 分钟",
    content: `
<p>传统的产品视频制作需要策划、拍摄、剪辑，一条视频至少花半天。AI 短视频生成改变了这一切 — 从给链接到拿到成片，全程只需要 3 分钟。</p>

<h2>三种创作模式</h2>

<h3>模式一：链接二创</h3>
<p>复制一条抖音/TikTok 分享链接，粘贴到 VidClaw。系统自动下载原视频，用 Gemini AI 分析画面构图、运镜手法、叙事节奏，然后生成一条全新的视频 — 保留爆款结构，换上你的产品。</p>
<p><strong>典型场景：</strong>竞品今天出了爆款，你明天就能出 10 条同风格的内容。</p>

<h3>模式二：视频二创</h3>
<p>上传一段本地参考视频。AI 会深度理解视频内容，提取镜头语言和产品展示技巧，重新创作一条全新视频。你还可以添加修改提示，比如"换成更明亮的色调"。</p>

<h3>模式三：主题生产</h3>
<p>不需要参考视频，直接用一句话描述你的创意 — 比如"阳光下的手冲咖啡特写"。AI 会把这句话扩展成完整的电影级提示词，包括镜头角度、光影、情绪，然后生成视频。</p>

<h2>你能拿到什么</h2>
<ul>
<li><strong>成品视频</strong> — 10 秒或 15 秒，支持竖屏和横屏</li>
<li><strong>创意脚本</strong> — 逐镜头的分镜脚本，含运镜和时长标注</li>
<li><strong>配套文案</strong> — 标题 + 正文 + 首评，可直接复制粘贴到抖音/小红书发布</li>
</ul>

<h2>技术底座</h2>
<p>VidClaw V2 使用 <strong>Gemini 3.1 Pro</strong> 做智能视频分析和脚本生成，配合 <strong>VEO 3.1</strong> 或 <strong>Sora</strong> 做视频合成。两大 AI 引擎协同工作，确保生成质量达到专业水准。</p>

<h2>立即体验</h2>
<p>注册即送体验积分，无需信用卡。访问 <a href="https://video.yeadon.top/register">video.yeadon.top</a> 开始你的第一次 AI 视频创作。</p>
`,
  },
  {
    slug: "veo-31-vs-sora-comparison",
    title: "VEO 3.1 vs Sora: Which AI Video Generator Should You Use?",
    description:
      "A detailed comparison of Google VEO 3.1 and OpenAI Sora for AI video generation. Strengths, weaknesses, and when to choose each model.",
    date: "2025-07-05",
    lang: "en",
    tags: ["VEO 3.1", "Sora", "Comparison"],
    readTime: "6 min",
    content: `
<p>Two leading AI video generation models are now available to creators: Google's VEO 3.1 and OpenAI's Sora. Here's how they compare for product video creation.</p>

<h2>VEO 3.1 — Speed & Consistency</h2>
<p>VEO 3.1 is Google's latest video generation model, available in three tiers:</p>
<ul>
<li><strong>VEO 3.1 Fast</strong> — Optimized for speed. Generates videos in 2-4 minutes with good quality. Best for rapid iteration.</li>
<li><strong>VEO 3.1 Components</strong> — Higher quality with more control over visual elements. 3-6 minutes generation time.</li>
<li><strong>VEO 3.1 Pro 4K</strong> — Top-tier quality at 4K resolution. 5-10 minutes but stunning results.</li>
</ul>
<p><strong>Strengths:</strong> Faster generation, more consistent results, excellent at following detailed prompts, better at product close-ups and lighting.</p>

<h2>Sora — Cinematic Quality</h2>
<p>OpenAI's Sora excels at creating cinematic, story-driven video content.</p>
<p><strong>Strengths:</strong> More creative and artistic output, better at human movement and emotion, stronger narrative flow, excellent at atmosphere and mood.</p>
<p><strong>Weaknesses:</strong> Slower generation (typically 3-8 minutes), less consistent for product-specific shots, occasionally introduces unwanted creative elements.</p>

<h2>Which Should You Choose?</h2>
<table>
<thead><tr><th>Scenario</th><th>Recommended</th></tr></thead>
<tbody>
<tr><td>Quick product demo videos</td><td>VEO 3.1 Fast</td></tr>
<tr><td>High-quality brand advertisements</td><td>VEO 3.1 Pro 4K</td></tr>
<tr><td>Storytelling and lifestyle content</td><td>Sora</td></tr>
<tr><td>Batch production (10+ videos)</td><td>VEO 3.1 Fast</td></tr>
<tr><td>Social media viral content</td><td>Either — test both</td></tr>
</tbody>
</table>

<h2>Use Both with VidClaw</h2>
<p>VidClaw V2 supports all VEO 3.1 variants and Sora. Switch between models with a single dropdown. Try both and compare results to find what works best for your brand.</p>
`,
  },
  {
    slug: "douyin-bao-kuan-er-chuang-gong-lue",
    title: "抖音爆款视频二创攻略：AI 如何帮你批量复制爆款",
    description:
      "用 AI 工具批量二创抖音爆款视频的实战指南。从竞品分析到批量出片，打造你的内容流水线。",
    date: "2025-07-03",
    lang: "zh",
    tags: ["抖音", "二创", "爆款"],
    readTime: "5 分钟",
    content: `
<p>抖音的算法逻辑决定了一个核心事实：<strong>爆款是可以复刻的</strong>。不是完全抄袭，而是拆解爆款的结构和节奏，用你自己的产品和创意重新演绎。</p>

<h2>为什么二创有效？</h2>
<p>抖音的推荐算法偏爱"已被验证的内容结构"。一条视频能爆，说明它的开头钩子、节奏控制和情绪曲线是对的。复用这些元素，新视频的起始流量池就更大。</p>

<h2>AI 二创的工作流</h2>

<h3>第 1 步：锁定目标</h3>
<p>刷到竞品的爆款视频后，复制分享链接。不需要下载视频、不需要去水印 — 直接把链接粘贴到 VidClaw。</p>

<h3>第 2 步：AI 分析</h3>
<p>Gemini 3.1 Pro 会逐帧分析原视频：</p>
<ul>
<li>镜头构图和运镜手法（推拉摇移、特写切换）</li>
<li>产品展示方式（开箱、使用过程、效果对比）</li>
<li>节奏和时长分配</li>
<li>色彩风格和光影氛围</li>
</ul>

<h3>第 3 步：生成新视频</h3>
<p>基于分析结果，AI 生成一条全新视频。保留了爆款的结构，但画面内容完全不同。同时自动生成配套的标题、文案和首评。</p>

<h3>第 4 步：批量出片</h3>
<p>一个链接可以生成多条视频（最多 10 条）。每条视频都有细微差异，适合 A/B 测试或多账号分发。</p>

<h2>实操建议</h2>
<ul>
<li><strong>选品比选视频重要</strong> — 先确定产品，再去找同品类的爆款视频</li>
<li><strong>加修改提示</strong> — 用 --prompt 参数添加"更明亮的色调"之类的调整，让每条视频有差异化</li>
<li><strong>竖屏优先</strong> — 抖音的算法对竖屏内容更友好</li>
<li><strong>文案二次加工</strong> — AI 生成的文案是起点，根据你的账号调性做微调</li>
</ul>

<h2>开始你的第一次二创</h2>
<p>访问 <a href="https://video.yeadon.top/register">video.yeadon.top</a>，注册后粘贴你看到的第一条爆款链接，体验 AI 二创的效率。</p>
`,
  },
  {
    slug: "ai-video-ecommerce-revolution",
    title: "10 Ways AI Video Generators Are Transforming E-Commerce in 2025",
    description:
      "How AI-generated product videos are reshaping online retail. From faster content creation to personalized ads at scale.",
    date: "2025-07-01",
    lang: "en",
    tags: ["E-Commerce", "AI Video", "Trends"],
    readTime: "7 min",
    content: `
<p>AI video generation is no longer a novelty — it's becoming a core tool for e-commerce businesses worldwide. Here are 10 ways it's changing the game in 2025.</p>

<h2>1. 90% Faster Content Production</h2>
<p>What used to take a production team 2-3 days now takes 3 minutes. AI analyzes reference content, generates scripts, and produces finished videos at machine speed.</p>

<h2>2. Batch Production at Scale</h2>
<p>Generate 10 variations of a product video in one session. Test different styles, angles, and narratives to find what converts best — without reshooting.</p>

<h2>3. Multilingual Content Without Translation</h2>
<p>AI generates visual content that transcends language barriers. The same product demonstration works across markets — just swap the text overlay and captions.</p>

<h2>4. Competitive Intelligence to Content</h2>
<p>See a competitor's viral video? Within minutes, you can create content inspired by the same structure but featuring your own products. The AI understands visual storytelling, not just pixels.</p>

<h2>5. No Photography Skills Needed</h2>
<p>Small sellers and dropshippers who can't afford professional video production now have access to studio-quality content generation.</p>

<h2>6. A/B Testing at Zero Marginal Cost</h2>
<p>Create multiple versions of the same ad with different moods, lighting, and product angles. Test them all and let the data decide which performs best.</p>

<h2>7. Seasonal Content on Demand</h2>
<p>Need holiday-themed product videos? Valentine's Day? Black Friday? Describe the mood and generate seasonal content instantly, without planning months in advance.</p>

<h2>8. User-Generated Content Style</h2>
<p>AI can generate videos that mimic the authentic, organic feel of UGC — which consistently outperforms polished ads on platforms like TikTok and Instagram Reels.</p>

<h2>9. Cross-Platform Optimization</h2>
<p>Generate the same content in portrait (9:16) for TikTok/Douyin and landscape (16:9) for YouTube — from the same prompt, at the same time.</p>

<h2>10. Complete Content Packages</h2>
<p>Modern AI tools don't just generate video — they produce the entire content package: video, title, caption, hashtags, and first comment. Ready to post with zero editing.</p>

<h2>The Bottom Line</h2>
<p>AI video generation is democratizing e-commerce content creation. Whether you're a solo seller or a large brand, the tools to create compelling product videos are now accessible to everyone.</p>

<p>Try it yourself at <a href="https://video.yeadon.top/register">VidClaw V2</a> — free to start, no credit card required.</p>
`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return posts.map((p) => p.slug);
}
