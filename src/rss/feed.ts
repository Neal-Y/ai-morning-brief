import Parser from 'rss-parser';
import {
  RSS_SOURCES,
  WINDOW_HOURS,
  KEYWORD_WEIGHTS,
  NEGATIVE_KEYWORD_WEIGHTS,
  PREFILTER_MIN_SCORE,
} from '../config.js';
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
  tier: 'broad' | 'technical'
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
  const tierBonus = article.sourceTier === 'technical' ? 2 : 0;
  return positive + negative + tierBonus;
}

function prefilter(articles: ArticleSummary[]): ArticleSummary[] {
  return articles.filter((a) => a.score > PREFILTER_MIN_SCORE);
}

export async function getTodaysArticles(): Promise<FeedResult> {
  const { articles, sourceFailures, sourceTotal } = await fetchAllFeeds();
  const recent = filterLast24h(articles);
  const scored = recent.map((a) => ({ ...a, score: scoreArticle(a) }));
  const filtered = prefilter(scored);
  return { articles: filtered, sourceFailures, sourceTotal };
}
