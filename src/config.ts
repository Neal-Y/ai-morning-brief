export type ProviderName = 'openai' | 'anthropic' | 'alternate';
// primary   = first-party vendor/engineering blogs (the announcement itself)
// technical = engineering-grade secondary coverage
// broad     = general AI media (business/consumer heavy, lowest prior)
export type SourceTier = 'broad' | 'technical' | 'primary';

export interface RssSource {
  name: string;
  url: string;
  tier: SourceTier;
}

export interface Config {
  aiProvider: ProviderName;
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
}

// Broad AI media — world signals, industry news
const BROAD_SOURCES: ReadonlyArray<RssSource> = [
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    tier: 'broad',
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    tier: 'broad',
  },
];

// Technical sources — engineering-grade hard-tech news
// Criteria: serves RSS from datacenter IPs without blocking; high signal-to-noise for AI/infra engineers
const TECHNICAL_SOURCES: ReadonlyArray<RssSource> = [
  {
    // High-quality AI engineering posts: models, APIs, tooling, research — very reliable RSS
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    tier: 'technical',
  },
  {
    // Infra/cloud/platform engineering news — Kubernetes, distributed systems, AI ops
    name: 'The New Stack',
    url: 'https://thenewstack.io/feed/',
    tier: 'technical',
  },
  {
    // Community-curated technical links — high bar, strong AI/systems coverage
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage?points=100',
    tier: 'technical',
  },
  {
    // Simon Willison's blog — AI analysis and tooling, highly reliable, excellent signal
    name: 'Simon Willison',
    url: 'https://simonwillison.net/atom/everything/',
    tier: 'technical',
  },
];

// First-party sources (added 2026-09-30) — the announcement itself instead of
// a reposted summary. They post rarely (0–2/day), so they rely on the
// per-source classifier quota below to always reach the LLM.
// NOT verified from the dev container (egress blocked) — verify with a
// DRY_RUN workflow run (see docs/DEPLOY.md). A dead feed only logs a warning.
// Anthropic has no official RSS feed, so it is not listed.
const PRIMARY_SOURCES: ReadonlyArray<RssSource> = [
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', tier: 'primary' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', tier: 'primary' },
  { name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', tier: 'primary' },
  { name: 'AWS Machine Learning', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', tier: 'primary' },
];

// The Verge AI was removed 2026-09-30: consumer/product coverage that the
// classifier DROPped almost every day while taking classifier slots.
export const RSS_SOURCES: ReadonlyArray<RssSource> = Object.freeze([
  ...BROAD_SOURCES,
  ...TECHNICAL_SOURCES,
  ...PRIMARY_SOURCES,
]);

export const WINDOW_HOURS = 24;
// Both OpenAI and Anthropic free-tier TPM limit is ~30k tokens/min.
// Concurrency 5 hits the limit consistently — 3 stays safely under.
export const CLASSIFIER_CONCURRENCY = 3;
export const CLASSIFIER_CAP = 24;      // max articles sent to the LLM classifier (cost bound)
// Every source gets its top-N (by keyword score) into the classifier before the
// rest compete globally, so low-keyword sources (HN titles, Simon Willison,
// vendor blogs) aren't cut before the LLM ever sees them.
export const PER_SOURCE_CLASSIFIER_MIN = 2;
// Two titles are the same story when they share ≥3 tokens and the shared
// tokens cover ≥70% of the shorter title (overlap coefficient). Jaccard was
// too strict: rewrites add words ("OpenAI launches X" vs "Introducing X").
export const DUPLICATE_TITLE_OVERLAP = 0.7;
export const DUPLICATE_TITLE_MIN_SHARED = 3;
export const HARD_TECH_MAX = 2;        // max articles from HARD_TECH_AI bucket
export const SIGNALS_MAX = 1;          // max articles from IMPORTANT_AI_SIGNALS bucket
export const BRIEF_MAX = 3;            // hard cap: number of articles per brief
export const PREFILTER_MIN_SCORE = -2; // drop articles below this combined score
export const RETRY_DELAY_MS = 5000;

// Positive keyword weights — technical relevance signals
export const KEYWORD_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  llm: 4,
  gpu: 4,
  inference: 4,
  distributed: 3,
  infrastructure: 3,
  kubernetes: 3,
  golang: 3,
  'open source': 3,
  database: 3,
  benchmark: 3,
  latency: 3,
  throughput: 3,
  ai: 1,                 // appears in nearly every item — near-zero signal
  'machine learning': 2,
  'deep learning': 2,
  transformer: 2,
  microservice: 2,
  cloud: 2,
  protocol: 2,
  architecture: 2,
  performance: 2,
  model: 1,
  api: 1,
  release: 1,
});

// Negative keyword weights — aggressive downgrade for low-value content
export const NEGATIVE_KEYWORD_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  event: -3,
  conference: -3,
  summit: -3,
  'gen z': -4,
  'gen-z': -4,
  consumer: -3,
  survey: -4,
  lifestyle: -4,
  opinion: -3,
  startup: -2,
  founder: -2,
  funding: -2,
  investment: -2,
  acquisition: -2,
  'series a': -3,
  'series b': -3,
  ipo: -3,
  hiring: -2,
  layoff: -1,
  'love-hate': -4,
  relationship: -2,
  'heading to': -3,
  'travel to': -3,
  partnership: -2,
  marketing: -3,
});

export const MODEL_IDS: Readonly<Record<string, string>> = Object.freeze({
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
});

export function loadConfig(): Config {
  const aiProvider = process.env['AI_PROVIDER'] as ProviderName | undefined;
  const validProviders = ['openai', 'anthropic', 'alternate'];
  if (!aiProvider || !validProviders.includes(aiProvider)) {
    const safeVal = aiProvider ? `"${String(aiProvider).slice(0, 20)}"` : '(empty)';
    throw new Error(`Invalid AI_PROVIDER ${safeVal}. Must be one of: ${validProviders.join(', ')}`);
  }

  if (aiProvider === 'alternate') {
    if (!process.env['OPENAI_API_KEY']) throw new Error('AI_PROVIDER=alternate requires OPENAI_API_KEY');
    if (!process.env['ANTHROPIC_API_KEY']) throw new Error('AI_PROVIDER=alternate requires ANTHROPIC_API_KEY');
  } else {
    const keyMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
    };
    const requiredKey = keyMap[aiProvider]!;
    if (!process.env[requiredKey]) {
      throw new Error(`Missing required env var for provider "${aiProvider}": ${requiredKey}`);
    }
  }

  return {
    aiProvider,
    openaiApiKey: process.env['OPENAI_API_KEY'],
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
  };
}
