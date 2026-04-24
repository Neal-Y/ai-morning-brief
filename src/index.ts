import 'dotenv/config'
import { loadConfig, CLASSIFIER_CAP, HARD_TECH_MAX, SIGNALS_MAX, BRIEF_MAX } from './config.js';
import { getTodaysArticles } from './rss/feed.js';
import { OpenAIProvider } from './ai/openai.js';
import { AnthropicProvider } from './ai/anthropic.js';
import type { AIProvider, ClassifiedArticle } from './ai/provider.js';
import { classifyArticles, buildPreferenceContext } from './ai/classifier.js';
import { generateBrief, buildDegradedBrief } from './ai/brief.js';
import { formatBriefText, sendNtfy, sendErrorNotice, sendEmptyNotice } from './notify/ntfy.js';
import { sendWebPush } from './notify/web-push.js';
import { writeArticlesToDB } from './notify/db-writer.js';
import { getRecentFeedback } from './db/client.js';
import { getTaipeiDateString } from './date.js';

/** Day-of-year (1-based) in Taipei timezone. */
function getTaipeiDayOfYear(): number {
  const now = new Date();
  const taipeiDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = taipeiDateStr.split('-').map(Number) as [number, number, number];
  const start = new Date(year, 0, 0);
  const current = new Date(year, month - 1, day);
  const diff = current.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function selectProvider(config: ReturnType<typeof loadConfig>): AIProvider {
  // Single-provider mode
  if (config.aiProvider === 'openai') return new OpenAIProvider(config.openaiApiKey!);
  if (config.aiProvider === 'anthropic') return new AnthropicProvider(config.anthropicApiKey!);

  // Alternation mode: even day-of-year → GPT (OpenAI), odd → Claude (Anthropic)
  const dayOfYear = getTaipeiDayOfYear();
  const useGPT = dayOfYear % 2 === 0;
  console.log(`[main] Alternation mode — day ${dayOfYear} → ${useGPT ? 'GPT' : 'Claude'}`);

  if (useGPT) {
    if (!config.openaiApiKey) throw new Error('AI_PROVIDER=alternate requires OPENAI_API_KEY');
    return new OpenAIProvider(config.openaiApiKey);
  } else {
    if (!config.anthropicApiKey) throw new Error('AI_PROVIDER=alternate requires ANTHROPIC_API_KEY');
    return new AnthropicProvider(config.anthropicApiKey);
  }
}

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[config] Failed to load:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const date = getTaipeiDateString();
  console.log(`[main] AI Morning Brief — ${date}`);

  // ── Stage 1: Fetch + keyword score + prefilter ────────────────────────────
  let feedResult: Awaited<ReturnType<typeof getTodaysArticles>>;
  try {
    feedResult = await getTodaysArticles();
  } catch (err) {
    console.error('[rss] Feed fetch error:', err);
    try {
      await sendErrorNotice(config.ntfyTopic, `RSS 抓取失敗：${err instanceof Error ? err.message : String(err)}`);
    } catch (ntfyErr) {
      console.error('[ntfy] Failed to send error notice:', ntfyErr);
      process.exit(1);
    }
    process.exit(0);
  }

  const { articles: prefiltered, sourceFailures, sourceTotal } = feedResult;
  console.log(`[rss] ${prefiltered.length} articles after prefilter (${sourceFailures}/${sourceTotal} sources failed)`);

  if (sourceFailures === sourceTotal) {
    console.warn('[rss] All sources failed');
    try {
      await sendErrorNotice(config.ntfyTopic, '所有 RSS 來源均無法存取。');
    } catch (ntfyErr) {
      console.error('[ntfy]', ntfyErr);
      process.exit(1);
    }
    process.exit(0);
  }

  if (prefiltered.length === 0) {
    console.log('[main] No articles in last 24h');
    try {
      await sendEmptyNotice(config.ntfyTopic, date);
    } catch (ntfyErr) {
      console.error('[ntfy]', ntfyErr);
      process.exit(1);
    }
    process.exit(0);
  }

  let provider: AIProvider;
  try {
    provider = selectProvider(config);
  } catch (err) {
    console.error('[config] Provider selection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log(`[main] Provider: ${provider.name}`);

  // ── Stage 2: Per-article LLM classifier (parallel) ───────────────────────
  // Sort by keyword score desc and cap before sending to LLM — saves ~50% classifier tokens.
  const toClassify = [...prefiltered]
    .sort((a, b) => b.score - a.score)
    .slice(0, CLASSIFIER_CAP);
  console.log(`[main] Sending top ${toClassify.length}/${prefiltered.length} articles to classifier`);

  // Load recent feedback for preference context. Empty string if below threshold
  // or if DB is unreachable — pipeline must never fail because of this.
  let preferenceContext = '';
  try {
    const feedbackRows = await getRecentFeedback();
    if (feedbackRows.length > 0) {
      preferenceContext = buildPreferenceContext(feedbackRows);
      const up = feedbackRows.filter((r) => r.signal === 'up').length;
      const down = feedbackRows.filter((r) => r.signal === 'down').length;
      console.log(`[main] Injecting ${feedbackRows.length} feedback signals into classifier (${up} up / ${down} down)`);
    } else {
      console.log('[main] Skipping preference injection (below threshold or no feedback)');
    }
  } catch (err) {
    console.warn('[main] Failed to load feedback, continuing without preference:', err instanceof Error ? err.message : err);
  }

  const classifications = await classifyArticles(provider, toClassify, preferenceContext);

  const allClassified: ClassifiedArticle[] = toClassify.map((article, i) => ({
    ...article,
    classification: classifications[i] ?? {
      category: 'company-market' as const,
      bucket: 'DROP' as const,
      renderLevel: 'OMIT' as const,
      recommendation: 'SKIP' as const,
      summary: '',
      engineeringImpact: '工程直接價值低',
      reason: 'No classification',
      score: 0,
    },
  }));

  const nonDrop = allClassified.filter(
    (a) => a.classification.bucket !== 'DROP' && a.classification.renderLevel !== 'OMIT'
  );
  const bucketSummary = `${nonDrop.filter((a) => a.classification.bucket === 'HARD_TECH_AI').length} HARD_TECH + ${nonDrop.filter((a) => a.classification.bucket === 'IMPORTANT_AI_SIGNALS').length} SIGNALS`;
  console.log(`[classifier] Kept ${nonDrop.length}/${toClassify.length} articles — ${bucketSummary}`);

  // ── Stage 3: Rank within each bucket, compose selection ──────────────────
  const byScore = (a: ClassifiedArticle, b: ClassifiedArticle) =>
    b.classification.score - a.classification.score;

  const hardTech = nonDrop
    .filter((a) => a.classification.bucket === 'HARD_TECH_AI')
    .sort(byScore)
    .slice(0, HARD_TECH_MAX);

  // SIGNALS fills remaining slots up to BRIEF_MAX
  const signalsMax = Math.max(SIGNALS_MAX, BRIEF_MAX - hardTech.length);
  const signals = nonDrop
    .filter((a) => a.classification.bucket === 'IMPORTANT_AI_SIGNALS')
    .sort(byScore)
    .slice(0, signalsMax);

  // If still under BRIEF_MAX, fill remaining slots with best-scoring DROP articles (renderLevel forced to LIGHT).
  const primaryCount = hardTech.length + signals.length;
  const fillerCount = BRIEF_MAX - primaryCount;
  const fillers: ClassifiedArticle[] = fillerCount > 0
    ? allClassified
        .filter((a) => a.classification.bucket === 'DROP')
        .sort(byScore)
        .slice(0, fillerCount)
        .map((a) => ({ ...a, classification: { ...a.classification, bucket: 'IMPORTANT_AI_SIGNALS' as const, renderLevel: 'LIGHT' as const, recommendation: 'SKIM' as const } }))
    : [];

  const selected = [...hardTech, ...signals, ...fillers].slice(0, BRIEF_MAX);
  const fillerLabel = fillers.length > 0 ? ` + ${fillers.length} filler` : '';
  console.log(`[main] Selected ${hardTech.length} HARD_TECH + ${signals.length} SIGNALS${fillerLabel} for brief (cap ${BRIEF_MAX})`);

  // ── Stage 4: Brief generator LLM ─────────────────────────────────────────
  const brief = await generateBrief(provider, selected, date).catch((err) => {
    console.warn('[brief] Generator failed, using degraded fallback:', err instanceof Error ? err.message : err);
    return buildDegradedBrief(selected, date);
  });

  // ── Stage 5: Format + push ────────────────────────────────────────────────
  const body = formatBriefText(brief, provider.name);

  // Build action links from displayed items in sections (FULL + LIGHT, not OMIT).
  // No Click header — tap opens the notification body, not a URL.
  // ntfy supports max 3 action buttons → articles 1-3 each get a button.
  const displayedItems = brief.sections
    .flatMap((s) => s.items)
    .filter((item) => item.renderLevel !== 'OMIT');

  const buttonLinks = displayedItems.map((item, i) => ({
    label: `原文 ${i + 1}`,
    url: item.url,
  }));

  try {
    await sendNtfy(
      config.ntfyTopic,
      `AI Morning Brief ${date}`,
      body,
      { actionLinks: buttonLinks }
    );
    console.log('[ntfy] Sent successfully');
  } catch (err) {
    console.error('[ntfy] Failed to send:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Web Push — runs in parallel with ntfy during transition period.
  // Remove ntfy above once Web Push is confirmed working.
  try {
    await sendWebPush(`AI Morning Brief ${date}`, '今日 brief 已就緒，點此開啟');
  } catch (err) {
    console.warn('[web-push] Failed:', err instanceof Error ? err.message : err);
  }

  // ── Stage 6: Persist to Turso DB ─────────────────────────────────────────
  try {
    await writeArticlesToDB(brief, selected, date);
  } catch (err) {
    console.error('[db-writer] Failed to write articles:', err instanceof Error ? err.message : err);
    // Non-fatal: ntfy already sent, don't exit(1)
  }
}

main().catch((err) => {
  console.error('[main] Unhandled error:', err);
  process.exit(1);
});
