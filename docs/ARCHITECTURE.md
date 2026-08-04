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
| Cron | `daily_sync.yml`, 07:30 Taipei | `quiz_sync.yml`, 06:00 Taipei |
| Depends on | RSS feeds | Nothing external — pure LLM generation |
| Output table | `articles` | `quizzes` |
| Shared with the other pipeline | `ai/select-provider.ts` (GPT/Claude alternation), same Turso instance | same |

---

## Article pipeline

### Stage 1 — Fetch + Prefilter (`rss/feed.ts`)

1. Filter: `pubDate` within the last 24h.
2. Keyword scoring: positive keywords (llm/gpu/inference/distributed/...) add, negative keywords (event/conference/survey/funding/...) subtract. Weights: `KEYWORD_WEIGHTS` in `config.ts`.
3. `PREFILTER_MIN_SCORE = -2` — below this, discard before it ever reaches the LLM.
4. If nothing survives: send an empty-day Web Push ("今日無重大 AI 新聞") and exit 0 — this is a normal outcome, not a failure.

### Stage 2 — Classifier (`ai/classifier.ts`)

- One LLM call per article, `CLASSIFIER_CONCURRENCY = 3` in flight (free-tier Anthropic/OpenAI TPM headroom).
- Top `CLASSIFIER_CAP` articles by prefilter score are sent (cost lever — see README Cost section).
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
fillers  = if hardTech + signals < BRIEF_MAX: top-scoring DROP articles,
           overridden → bucket=IMPORTANT_AI_SIGNALS, renderLevel=LIGHT, recommendation=SKIM
selected = (hardTech + signals + fillers)[:BRIEF_MAX]   // always fills to BRIEF_MAX = 3
```

Constants (`config.ts`): `HARD_TECH_MAX=2`, `SIGNALS_MAX=1`, `BRIEF_MAX=3`, `CLASSIFIER_CONCURRENCY=3`, `CLASSIFIER_CAP=12`.

### Stage 4 — Brief Generator (`ai/brief.ts`)

Single LLM call for all selected articles.

- **FULL**: summary / context / engineeringImpact / reason all filled. `shortJudgment = null`.
- **LIGHT**: same 4 fields filled (not empty) **plus** `shortJudgment` (≤20 Chinese chars, `[訊號類型]：[具體事實]`) as an *additive* priority badge — not a replacement for the 4 fields.
- **OMIT**: not in `sections`; at most one line in `skippedToday`.
- Failure fallback: `buildDegradedBrief()` assembles `BriefResult` straight from classifier output, no second LLM call.

### Stage 5 — Persist (`notify/db-writer.ts`)

`onConflictDoUpdate` on `articles.url` (never `onConflictDoNothing` — it makes the count log lie about upsert vs insert).

### Stage 6 — Web Push (`notify/web-push.ts`)

Only fires after Stage 5 succeeds (strict serial order — see [../CLAUDE.md](../CLAUDE.md) Conventions). Title = lead story headline. Body line 1 = lead article's `engineeringImpact`. Body line 2 = active section labels + extra count (e.g. `Hard Tech AI · Signals · +2 篇`).

---

## Quiz pipeline

> **Operational status (2026-08)**: the code below is shipped and works, but `quiz_sync.yml` is currently paused manually (not broken — a deliberate cost/usage call, to be re-enabled once daily usage picks up). The existing `quizzes` pool from prior runs keeps serving via the recycle logic in `GET /api/quiz` (see below); it just won't grow until the cron is turned back on. Check current GitHub Actions workflow state, not just this file, before assuming it's running.

### Generation (`quiz/generate.ts`)

One LLM call, `QUIZ_COUNT = 5` questions per run, free mix of 4 types:

| Type | Payload shape | Answer key |
|---|---|---|
| `single_choice` | `{ options: string[4], correctIndex: 0-3 }` | `correctIndex` |
| `ordering` | `{ items: string[3-5] }` | array order **is** the answer — client shuffles for display |
| `matching` | `{ left: string[], right: string[] }` | `right[i]` matches `left[i]` by index — client shuffles `right` |
| `fill_blank` | `{ template: string, blanks: string[], wordBank: string[] }` | template has `{{0}}`, `{{1}}`... placeholders; `wordBank` = blanks + distractors, shuffled client-side |

- Dedup: `getRecentQuizPrompts()` pulls recent question prompts (window/row-count capped by `QUIZ_DEDUP_WINDOW_DAYS`/`QUIZ_DEDUP_MAX_ROWS` in `config.ts`), appended at the **end** of `QUIZ_SYSTEM` as an "AVOID REPEATING" block — same cache-prefix-preserving technique as the classifier's preference context. Do not move it to the start/middle.
- Every generated item is validated (`isValidPayload`) before being accepted — malformed items are dropped with a `console.warn`, not silently coerced. If the whole batch validates to 0 items, the pipeline throws (retried once via `withRetry`, then fails the GitHub Actions run).
- Output language: Traditional Chinese for question text, options, explanations. English retained only for established technical terms.

### Write (`db/quiz-writer.ts`)

Plain insert into `quizzes` — no upsert/dedup at the DB layer; dedup happens earlier, at generation time, via the prompt-steering context above.

### Consumption (app-side)

- `GET /api/quiz` (Hono, read-only) — today's question set.
- `POST /api/quiz-attempt` (`api/quiz-attempt.ts`, Edge) — records `{ quizId, deviceId, correct }` into `quiz_attempts`. `X-Device-Id` required, 400 without it.
- Ask follow-up on a quiz question reuses the article Ask infrastructure via a synthetic `articleId = quiz-${id}` (see [../CLAUDE.md](../CLAUDE.md) Key Design Decisions #8). The quiz prompt is repurposed as Ask `context.title`, the explanation as `context.summary`, the category as `context.context`.

---

## Database Schema (Turso / libSQL, `src/db/schema.ts`)

No account system. `device_id` (client-generated UUID, `X-Device-Id` header, spoofable — accepted tradeoff, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)) is the only multi-user boundary, present on 5 of 7 tables.

| Table | Key columns | Notes |
|---|---|---|
| `articles` | `id` (SHA-256(url).slice(0,16)) pk, `url` unique, `score`, `renderLevel`, `categoryTag`, `skillTags` (JSON string, unused by classifier today), `briefDate` | No `device_id` — articles are global, not per-user |
| `feedback` | `articleId` fk, `signal` ('up'\|'down'), `deviceId` | delete-then-insert on write — same (device, article) pair only ever has the latest signal |
| `saves` | `articleId` fk, `deviceId`, `notionPageId`, `deletedAt` | unique on `(deviceId, articleId)`. Unsave = soft hide (`deletedAt` set); row and `notionPageId` survive so re-save reuses the same Notion page |
| `conversations` | `articleId` fk (real or synthetic `quiz-${id}`), `deviceId`, `messages` (JSON), `messageCount`, `model` | unique on `(articleId, deviceId)`. Full-overwrite on save, not append-diff. `/api/library` selects `messageCount` only — never loads `messages` |
| `quizzes` | `type`, `category`, `prompt`, `payload` (JSON, shape per `type`), `explanation` | No `deviceId` — quizzes are global, like articles |
| `quiz_attempts` | `quizId` fk, `deviceId`, `correct` | One row per attempt (no unique constraint — a user can retry and log multiple attempts on the same quiz) |
| `push_subscriptions` | `endpoint` unique, `p256dh`, `auth`, `deviceId` | Web Push subscription |

---

## API Contract

### Hono, read-only GET (`src/api/app.ts` → `api/index.ts` on Vercel)

| Route | Query params | Returns |
|---|---|---|
| `GET /api/feed` | `date` (YYYY-MM-DD) | `{ date, articles: RawArticle[] }` |
| `GET /api/library` | — | All-history articles JOINed with feedback/saves/notionSynced/ask-message-count (JS-join, no `messages` JSON) |
| `GET /api/quiz` | `count`, `type` (comma list) | `RawQuizItem[]` |
| `GET /api/activity` | — | `{ streak, heatmap, weekStats, recent, ... }`, scoped by `X-Device-Id` |

### Edge Runtime, body-reading POST (root `api/*.ts` — see [../CLAUDE.md](../CLAUDE.md) Conventions for *why* these can't be Hono routes)

| Route | Body | Effect |
|---|---|---|
| `POST /api/ask` | `{ articleId, context, messages }` | SSE stream, Haiku 4.5 |
| `GET/POST /api/ask-history` | GET: `?articleId=`. POST: `{ articleId, messages }` | Per-(article, device) conversation read/full-overwrite |
| `POST /api/push-subscribe` | subscription object | Writes `push_subscriptions` |
| `POST /api/save` | `{ articleId }` | Notion dedupe (Article ID lookup + sync lock) + upsert `saves` |
| `POST /api/unsave` | `{ articleId }` | Soft-hide (`deletedAt` set) — never deletes the row or the Notion page |
| `POST /api/feedback` | `{ articleId, signal }` | Delete-then-insert `feedback` |
| `POST /api/quiz-attempt` | `{ quizId, correct }` | Insert `quiz_attempts` |

All 7 Edge routes require `X-Device-Id` — every one returns `400 { ok: false, error: 'missing_device_id' }` without it (verified against `api/*.ts`, 2026-08-04). `deviceId` is nullable at the schema level only for rows written before multi-user support landed, not for anything writable today.
