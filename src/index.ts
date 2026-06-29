import 'dotenv/config'
import { isNotNull } from 'drizzle-orm';
import { loadConfig, CLASSIFIER_CAP, HARD_TECH_MAX, SIGNALS_MAX, BRIEF_MAX } from './config.js';
import { getTodaysArticles } from './rss/feed.js';
import type { AIProvider, ClassifiedArticle } from './ai/provider.js';
import { selectProvider } from './ai/select-provider.js';
import { classifyArticles, buildPreferenceContext } from './ai/classifier.js';
import { generateBrief, buildDegradedBrief } from './ai/brief.js';
import { sendWebPush } from './notify/web-push.js';
import { writeArticlesToDB } from './notify/db-writer.js';
import { db, getRecentFeedback } from './db/client.js';
import type { FeedbackRow } from './db/client.js';
import { pushSubscriptions } from './db/schema.js';
import { getTaipeiDateString } from './date.js';

const BUCKET_LABEL: Record<string, string> = {
  HARD_TECH_AI: 'Hard Tech AI',
  IMPORTANT_AI_SIGNALS: 'Signals',
}

/** Adjust classification scores based on per-user feedback history. */
function applyFeedbackBoost(
  classified: ClassifiedArticle[],
  feedbackRows: FeedbackRow[],
): ClassifiedArticle[] {
  if (feedbackRows.length === 0) return classified
  const upCats = new Map<string, number>()
  const downCats = new Map<string, number>()
  for (const f of feedbackRows) {
    if (f.signal === 'up') upCats.set(f.categoryTag, (upCats.get(f.categoryTag) ?? 0) + 1)
    else downCats.set(f.categoryTag, (downCats.get(f.categoryTag) ?? 0) + 1)
  }
  return classified.map((a) => {
    const cat = a.classification.category
    const boost = (upCats.get(cat) ?? 0) * 0.5 - (downCats.get(cat) ?? 0) * 0.5
    if (boost === 0) return a
    return { ...a, classification: { ...a.classification, score: a.classification.score + boost } }
  })
}

/**
 * Select up to BRIEF_MAX articles from the classified pool for one user.
 * Applies feedback-based score boost before bucket-ranked selection.
 */
function selectForUser(
  allClassified: ClassifiedArticle[],
  feedbackRows: FeedbackRow[],
): ClassifiedArticle[] {
  const reranked = applyFeedbackBoost(allClassified, feedbackRows)
  const nonDrop = reranked.filter(
    (a) => a.classification.bucket !== 'DROP' && a.classification.renderLevel !== 'OMIT',
  )
  const byScore = (a: ClassifiedArticle, b: ClassifiedArticle) =>
    b.classification.score - a.classification.score

  const hardTech = nonDrop
    .filter((a) => a.classification.bucket === 'HARD_TECH_AI')
    .sort(byScore)
    .slice(0, HARD_TECH_MAX)
  const signalsMax = Math.max(SIGNALS_MAX, BRIEF_MAX - hardTech.length)
  const signals = nonDrop
    .filter((a) => a.classification.bucket === 'IMPORTANT_AI_SIGNALS')
    .sort(byScore)
    .slice(0, signalsMax)

  const primaryCount = hardTech.length + signals.length
  const fillerCount = BRIEF_MAX - primaryCount
  const fillers: ClassifiedArticle[] =
    fillerCount > 0
      ? reranked
          .filter((a) => a.classification.bucket === 'DROP')
          .sort(byScore)
          .slice(0, fillerCount)
          .map((a) => ({
            ...a,
            classification: {
              ...a.classification,
              bucket: 'IMPORTANT_AI_SIGNALS' as const,
              renderLevel: 'LIGHT' as const,
              recommendation: 'SKIM' as const,
            },
          }))
      : []

  return [...hardTech, ...signals, ...fillers].slice(0, BRIEF_MAX)
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
  // Note: RSS / sources failures exit non-zero so GitHub Actions surfaces them
  // via workflow-failure email — we don't push these to the user's phone.
  let feedResult: Awaited<ReturnType<typeof getTodaysArticles>>;
  try {
    feedResult = await getTodaysArticles();
  } catch (err) {
    console.error('[rss] Feed fetch error:', err);
    process.exit(1);
  }

  const { articles: prefiltered, sourceFailures, sourceTotal } = feedResult;
  console.log(`[rss] ${prefiltered.length} articles after prefilter (${sourceFailures}/${sourceTotal} sources failed)`);

  if (sourceFailures === sourceTotal) {
    console.error('[rss] All sources failed');
    process.exit(1);
  }

  if (prefiltered.length === 0) {
    console.log('[main] No articles in last 24h — sending empty-day notice');
    try {
      await sendWebPush(`AI Morning Brief ${date}`, '今日無重大 AI 新聞');
    } catch (err) {
      console.error('[web-push] Empty-day notice failed:', err instanceof Error ? err.message : err);
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

  // ── Stage 3: Per-user selection ───────────────────────────────────────────
  // Fetch all known device IDs from push_subscriptions. When device IDs exist,
  // each user gets their own top-3 reranked by feedback. The union of all
  // selections is written to DB and used for brief generation.
  // When no device IDs exist (legacy / pre-migration state), fall back to the
  // global selection that was used before multi-user support.
  let perUserSelections: Map<string, ClassifiedArticle[]> | null = null
  let selected: ClassifiedArticle[]

  try {
    const deviceRows = await db
      .selectDistinct({ deviceId: pushSubscriptions.deviceId })
      .from(pushSubscriptions)
      .where(isNotNull(pushSubscriptions.deviceId))
    const deviceIds = deviceRows.map((r) => r.deviceId).filter((id): id is string => id !== null)

    if (deviceIds.length > 0) {
      perUserSelections = new Map()
      for (const deviceId of deviceIds) {
        let deviceFeedback: FeedbackRow[] = []
        try {
          deviceFeedback = await getRecentFeedback(deviceId)
        } catch (err) {
          console.warn(`[main] Failed to load feedback for device ${deviceId.slice(0, 8)}…:`, err instanceof Error ? err.message : err)
        }
        const userSelected = selectForUser(allClassified, deviceFeedback)
        perUserSelections.set(deviceId, userSelected)
        const logFeedback = deviceFeedback.length > 0 ? ` (${deviceFeedback.length} feedback signals)` : ' (no feedback)'
        console.log(`[main] Device ${deviceId.slice(0, 8)}… → ${userSelected.length} articles${logFeedback}`)
      }

      // Union of all users' selections, deduped by URL (article id is DB-side)
      const seenLinks = new Set<string>()
      selected = []
      for (const userArticles of perUserSelections.values()) {
        for (const a of userArticles) {
          if (!seenLinks.has(a.link)) {
            seenLinks.add(a.link)
            selected.push(a)
          }
        }
      }
      console.log(`[main] ${perUserSelections.size} users → ${selected.length} unique articles for brief`)
    } else {
      console.log('[main] No device IDs found in push_subscriptions — using global selection (fallback)')
      selected = selectForUser(allClassified, [])
    }
  } catch (err) {
    console.warn('[main] Device ID query failed, falling back to global selection:', err instanceof Error ? err.message : err)
    selected = selectForUser(allClassified, [])
  }

  const globalHardTech = selected.filter((a) => a.classification.bucket === 'HARD_TECH_AI').length
  const globalSignals = selected.filter((a) => a.classification.bucket === 'IMPORTANT_AI_SIGNALS').length
  console.log(`[main] Selected ${globalHardTech} HARD_TECH + ${globalSignals} SIGNALS for brief (total ${selected.length})`);

  // ── Stage 4: Brief generator LLM ─────────────────────────────────────────
  const brief = await generateBrief(provider, selected, date).catch((err) => {
    console.warn('[brief] Generator failed, using degraded fallback:', err instanceof Error ? err.message : err);
    return buildDegradedBrief(selected, date);
  });

  // After all LLM work for this run, surface cumulative cache + token stats.
  // Used to verify whether the stable system-prompt prefix is actually held
  // across runs (Anthropic) or hits OpenAI's automatic prefix cache.
  provider.logUsageSummary();

  // ── Stage 5: Persist to Turso DB ─────────────────────────────────────────
  // Web Push is only an entrypoint into the PWA. Persist first so a tapped
  // notification never opens to an empty/stale feed.
  try {
    await writeArticlesToDB(brief, selected, date);
  } catch (err) {
    console.error('[db-writer] Failed to write articles:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── Stage 6: Push ────────────────────────────────────────────────────────
  // Web Push composition (2026-04-26 redesign):
  //   title = lead story headline (the strongest reason to open)
  //   body  = lead.engineeringImpact + section line with extras count
  //
  // In per-user mode: each device gets a push built from THEIR lead article
  // (the top article from their personal selection), sent only to THEIR
  // push_subscriptions rows. This prevents the "被詐騙" UX where the
  // notification headline doesn't match what the user sees in the app.
  //
  // Fallback (no device IDs or query failure): global push to all subscriptions.

  function buildPushContent(userArticles: ClassifiedArticle[]): { title: string; body: string } {
    const lead = userArticles[0]
    const title = lead?.title ?? `AI Morning Brief ${date}`
    const teaser = lead ? (lead.classification.engineeringImpact || lead.classification.summary || '') : ''
    const activeBuckets = [...new Set(userArticles.map((a) => a.classification.bucket))]
    const activeSectionNames = activeBuckets.map((b) => BUCKET_LABEL[b] ?? b)
    const extraCount = Math.max(0, userArticles.length - 1)
    const sectionLine = extraCount > 0
      ? `${activeSectionNames.join(' · ')} · +${extraCount} 篇`
      : activeSectionNames.join(' · ')
    const body = teaser ? `${teaser}\n${sectionLine}` : sectionLine
    return { title, body }
  }

  if (perUserSelections && perUserSelections.size > 0) {
    let pushOk = 0
    for (const [deviceId, userArticles] of perUserSelections) {
      const { title, body } = buildPushContent(userArticles)
      try {
        await sendWebPush(title, body, deviceId)
        pushOk++
      } catch (err) {
        console.error(`[web-push] Failed for device ${deviceId.slice(0, 8)}…:`, err instanceof Error ? err.message : err)
      }
    }
    if (pushOk === 0) {
      console.error('[web-push] All per-user pushes failed')
      process.exit(1)
    }
  } else {
    // Fallback: no per-user device IDs — send to all subscriptions globally
    const { title, body } = buildPushContent(selected)
    try {
      await sendWebPush(title, body)
    } catch (err) {
      console.error('[web-push] Failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error('[main] Unhandled error:', err);
  process.exit(1);
});
