import 'dotenv/config'
import { pathToFileURL } from 'node:url';
import { count, eq, isNotNull } from 'drizzle-orm';
import { loadConfig, CLASSIFIER_CAP, PER_SOURCE_CLASSIFIER_MIN, HARD_TECH_MAX, SIGNALS_MAX, BRIEF_MAX } from './config.js';
import { getTodaysArticles, pickForClassifier } from './rss/feed.js';
import type { AIProvider, ClassifiedArticle } from './ai/provider.js';
import { fallbackProvider, selectProvider } from './ai/select-provider.js';
import { classifyArticles, buildPreferenceContext } from './ai/classifier.js';
import { generateBrief, buildDegradedBrief } from './ai/brief.js';
import { sendWebPush } from './notify/web-push.js';
import { writeArticlesToDB } from './notify/db-writer.js';
import { db, getRecentFeedback, getQuizPoolSize, getLastActivityAt } from './db/client.js';
import type { FeedbackRow } from './db/client.js';
import { articles, pushSubscriptions } from './db/schema.js';
import { getTaipeiDateString } from './date.js';
import { applyFeedbackBoost } from './feedback-boost.js';

// Size of one quiz set on the client (web/src/api.ts fetchQuizzes default).
const QUIZ_SET_SIZE = 5

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

  // No DROP fillers (removed 2026-09-30). They used to top the brief up to
  // BRIEF_MAX with articles the classifier itself rejected, relabelled as
  // Signals — the main source of "why is this here?" days. A quiet news day
  // now yields a shorter brief.
  return [...hardTech, ...signals].slice(0, BRIEF_MAX)
}

/** No activity for this many days → skip the brief (see the idle check in main). */
const IDLE_SKIP_DAYS = 3;

export async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[config] Failed to load:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const date = getTaipeiDateString();
  console.log(`[main] AI Morning Brief — ${date}`);

  // Idempotency: GitHub's schedule is best-effort and has run hours late
  // (2026-10-01: the 07:07 run hadn't started by 07:31). Once today's brief is
  // in the DB — from a manual run or an external trigger — a late scheduled
  // run must not push it a second time. FORCE=1 (workflow input) overrides.
  if (process.env['DRY_RUN'] !== '1' && process.env['FORCE'] !== '1') {
    const [existing] = await db.select({ n: count() }).from(articles).where(eq(articles.briefDate, date));
    if ((existing?.n ?? 0) > 0) {
      console.log(`[main] ${existing!.n} article(s) already published for ${date} — skipping (set force to re-run)`);
      return;
    }

    // Idle skip (2026-10-01): if nobody has opened the app, swiped or answered
    // for IDLE_SKIP_DAYS, don't spend LLM calls on a brief nobody reads, and
    // don't push. The afternoon reminder (src/reminder.ts, no LLM) keeps going
    // and is what brings the user back; the next morning after any activity
    // runs normally. FORCE=1 overrides.
    const lastActivity = await getLastActivityAt();
    const idleMs = lastActivity ? Date.now() - lastActivity.getTime() : Infinity;
    if (idleMs > IDLE_SKIP_DAYS * 24 * 60 * 60 * 1000) {
      console.log(`[main] Idle since ${lastActivity?.toISOString() ?? 'ever'} (> ${IDLE_SKIP_DAYS} days) — skipping today's brief (set force to run anyway)`);
      return;
    }
  }

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
    if (process.env['DRY_RUN'] === '1') {
      console.log('[dry-run] No articles in last 24h — skipping empty-day notice.');
      return;
    }
    console.log('[main] No articles in last 24h — sending empty-day notice');
    try {
      await sendWebPush(`Sift · ${date}`, '今日無重大 AI 新聞');
    } catch (err) {
      console.error('[web-push] Empty-day notice failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
    return;
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
  // Per-source quota, then best keyword scores, capped (bounds classifier cost).
  const toClassify = pickForClassifier(prefiltered, CLASSIFIER_CAP, PER_SOURCE_CLASSIFIER_MIN);
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

  let classifications: Awaited<ReturnType<typeof classifyArticles>>;
  try {
    classifications = await classifyArticles(provider, toClassify, preferenceContext);
  } catch (err) {
    console.error(`[classifier] ${provider.name} outage:`, err instanceof Error ? err.message : err);
    const fallback = fallbackProvider(config, provider);
    if (!fallback) {
      console.error('[main] No fallback provider configured — failing the run (no push).');
      process.exit(1);
    }
    console.warn(`[main] Falling back to ${fallback.name}`);
    provider.logUsageSummary();
    provider = fallback;
    try {
      classifications = await classifyArticles(provider, toClassify, preferenceContext);
    } catch (err2) {
      // Both providers down is an infra error: fail the Action, never send a
      // fake empty-day push.
      console.error(`[classifier] ${provider.name} outage too:`, err2 instanceof Error ? err2.message : err2);
      process.exit(1);
    }
  }

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

  if (process.env['DRY_RUN'] === '1') {
    // Inspect selection quality on real data without touching the DB or
    // anyone's phone. Triggered from the workflow_dispatch `dry_run` input.
    console.log('\n[dry-run] Classified (score · bucket · category · source · title):')
    for (const a of [...allClassified].sort((x, y) => y.classification.score - x.classification.score)) {
      const c = a.classification
      console.log(`  ${String(c.score).padStart(3)} · ${c.bucket.padEnd(20)} · ${c.category.padEnd(19)} · ${a.source} · ${a.title}`)
      console.log(`        ↳ ${c.engineeringImpact}`)
    }
    console.log('\n[dry-run] Would publish:')
    selected.forEach((a, i) => console.log(`  ${i + 1}. [${a.classification.bucket}] ${a.title} (${a.source})`))
    console.log('[dry-run] Skipping brief generation, DB write and Web Push.')
    process.exit(0)
  }

  if (selected.length === 0) {
    // Quiet day: nothing cleared the classifier. Same notice as the no-articles
    // path; nothing is written, so the PWA keeps showing its empty state.
    console.log('[main] No article cleared the classifier — sending empty-day notice')
    try {
      await sendWebPush(`Sift · ${date}`, '今日無重大 AI 新聞')
    } catch (err) {
      console.error('[web-push] Empty-day notice failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
    process.exit(0)
  }

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
  // Web Push composition (2026-04-26 redesign, second line 2026-09-29):
  //   title = lead story headline (the strongest reason to open)
  //   body  = lead.engineeringImpact + "今日 N 篇 · 還有 K 題判斷題等你"
  // The second line used to be the bucket names ("Hard Tech AI · Signals"),
  // which told the reader nothing; it now counts the brief and points at the
  // quiz. The quiz half is best-effort: a failed pool lookup drops it, never
  // the push.
  //
  // In per-user mode: each device gets a push built from THEIR lead article
  // (the top article from their personal selection), sent only to THEIR
  // push_subscriptions rows. This prevents the "被詐騙" UX where the
  // notification headline doesn't match what the user sees in the app.
  //
  // Fallback (no device IDs or query failure): global push to all subscriptions.

  let quizCount = 0
  try {
    quizCount = Math.min(QUIZ_SET_SIZE, await getQuizPoolSize())
  } catch (err) {
    console.warn('[web-push] Quiz pool lookup failed, omitting quiz line:', err instanceof Error ? err.message : err)
  }

  function buildPushContent(userArticles: ClassifiedArticle[]): { title: string; body: string } {
    const lead = userArticles[0]
    const title = lead?.title ?? `Sift · ${date}`
    const teaser = lead ? (lead.classification.engineeringImpact || lead.classification.summary || '') : ''
    const parts = [userArticles.length > 0 ? `今日 ${userArticles.length} 篇` : '今日無重大 AI 新聞']
    if (quizCount > 0) parts.push(`還有 ${quizCount} 題判斷題等你`)
    const countLine = parts.join(' · ')
    const body = teaser ? `${teaser}\n${countLine}` : countLine
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[main] Unhandled error:', err);
    process.exit(1);
  });
}
