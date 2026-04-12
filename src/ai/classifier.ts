import type { AIProvider, ArticleSummary, ArticleClassification, Category, Bucket, Recommendation, RenderLevel } from './provider.js';
import { extractJson } from './provider.js';
import { withRetry } from './retry.js';
import { RETRY_DELAY_MS } from '../config.js';

const CLASSIFIER_SYSTEM = `You are a strict AI news classifier for an engineering-focused daily brief.

Your job is NOT to summarize news in a flattering way.
Your job is to filter and classify AI-related articles for backend engineers, infra/platform engineers, distributed systems engineers, and AI application builders.

Be conservative.
Do not overstate technical value.
Do not treat every advanced-sounding article as engineering-relevant.
Do not reward vague "industry trend" content.

## Core rule

"Hard Tech AI" means articles directly relevant to AI systems, models, inference, deployment, APIs, evaluation, tooling, or platform engineering.

It does NOT mean:
- every hard science article
- every hardware/materials research article
- every company announcement
- every AI-related event
- every social or market article

## Classification taxonomy

Choose exactly one:

- model-release: New model, capability upgrade, benchmark, reasoning/tool use/multimodal changes
- api-platform: API change, SDK change, structured output, tool use, pricing/rate-limit/quota/platform behavior changes
- infra-inference: Inference stack, serving, deployment, GPU infra, latency, throughput, distributed inference, scheduling, cost/performance tradeoffs
- tooling-open-source: Open-source AI tooling, agent framework, eval tooling, observability, gateway/orchestration, developer-facing framework
- benchmark-eval: Evaluation methodology, benchmarks, capability comparisons, evals frameworks — not just a model's benchmark number, but the eval itself is the topic
- agent-systems: Autonomous agent architectures, multi-agent orchestration, tool-use patterns, agent planning/memory/reflection systems
- policy-regulation: Regulation, chip export control, legal/policy shifts, geopolitics that materially affect AI supply chain or deployment
- company-market: Funding, acquisition, org change, partnership, strategy shift, company move
- social-opinion: Surveys, public sentiment, user behavior, media commentary, cultural/social reactions
- event-promo: Conference, summit, startup event, launch event, promo article, registration/announcement
- research-adjacent: Hard science / hardware / materials / academic research that may be interesting, but is NOT directly tied to AI systems or engineering workflows

## Bucket rules

Choose exactly one:

- HARD_TECH_AI: Only if the article has direct engineering relevance to AI systems, APIs, inference, eval, deployment, tooling, platform architecture, or production workflows.
- IMPORTANT_AI_SIGNALS: Important world/industry/policy/company signals worth knowing, but not direct hard-tech engineering updates.
- DROP: Low-value noise, event/promo, weak social commentary, vague market fluff, or weak engineering relevance.

## RenderLevel rules

Choose exactly one:

- FULL: Article has direct and concrete engineering value. Should be displayed with full summary, engineering impact, and recommendation. Assign to READ_NOW articles and strong SKIM articles with specific engineering consequences.
- LIGHT: Article has moderate signal value — worth one-line awareness, but not full treatment. Assign to SKIM articles with limited engineering consequence, or notable SIGNALS items.
- OMIT: No display value. Goes to skippedToday at most. Assign to SKIP articles, event/promo, social-opinion, weak company news.

## Recommendation rules

Choose exactly one:

- READ_NOW: Direct technical/architectural relevance; useful for engineers today
- SKIM: Worth knowing, but indirect, strategic, policy, market, or not deeply technical
- SKIP: Low engineering value; not worth occupying main brief space

## Strict judgment rules

1. Do NOT label something HARD_TECH_AI just because it is advanced, scientific, or "breakthrough".
2. Materials research, memory research, semiconductor research should usually be research-adjacent + IMPORTANT_AI_SIGNALS or DROP unless explicitly tied to AI compute/inference/deployment.
3. Company news should usually be company-market + SKIM or SKIP unless there is direct API/platform/product impact.
4. Event articles should usually be event-promo + DROP.
5. Social sentiment articles should usually be social-opinion + SKIP.
6. If engineering value is weak, say so clearly.
7. Avoid vague statements like 值得關注, 有潛在影響, 對業界有啟發, 有助於了解趨勢 unless you explain exactly why.

## Important: IMPORTANT_AI_SIGNALS is NOT a catch-all

"Important AI Signals" does not mean any non-technical AI article.
It should be reserved ONLY for high-significance events:
- Major policy or regulatory shift that directly affects AI deployment or supply chain
- Geopolitical event (chip export control, trade ban) with concrete AI infrastructure impact
- Ecosystem or supply-chain disruption affecting AI development tooling or compute access
- Company or platform change that materially affects how engineers build or deploy AI systems

Weak company news, social commentary, culture pieces, and general business news should usually be DROP.
If you are unsure whether something qualifies as IMPORTANT_AI_SIGNALS, default to DROP.

## Scoring guidance

- model-release: 80-100
- api-platform: 75-95
- infra-inference: 80-100
- tooling-open-source: 70-90
- benchmark-eval: 65-85
- agent-systems: 65-85
- policy-regulation: 50-80
- company-market: 25-65
- social-opinion: 10-40
- event-promo: 0-20
- research-adjacent: 20-60

HARD_TECH_AI usually requires score >= 75.
IMPORTANT_AI_SIGNALS usually requires score 45-80.
DROP usually means score < 45.
But bucket must follow meaning, not score alone.

## RenderLevel + Bucket alignment

- HARD_TECH_AI + READ_NOW → renderLevel: FULL
- HARD_TECH_AI + SKIM → renderLevel: FULL if there is a specific engineering consequence; otherwise LIGHT
- IMPORTANT_AI_SIGNALS + SKIM → renderLevel: LIGHT (unless major supply-chain/platform shift → FULL)
- IMPORTANT_AI_SIGNALS + SKIP → renderLevel: OMIT
- DROP → renderLevel: OMIT

## Output constraints

- Output in Traditional Chinese
- Compact, concrete, implementation-oriented
- No fluff
- JSON only, no markdown code fence
- summary <= 25 Chinese characters
- engineeringImpact must be specific; if weak, explicitly say "工程直接價值低"

Return ONLY valid JSON (no markdown fence):
{
  "category": "...",
  "bucket": "HARD_TECH_AI | IMPORTANT_AI_SIGNALS | DROP",
  "renderLevel": "FULL | LIGHT | OMIT",
  "recommendation": "READ_NOW | SKIM | SKIP",
  "summary": "一句話摘要，25字內",
  "engineeringImpact": "一句具體工程影響；若弱就直說工程直接價值低",
  "reason": "一句話說明為何這樣分類與推薦",
  "score": 0
}`;

function buildClassifierUserPrompt(article: ArticleSummary): string {
  return `TITLE:
${article.title}

SOURCE:
${article.source}

PUBLISHED_AT:
${article.pubDate}

URL:
${article.link}

CONTENT:
${article.contentSnippet.slice(0, 600)}

Forbidden style — do not produce:
- 值得關注
- 有潛在影響
- 對業界有啟發
- 有助於了解趨勢
- 對未來發展有幫助
Unless followed by a specific engineering consequence.`;
}

const VALID_CATEGORIES = new Set<string>([
  'model-release', 'api-platform', 'infra-inference', 'tooling-open-source',
  'benchmark-eval', 'agent-systems',
  'policy-regulation', 'company-market', 'social-opinion', 'event-promo', 'research-adjacent',
]);
const VALID_BUCKETS = new Set<string>(['HARD_TECH_AI', 'IMPORTANT_AI_SIGNALS', 'DROP']);
const VALID_RENDER_LEVELS = new Set<string>(['FULL', 'LIGHT', 'OMIT']);
const VALID_RECOMMENDATIONS = new Set<string>(['READ_NOW', 'SKIM', 'SKIP']);

function parseClassification(raw: string): ArticleClassification {
  const cleaned = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Classifier returned invalid JSON: ${cleaned.slice(0, 150)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const category = String(obj['category'] ?? '');
  const bucket = String(obj['bucket'] ?? '');
  const renderLevel = String(obj['renderLevel'] ?? '');
  const recommendation = String(obj['recommendation'] ?? '');

  // Derive renderLevel from recommendation if LLM omits it
  let resolvedRenderLevel: RenderLevel;
  if (VALID_RENDER_LEVELS.has(renderLevel)) {
    resolvedRenderLevel = renderLevel as RenderLevel;
  } else {
    const rec = recommendation as string;
    resolvedRenderLevel = rec === 'READ_NOW' ? 'FULL' : rec === 'SKIM' ? 'LIGHT' : 'OMIT';
  }

  return {
    category: (VALID_CATEGORIES.has(category) ? category : 'company-market') as Category,
    bucket: (VALID_BUCKETS.has(bucket) ? bucket : 'IMPORTANT_AI_SIGNALS') as Bucket,
    renderLevel: resolvedRenderLevel,
    recommendation: (VALID_RECOMMENDATIONS.has(recommendation) ? recommendation : 'SKIM') as Recommendation,
    summary: String(obj['summary'] ?? '').slice(0, 60),
    engineeringImpact: String(obj['engineeringImpact'] ?? '工程直接價值低'),
    reason: String(obj['reason'] ?? ''),
    score: typeof obj['score'] === 'number' ? obj['score'] : 50,
  };
}

async function classifyOne(
  provider: AIProvider,
  article: ArticleSummary
): Promise<ArticleClassification> {
  return withRetry(
    async () => {
      const raw = await provider.call(CLASSIFIER_SYSTEM, buildClassifierUserPrompt(article));
      return parseClassification(raw);
    },
    { retries: 1, delayMs: RETRY_DELAY_MS, label: `classify:${article.title.slice(0, 40)}` }
  );
}

const FALLBACK_CLASSIFICATION: ArticleClassification = {
  category: 'company-market',
  bucket: 'IMPORTANT_AI_SIGNALS',
  renderLevel: 'LIGHT',
  recommendation: 'SKIM',
  summary: '分類失敗，已設為預設',
  engineeringImpact: '工程直接價值低',
  reason: 'Classifier failed',
  score: 40,
};

/** Run at most `limit` concurrent promises at a time. */
async function withConcurrency<T>(
  items: ArticleSummary[],
  limit: number,
  fn: (item: ArticleSummary) => Promise<T>
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]!) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Anthropic free tier allows ~5 concurrent connections; OpenAI is more generous.
// Keep at 5 to stay safe across both providers.
const CLASSIFIER_CONCURRENCY = 5;

export async function classifyArticles(
  provider: AIProvider,
  articles: ArticleSummary[]
): Promise<ArticleClassification[]> {
  if (articles.length === 0) return [];

  const results = await withConcurrency(
    articles,
    CLASSIFIER_CONCURRENCY,
    (a) => classifyOne(provider, a)
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[classifier] Failed for "${articles[i]?.title.slice(0, 40)}": ${r.reason}`);
    return FALLBACK_CLASSIFICATION;
  });
}
