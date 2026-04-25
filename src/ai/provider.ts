// ── Types ─────────────────────────────────────────────────────────────────────

export type Bucket = 'HARD_TECH_AI' | 'IMPORTANT_AI_SIGNALS' | 'DROP';
export type RenderLevel = 'FULL' | 'LIGHT' | 'OMIT';
export type Recommendation = 'READ_NOW' | 'SKIM' | 'SKIP';
export type Category =
  | 'model-release'
  | 'api-platform'
  | 'infra-inference'
  | 'tooling-open-source'
  | 'benchmark-eval'
  | 'agent-systems'
  | 'policy-regulation'
  | 'company-market'
  | 'social-opinion'
  | 'event-promo'
  | 'research-adjacent';

// ── Raw RSS article ────────────────────────────────────────────────────────────

export interface ArticleSummary {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source: string;
  sourceTier: 'broad' | 'technical';
  score: number;
}

// ── Classifier output ─────────────────────────────────────────────────────────

export interface ArticleClassification {
  category: Category;
  bucket: Bucket;
  renderLevel: RenderLevel;
  recommendation: Recommendation;
  score: number;
  summary: string;
  engineeringImpact: string;
  reason: string;
}

export interface ClassifiedArticle extends ArticleSummary {
  classification: ArticleClassification;
}

// ── Brief generator output ────────────────────────────────────────────────────

export interface BriefItem {
  index: number;
  renderLevel: RenderLevel;
  title: string;
  summary: string;             // FULL: 發生了什麼
  context: string;             // FULL: 背景 / 變了什麼
  engineeringImpact: string;   // FULL: 工程影響
  recommendation: Recommendation;
  reason: string;              // FULL: 建議 / 為何值得看
  shortJudgment: string | null; // LIGHT only
  categoryTag: string;
  url: string;
}

export interface BriefSection {
  name: string;
  items: BriefItem[];
}

export interface BriefResult {
  title: string;
  sections: BriefSection[];
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface AIProvider {
  name: string; // "GPT" or "Claude"
  /**
   * Run an LLM call with a system prompt and a user prompt.
   *
   * `system` may be either:
   *  - `string` — entire system prompt treated as one cacheable block.
   *  - `string[]` — first element is cached (stable prefix), remaining elements
   *    are concatenated without cache_control (variable suffix). Use this when
   *    part of the system prompt changes per-run (e.g. user preference context)
   *    while the bulk stays stable — it lets Anthropic keep the prefix cached
   *    across days even when the suffix varies.
   */
  call(system: string | string[], userPrompt: string): Promise<string>;
  /** Print cumulative token + cache stats for all calls made on this instance. */
  logUsageSummary(): void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) s = fence[1].trim();
  if (!s.startsWith('{') && !s.startsWith('[')) {
    const obj = s.match(/[{[][^]*[}\]]/);
    if (obj) s = obj[0];
  }
  return s;
}
