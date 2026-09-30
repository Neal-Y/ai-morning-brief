# Architecture Reference

> **Status: Living spec.** Keep this in sync with code. If you change classifier/quiz logic, DB schema, or an API contract, update this file in the same PR/commit.
>
> This is the detailed mechanical reference — algorithms, decision tables, exact schemas, exact API contracts. [../CLAUDE.md](../CLAUDE.md) and [../README.md](../README.md) summarize; this file is where the summary bottoms out. If this file and the code disagree, the code wins — fix this file, not your understanding of the code.
>
> History: this doc absorbed the still-accurate mechanics (§ Classifier, § Rank+Select, § Category taxonomy) out of the frozen [decisions/2026-04-13-v1-proposal.md](./decisions/2026-04-13-v1-proposal.md), which described the same rules for the retired ntfy-delivery V1. The rules didn't change when delivery moved to Web Push; only where they're documented did.

---

## Two independent pipelines

Both write to the same Turso DB. Neither reads the other's tables. Either can fail without affecting the other.

| | Article pipeline | Quiz pipeline |
|---|---|---|
| Entry | `src/index.ts` | `src/quiz-pipeline.ts` |
| Cron | `daily_sync.yml`, 07:07 Taipei | `quiz_sync.yml`, 05:47 Taipei |
| Depends on | RSS feeds | Nothing external — pure LLM generation |
| Output table | `articles` | `quizzes` |
| Shared with the other pipeline | `ai/select-provider.ts` (GPT/Claude alternation), same Turso instance | same |

---

## Article pipeline

### Stage 1 — Fetch + Prefilter (`rss/feed.ts`)

1. Filter: `pubDate` within the last 24h.
2. Keyword scoring: positive keywords (llm/gpu/inference/distributed/...) add, negative keywords (event/conference/survey/funding/...) subtract. Weights: `KEYWORD_WEIGHTS` in `config.ts`.
3. `PREFILTER_MIN_SCORE = -2` — below this, discard before it ever reaches the LLM.
3a. Cross-source dedupe (`dedupeStories`, 2026-09-30). Two items are the same story when they have the same canonical URL (host+path, query/hash dropped), or when their titles share ≥3 tokens (Latin words minus stopwords, CJK bigrams) covering ≥70% of the shorter title. The survivor is the higher source tier (`primary` > `technical` > `broad`), then the higher keyword score, so a vendor's own post beats the rewrite.
4. If nothing survives: send an empty-day Web Push ("今日無重大 AI 新聞") and exit 0 — this is a normal outcome, not a failure.

### Stage 2 — Classifier (`ai/classifier.ts`)

- One LLM call per article, `CLASSIFIER_CONCURRENCY = 3` in flight (free-tier Anthropic/OpenAI TPM headroom).
- Selection for the classifier (`pickForClassifier`, 2026-09-30): each source first gets its top `PER_SOURCE_CLASSIFIER_MIN = 2` by keyword score, then the best-scoring leftovers fill up to `CLASSIFIER_CAP = 24` (cost lever, see README Cost section). The old rule was top-N by keyword score only. It let generic words decide, and cut low-text sources (HN titles, short blog titles) before the LLM saw them.
- The classifier sees the title, source, URL and the first 800 characters of the snippet (was 500).
- One article failing does not abort the run — it falls back to bucket `DROP` (not a silent promotion; see [../CLAUDE.md](../CLAUDE.md) Key Design Decisions).
- Preference context (`buildPreferenceContext()`, near-30-day feedback) is appended at the **end** of the system prompt, never the start/middle — preserves the Anthropic cache prefix across days. Cold-start threshold: 10 rows. Per-category negative signal needs ≥2 👎 to count.

Per-article output shape:

```typescript
interface ArticleClassification {
  category: Category            // 11 values, see table below
  bucket: 'HARD_TECH_AI' | 'IMPORTANT_AI_SIGNALS' | 'DROP'
  renderLevel: 'FULL' | 'LIGHT' | 'OMIT'
  recommendation: 'READ_NOW' | 'SKIM' | 'SKIP'
  score: number                 // 0-100
  summary: string                // ≤25 Chinese chars
  engineeringImpact: string
  reason: string
}
```

**Category taxonomy** (11 values, unchanged since V1):

| Category | 說明 | Display tag |
|---|---|---|
| `model-release` | 新模型、能力升級、benchmark、reasoning/tool/multimodal 變化 | `#model-release` |
| `api-platform` | API/SDK 異動、structured output、pricing/rate limit | `#api-platform` |
| `infra-inference` | Inference stack、serving、GPU infra、latency/throughput | `#infra` |
| `tooling-open-source` | 開源 AI tooling、agent framework、eval 工具、observability | `#tooling` |
| `benchmark-eval` | Eval 方法論、benchmark 本身、比較框架 | `#eval` |
| `agent-systems` | 自主 agent 架構、multi-agent、tool-use、planning/memory | `#agent` |
| `policy-regulation` | 法規、chip export control、geopolitics 影響 AI 供應鏈 | `#policy` |
| `company-market` | 融資、收購、組織變動、策略轉向 | `#market` |
| `social-opinion` | 調查、公眾情緒、媒體評論、文化反應 | `#opinion` |
| `event-promo` | 研討會、startup event、promo 文章 | *(no tag — always DROP)* |
| `research-adjacent` | 學術/硬體/材料研究，非直接 AI 系統工程 | `#research` |

**Bucket rules:**
- `HARD_TECH_AI` — 直接與 AI 系統、API、inference、eval、部署、tooling 工程相關
- `IMPORTANT_AI_SIGNALS` — 重要的業界/政策/公司信號，不是直接的工程更新
- `DROP` — 低價值雜訊、event/promo、弱社會評論、模糊市場資訊，**也是 per-article classifier 失敗時的 fallback**

**RenderLevel rules:**

| Bucket + Recommendation | RenderLevel |
|---|---|
| HARD_TECH_AI + READ_NOW | FULL |
| HARD_TECH_AI + SKIM（有具體工程影響） | FULL |
| HARD_TECH_AI + SKIM（無具體影響） | LIGHT |
| IMPORTANT_AI_SIGNALS + SKIM | LIGHT |
| IMPORTANT_AI_SIGNALS + SKIP | OMIT |
| DROP | OMIT |

### Stage 3 — Rank + Select (`src/index.ts`)

```
nonDrop  = articles where bucket != DROP AND renderLevel != OMIT
hardTech = nonDrop HARD_TECH_AI, sorted by score desc, take ≤ HARD_TECH_MAX (2)
signals  = nonDrop IMPORTANT_AI_SIGNALS, sorted by score desc, take ≤ max(SIGNALS_MAX, BRIEF_MAX - len(hardTech))
selected = (hardTech + signals)[:BRIEF_MAX]   // may be < 3 on a quiet day; 0 → empty-day push, no DB write
```

Constants (`config.ts`): `HARD_TECH_MAX=2`, `SIGNALS_MAX=1`, `BRIEF_MAX=3`, `CLASSIFIER_CONCURRENCY=3`, `CLASSIFIER_CAP=24`, `PER_SOURCE_CLASSIFIER_MIN=2`.

DROP fillers were removed on 2026-09-30. They used to top the brief up to 3 with articles the classifier had rejected, relabelled as Signals, and were the main source of irrelevant articles in the brief.

`DRY_RUN=1` (the workflow_dispatch `dry_run` input on `daily_sync.yml`) stops after selection. It prints every classification plus the would-be brief, and skips brief generation, the DB write and Web Push. Use it to judge selection changes on real data.

### Stage 4 — Brief Generator (`ai/brief.ts`)

Single LLM call for all selected articles.

- **FULL**: summary / context / engineeringImpact / reason all filled. `shortJudgment = null`.
- **LIGHT**: same 4 fields filled (not empty) **plus** `shortJudgment` (≤20 Chinese chars, `[訊號類型]：[具體事實]`) as an *additive* priority badge — not a replacement for the 4 fields.
- **OMIT**: not in `sections`; at most one line in `skippedToday`.
- Failure fallback: `buildDegradedBrief()` assembles `BriefResult` straight from classifier output, no second LLM call.

### Stage 5 — Persist (`notify/db-writer.ts`)

`onConflictDoUpdate` on `articles.url` (never `onConflictDoNothing` — it makes the count log lie about upsert vs insert).

### Stage 6 — Web Push (`notify/web-push.ts`)

Only fires after Stage 5 succeeds (strict serial order — see [../CLAUDE.md](../CLAUDE.md) Conventions). Title = lead story headline. Body line 1 = lead article's `engineeringImpact`. Body line 2 = `今日 N 篇 · 還有 K 題判斷題等你`, where K = min(5, quiz pool size). If the pool lookup fails the quiz half is dropped and the push still goes out. Before 2026-09-29 this line was the section labels (`Hard Tech AI · Signals · +2 篇`).

### Afternoon reminder (`src/reminder.ts`, `reminder_sync.yml`, 15:53 Taipei)

A separate job, not part of the article pipeline. It targets subscribed devices with **no** `feedback` row and **no** `quiz_attempts` row since Taipei midnight, so anyone who already read or answered today is never reminded.
- **Copy:** leads with the streak through yesterday (`src/streak.ts`, the same function as `/api/activity`) when it is ≥ 2.
- **Tap target:** the payload carries `url: '/quiz'`. `sw.js` opens that path, or posts `{type:'navigate'}` to an already-open window, which `main.tsx` routes in-app.
- **Failure:** if every push fails, the job exits 1.
- **Dry run:** the `dry_run` input logs recipients and copy without sending.

---

## Quiz pipeline

> **Operational status (2026-09-30)**: `quiz_sync.yml` was paused by hand from 2026-08 and re-enabled on 2026-09-29. It now runs daily at 05:47 Taipei. When it's paused, the existing `quizzes` pool still serves through the recycle logic in `GET /api/quiz` (see below); the pool just stops growing. Check current GitHub Actions workflow state, not just this file, before assuming it's running.

### Generation (`quiz/generate.ts`)

One LLM call, `QUIZ_COUNT = 5` questions per run, free mix of 4 types:

| Type | Payload shape | Answer key |
|---|---|---|
| `single_choice` | `{ options: string[4], correctIndex: 0-3 }` | `correctIndex` |
| `ordering` | `{ items: string[3-5] }` | array order **is** the answer — client shuffles for display. The validator enforces the 5-item cap (the web card drags within one screen) |
| `matching` | `{ left: string[], right: string[] }` | `right[i]` matches `left[i]` by index — client shuffles `right` |
| `fill_blank` | `{ template: string, blanks: string[], wordBank: string[] }` | template has `{{0}}`, `{{1}}`... placeholders; `wordBank` = blanks + distractors, shuffled client-side |

- Dedup: `getRecentQuizPrompts()` pulls recent question prompts (window/row-count capped by `QUIZ_DEDUP_WINDOW_DAYS`/`QUIZ_DEDUP_MAX_ROWS` in `config.ts`), appended at the **end** of `QUIZ_SYSTEM` as an "AVOID REPEATING" block — same cache-prefix-preserving technique as the classifier's preference context. Do not move it to the start/middle.
- Web client keeps today's set + progress in localStorage `mb_quiz_session` (keyed by Taipei date), so leaving the Quiz tab doesn't refetch — a refetch would reshuffle the set, since `/api/quiz` serves unattempted questions first.
- Every generated item is validated (`isValidPayload`) before being accepted — malformed items are dropped with a `console.warn`, not silently coerced. If the whole batch validates to 0 items, the pipeline throws (retried once via `withRetry`, then fails the GitHub Actions run).
- Output language: Traditional Chinese for question text, options, explanations. English retained only for established technical terms.

### Write (`db/quiz-writer.ts`)

Plain insert into `quizzes` — no upsert/dedup at the DB layer; dedup happens earlier, at generation time, via the prompt-steering context above.

### Consumption (client-side — web PWA `web/` is primary; RN app `app/` shelved, see [README.md](./README.md))

- `GET /api/quiz` (Hono, read-only) — today's question set, filled in this order:
  1. **Spaced review** (`src/quiz/review.ts`, 2026-09-30): questions this device missed come back on a 1 → 3 → 7 Taipei-day ladder. Each correct answer since the last miss moves a question one rung, and three in a row graduate it. A new miss restarts at 1 day. At most `REVIEW_MAX_PER_SET = 2` per set, most overdue first. State is derived from `quiz_attempts` alone, with no extra table. Items carry `review: true`, and the web shows a 「複習 · 之前答錯」 tag.
  2. **Fresh**: questions never attempted, newest first.
  3. **Recycle**: already-attempted questions, newest first, used only when the pool runs short.
- `POST /api/quiz-attempt` (`api/quiz-attempt.ts`, Edge) — records `{ quizId, deviceId, correct }` into `quiz_attempts`. `X-Device-Id` required, 400 without it.
- Ask *streaming* on a quiz question reuses `/api/ask` via a synthetic `articleId = quiz-${id}` — that part works on both clients (the quiz prompt is repurposed as Ask `context.title`, the explanation as `context.summary`, the category as `context.context`). Since 2026-09-30 the web also sends a `quiz` object, which switches `api/ask.ts` to a tutor prompt. Before the user answers, that object carries only the question and answer-free material (ordering and matching lists are sorted, so the order leaks nothing), and the prompt tells the model not to reveal the answer. After answering, it adds the user's answer, the correct answer and the explanation. The old app/ shape (no `quiz`) still gets the article prompt. Ask *history persistence* via `conversations` does **not** work for this synthetic id — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) "Quiz follow-up history cannot persist to the DB". `web/src/askHistory.ts` routes quiz threads to `localStorage` instead, and `app/src/api.ts` routes them to AsyncStorage (`sift_quiz_ask_quiz-<id>`, since 2026-09-29).

---

## Database Schema (Turso / libSQL, `src/db/schema.ts`)

No account system. `device_id` (client-generated UUID, `X-Device-Id` header, spoofable — accepted tradeoff, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)) is the only multi-user boundary, present on 5 of 7 tables.

| Table | Key columns | Notes |
|---|---|---|
| `articles` | `id` (SHA-256(url).slice(0,16)) pk, `url` unique, `score`, `renderLevel`, `categoryTag`, `skillTags` (JSON string, unused by classifier today), `briefDate` | No `device_id` — articles are global, not per-user |
| `feedback` | `articleId` fk, `signal` ('up'\|'down'), `deviceId` | delete-then-insert on write — same (device, article) pair only ever has the latest signal |
| `saves` | `articleId` fk, `deviceId`, `notionPageId` | unique on `(deviceId, articleId)`. Unsave is a **hard delete** (`DELETE FROM saves`, fixed 2026-08-05 — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for why an earlier soft-delete design never actually worked). Safe because Notion dedupe checks Notion directly (`findSavePageByArticleId`), not this row — re-saving after unsave still finds and reuses the same Notion page |
| `conversations` | `articleId` fk, `deviceId`, `messages` (JSON), `messageCount`, `model` | unique on `(articleId, deviceId)`. Full-overwrite on save, not append-diff. `/api/library` selects `messageCount` only — never loads `messages`. FK to `articles.id` **is enforced** — a synthetic `quiz-${id}` (or any non-existent 16-hex id) cannot be written here; see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) |
| `quizzes` | `type`, `category`, `prompt`, `payload` (JSON, shape per `type`), `explanation` | No `deviceId` — quizzes are global, like articles |
| `quiz_attempts` | `quizId` fk, `deviceId`, `correct` | One row per attempt (no unique constraint — a user can retry and log multiple attempts on the same quiz) |
| `push_subscriptions` | `endpoint` unique, `p256dh`, `auth`, `deviceId` | Web Push subscription |
| `quiz_reports` | `quizId`, `deviceId`, `reason` ('wrong_answer'\|'unclear'\|'too_easy'\|'other') | unique on `(quizId, deviceId)`. **Created lazily** by `api/quiz-report.ts` (`CREATE TABLE IF NOT EXISTS`), not by a migration. Readers (`/api/quiz`, `getReportedQuizzes`) treat "no such table" as none reported. Reported questions are excluded from `/api/quiz` for every device and listed in the generator's AVOID block |

---

## API Contract

### Edge GET

| Route | Query params | Returns |
|---|---|---|
| `GET /api/weekly` (`api/weekly.ts`, 2026-09-30) | — (`X-Device-Id`) | This week's review (Mon 00:00 Taipei → now): `{ weekLabel, daysElapsed, activeDays, read, answered, correct, lastWeek: {answered, correct}, weakCategories[≤3], missed[≤5], saved[≤5] }`. One Turso pipeline (three statements), `no-store` |
| `GET /api/feed` (`api/feed.ts`) | `date` (YYYY-MM-DD, default today in Taipei; anything else → 400) | `{ date, articles: RawArticle[] }`, the same shape the Hono/drizzle route returned. `Cache-Control` is `s-maxage=300, swr=300` when the day has articles and `s-maxage=30` when it is empty |

### Hono, read-only GET (`src/api/app.ts` → `api/index.ts` on Vercel)

| Route | Query params | Returns |
|---|---|---|
| `GET /api/library` | — | All-history articles JOINed with feedback/saves/notionSynced/ask-message-count (JS-join, no `messages` JSON) |
| `GET /api/quiz` | `count`, `type` (comma list) | `RawQuizItem[]` (+ `review: boolean`) |
| `GET /api/activity` | — | `{ streak, activeToday, heatmap, weekStats, recent, totalCorrect }`, scoped by `X-Device-Id`. Since 2026-09-29 a day counts for `streak` / `heatmap` if the device read (any `feedback` row) **or** answered (`quiz_attempts`). `weekStats` / `recent` / `totalCorrect` stay quiz-only. `activeToday` says whether today already counts |

### Edge Runtime, body-reading POST (root `api/*.ts` — see [../CLAUDE.md](../CLAUDE.md) Conventions for *why* these can't be Hono routes)

| Route | Body | Effect |
|---|---|---|
| `POST /api/ask` | `{ articleTitle, articleSummary, articleContext, messages, quiz? }`, or `{ mode: 'suggest', articleTitle, articleSummary, articleContext }` | Default: SSE stream, Haiku 4.5; an optional `quiz` object switches to the quiz tutor prompt (see Quiz above). `mode: 'suggest'` returns non-streaming JSON `{ suggestions: string[3] }`, three article-specific follow-up questions (`max_tokens` 300). The web caches these per article in localStorage (`mb_ask_suggest_<id>`), so there is at most one call per article per device; a failure falls back to two generic questions. Every client string is clipped before it reaches the prompt. Takes **no** `articleId` — the thread's identity lives only in `/api/ask-history`. That is why quiz Ask *streaming* works with a synthetic id while its *persistence* does not |
| `GET/POST /api/ask-history` | GET: `?articleId=`. POST: `{ articleId, messages }` | Per-(article, device) conversation read/full-overwrite. `articleId` must match `/^[a-f0-9]{16}$/` (400 otherwise) **and** already exist in `articles` (500 otherwise, FK enforced) — synthetic quiz ids satisfy neither; see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) |
| `POST /api/push-subscribe` | subscription object | Writes `push_subscriptions` |
| `POST /api/save` | `{ articleId, userNote? }` | Notion dedupe (DB `notion_page_id` cache, else direct Article ID lookup via `findSavePageByArticleId`) + upsert `saves` |
| `POST /api/unsave` | `{ articleId }` | Hard delete the `saves` row (`DELETE`) — never touches `articles` or the Notion page |
| `POST /api/feedback` | `{ articleId, signal: 'up' \| 'down' \| 'clear' }` | `up` / `down`: delete-then-insert `feedback`. `clear` (2026-09-29, swipe undo): only delete this device's row |
| `POST /api/quiz-attempt` | `{ quizId, correct }` | Insert `quiz_attempts`. Since 2026-09-30 the web sends this when the question is answered, not on 「下一題」 |
| `POST /api/quiz-report` | `{ quizId, reason }` | Create `quiz_reports` if missing, then upsert on `(quiz_id, device_id)` |

All Edge routes except `/api/feed` require `X-Device-Id` — every one returns `400 { ok: false, error: 'missing_device_id' }` without it (verified against `api/*.ts`, 2026-08-04). `deviceId` is nullable at the schema level only for rows written before multi-user support landed, not for anything writable today.
