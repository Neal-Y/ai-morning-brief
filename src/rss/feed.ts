import Parser from 'rss-parser';
import {
  RSS_SOURCES,
  WINDOW_HOURS,
  KEYWORD_WEIGHTS,
  NEGATIVE_KEYWORD_WEIGHTS,
  PREFILTER_MIN_SCORE,
  DUPLICATE_TITLE_OVERLAP,
  DUPLICATE_TITLE_MIN_SHARED,
} from '../config.js';
import type { SourceTier } from '../config.js';
import type { ArticleSummary } from '../ai/provider.js';

interface RawItem {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  isoDate?: string;
}

// Use a browser-like User-Agent to avoid 406/403 from protective sites.
// Some hosts (e.g. InfoQ) also block datacenter IPs regardless of UA,
// so we prefer sources that serve RSS reliably from CI environments.
const USER_AGENT =
  'Mozilla/5.0 (compatible; AI-Morning-Brief/1.0; +https://github.com/neaL367/ai-morning-brief)';

const parser = new Parser<Record<string, unknown>, RawItem>({
  requestOptions: { headers: { 'User-Agent': USER_AGENT } },
});

export interface FeedResult {
  articles: ArticleSummary[];
  sourceFailures: number;
  sourceTotal: number;
}

function isValidArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function fetchAllFeeds(): Promise<FeedResult> {
  const sourceTotal = RSS_SOURCES.length;
  const results = await Promise.allSettled(
    RSS_SOURCES.map((source) => fetchFeed(source.name, source.url, source.tier))
  );

  let sourceFailures = 0;
  const allArticles: ArticleSummary[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = RSS_SOURCES[i];
    if (result === undefined || source === undefined) continue;

    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    } else {
      sourceFailures++;
      console.warn(`[rss] Failed to fetch ${source.name}: ${result.reason}`);
    }
  }

  return { articles: allArticles, sourceFailures, sourceTotal };
}

async function fetchFeed(
  sourceName: string,
  url: string,
  tier: SourceTier
): Promise<ArticleSummary[]> {
  const feed = await parser.parseURL(url);
  return (feed.items ?? [])
    .filter((item): item is RawItem & { title: string; link: string } =>
      Boolean(item.title && item.link && isValidArticleUrl(item.link ?? ''))
    )
    .map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate ?? item.isoDate ?? '',
      contentSnippet: item.contentSnippet ?? '',
      source: sourceName,
      sourceTier: tier,
      score: 0,
    }));
}

function filterLast24h(articles: ArticleSummary[], now: Date = new Date()): ArticleSummary[] {
  const cutoff = now.getTime() - WINDOW_HOURS * 60 * 60 * 1000;
  return articles.filter((article) => {
    if (!article.pubDate) return false;
    const d = new Date(article.pubDate);
    if (isNaN(d.getTime())) return false;
    return d.getTime() >= cutoff;
  });
}

function scoreKeywords(text: string, weights: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const [keyword, weight] of Object.entries(weights)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = text.match(pattern);
    if (matches) total += weight * matches.length;
  }
  return total;
}

function scoreArticle(article: ArticleSummary): number {
  const text = `${article.title} ${article.contentSnippet}`.toLowerCase();
  const positive = scoreKeywords(text, KEYWORD_WEIGHTS);
  const negative = scoreKeywords(text, NEGATIVE_KEYWORD_WEIGHTS);
  const tierBonus = article.sourceTier === 'primary' ? 4 : article.sourceTier === 'technical' ? 2 : 0;
  return positive + negative + tierBonus;
}

function prefilter(articles: ArticleSummary[]): ArticleSummary[] {
  return articles.filter((a) => a.score > PREFILTER_MIN_SCORE);
}

// ── Cross-source dedupe ──────────────────────────────────────────────────────
// The same story often arrives from several feeds (vendor post + TechCrunch +
// HN). Without this, two of the three brief slots can be the same news.

const TIER_RANK: Record<SourceTier, number> = { primary: 3, technical: 2, broad: 1 };

/** Lowercased host+path without query/hash/trailing slash — tracking params differ per feed. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'its', 'is', 'are', 'new', 'how', 'why', 'what', 'from', 'by', 'at', 'as']);

/** Latin words (minus stopwords) + CJK character bigrams. */
export function titleTokens(title: string): Set<string> {
  const lower = title.toLowerCase();
  const tokens = new Set<string>();
  for (const w of lower.match(/[a-z0-9][a-z0-9.+-]*/g) ?? []) {
    if (!STOPWORDS.has(w)) tokens.add(w);
  }
  const cjk = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  for (let i = 0; i + 1 < cjk.length; i++) tokens.add(cjk[i]! + cjk[i + 1]!);
  return tokens;
}

function sameStory(a: Set<string>, b: Set<string>): boolean {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const shorter = Math.min(a.size, b.size);
  return shared >= DUPLICATE_TITLE_MIN_SHARED && shorter > 0 && shared / shorter >= DUPLICATE_TITLE_OVERLAP;
}

/**
 * Keep one article per story. Preference: higher source tier, then higher
 * keyword score — so a vendor's own post beats the TechCrunch rewrite.
 * O(n²) over one day's items (tens to low hundreds) — fine.
 */
export function dedupeStories(articles: ArticleSummary[]): ArticleSummary[] {
  const ranked = [...articles].sort(
    (a, b) => TIER_RANK[b.sourceTier] - TIER_RANK[a.sourceTier] || b.score - a.score,
  );
  const kept: Array<{ article: ArticleSummary; url: string; tokens: Set<string> }> = [];
  for (const article of ranked) {
    const url = canonicalUrl(article.link);
    const tokens = titleTokens(article.title);
    const dup = kept.some(
      (k) => k.url === url || sameStory(k.tokens, tokens),
    );
    if (!dup) kept.push({ article, url, tokens });
  }
  return kept.map((k) => k.article);
}

/**
 * Pick what the LLM classifier sees, bounded by `cap`.
 * Every source first gets its top `perSource` by keyword score; remaining
 * slots go to the best-scoring leftovers. Keyword score alone let generic
 * words ("ai", "model") decide, and cut sources whose feeds carry little
 * text (HN titles, short blog titles) before the LLM ever saw them.
 */
export function pickForClassifier(
  articles: ArticleSummary[],
  cap: number,
  perSource: number,
): ArticleSummary[] {
  const byScore = (a: ArticleSummary, b: ArticleSummary) => b.score - a.score;
  const bySource = new Map<string, ArticleSummary[]>();
  for (const a of articles) {
    const list = bySource.get(a.source) ?? [];
    list.push(a);
    bySource.set(a.source, list);
  }
  const picked = new Set<ArticleSummary>();
  for (const list of bySource.values()) {
    for (const a of list.sort(byScore).slice(0, perSource)) picked.add(a);
  }
  for (const a of [...articles].sort(byScore)) {
    if (picked.size >= cap) break;
    picked.add(a);
  }
  // If quotas alone exceed the cap, keep the best-scoring ones.
  return [...picked].sort(byScore).slice(0, cap);
}

export async function getTodaysArticles(): Promise<FeedResult> {
  const { articles, sourceFailures, sourceTotal } = await fetchAllFeeds();
  const recent = filterLast24h(articles);
  const scored = recent.map((a) => ({ ...a, score: scoreArticle(a) }));
  const filtered = dedupeStories(prefilter(scored));
  if (filtered.length < scored.length) {
    console.log(`[rss] ${scored.length} recent → ${filtered.length} after prefilter + cross-source dedupe`);
  }
  return { articles: filtered, sourceFailures, sourceTotal };
}
