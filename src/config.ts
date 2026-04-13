export type ProviderName = 'openai' | 'anthropic' | 'alternate';
export type SourceTier = 'broad' | 'technical';

export interface RssSource {
  name: string;
  url: string;
  tier: SourceTier;
}

export interface Config {
  ntfyTopic: string;
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
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
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

export const RSS_SOURCES: ReadonlyArray<RssSource> = Object.freeze([
  ...BROAD_SOURCES,
  ...TECHNICAL_SOURCES,
]);

export const WINDOW_HOURS = 24;
export const CLASSIFIER_CAP = 12;      // top-N by keyword score sent to LLM classifier
export const HARD_TECH_MAX = 2;        // max articles from HARD_TECH_AI bucket
export const SIGNALS_MAX = 1;          // max articles from IMPORTANT_AI_SIGNALS bucket
export const BRIEF_MAX = 3;            // hard cap: ntfy Click(1) + buttons(2) = 3 entries
export const PREFILTER_MIN_SCORE = -2; // drop articles below this combined score
export const RETRY_DELAY_MS = 5000;
export const NTFY_BASE_URL = 'https://ntfy.sh';

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
  ai: 2,
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
  const ntfyTopic = process.env['NTFY_TOPIC'];
  if (!ntfyTopic) {
    throw new Error('Missing required env var: NTFY_TOPIC');
  }

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
    ntfyTopic,
    aiProvider,
    openaiApiKey: process.env['OPENAI_API_KEY'],
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
  };
}
