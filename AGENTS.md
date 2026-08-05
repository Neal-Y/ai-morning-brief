# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds two independent scheduled pipelines: the article pipeline (RSS ingestion, AI classification, brief generation, Notion sync, push) entered via `src/index.ts`, and the quiz pipeline (`src/quiz/generate.ts`, `src/db/quiz-writer.ts`) entered via `src/quiz-pipeline.ts`. They run on separate GitHub Actions crons (`daily_sync.yml` 07:30 Taipei, `quiz_sync.yml` 06:00 Taipei) and do not depend on each other.
- `src/api/` contains the local Hono API. It is read-oriented: `GET /api/feed`, `GET /api/library`, `GET /api/quiz`, and `GET /api/activity` live in `src/api/app.ts`.
- Root `api/*.ts` files are Vercel routes. Body-reading POST endpoints are Edge functions: `ask`, `ask-history`, `push-subscribe`, `save`, `unsave`, `feedback`, and `quiz-attempt`.
- `app/` is the React Native app, product name "Sift" (Expo SDK 54, currently in Expo Go closed beta). Four bottom tabs: Quiz, Feed, Library, Activity (`app/src/screens/ActivityScreen.tsx` — a learning-stats dashboard with a heatmap, pie chart, and streak). This is the primary client going forward; `web/` remains the Web Push entry point.
- `web/` is the React PWA: source in `web/src/`, assets and service worker in `web/public/`.
- `web/src/Library.tsx` is the implemented `/library` page; `web/src/router.ts` provides the lightweight pathname router.
- `scripts/` contains helpers like `scripts/seed.ts`.
- `docs/` is split into living specs (kept in sync with code — `ARCHITECTURE.md`, `KNOWN_ISSUES.md`, `PRINCIPLES.md`, `DEPLOY.md`, `FRONTEND_FIX_LOG.md` for `web/`, `FRONTEND_FIX_LOG_APP.md` for `app/`) and `docs/decisions/` (frozen, dated, point-in-time — never edit for new facts). Read `docs/README.md` first; it explains the split and indexes every file.

## Current Product State

- V1 daily brief pipeline is live: GitHub Actions runs the RSS -> LLM -> Turso -> Web Push flow.
- Web Push replaced ntfy. Do not reintroduce ntfy or generated service workers.
- Notion save sync is live via `api/save.ts`; failures should not block in-app saves. Saves are soft-hidden on unsave, and Notion sync uses `Article ID` lookup plus a DB sync lock to avoid duplicate pages. This integration is intentionally left as-is (sunk cost, not actively revisited) — do not expand it without being asked.
- Library is no longer only a plan: `/library`, `/api/library`, filters, expanded rows, AskSheet reuse, save, unsave, Ask count, and per-article Ask history restore are implemented.
- Ask history is persisted in Turso `conversations`: one row per (article, device), capped message JSON, plus `message_count` for lightweight Library indicators. Do not load full conversation bodies in `/api/library`.
- Quiz generation is live and independent of the article pipeline: `src/quiz-pipeline.ts` generates 4 question types (single_choice, ordering, matching, fill_blank) daily via its own cron, with prompt-level dedup against recently asked questions. Quiz answers are recorded via `POST /api/quiz-attempt` into `quiz_attempts`. Quiz follow-up questions reuse the article Ask infrastructure via a synthetic `articleId = quiz-${id}` — do not build a separate ask/conversation system for quiz.
- There is no account system. Multi-user isolation is by `device_id` (a UUID the app generates and stores in AsyncStorage, sent as `X-Device-Id`), present on `feedback`, `saves`, `conversations`, `push_subscriptions`, and `quiz_attempts`. Any new endpoint that writes personalized data should follow this pattern.
- Skill-tag generation (`skillTags` on articles) remains future work.
- Current focus is shipping the Sift app to TestFlight via EAS Build — treat this as the active priority unless told otherwise.

## Build, Test, and Development Commands

Use Node 20+ (`nvm use 20`).

- `npm run dev:api` starts the local Hono API server on port 3001.
- `npm run dev:pipeline` runs the real article pipeline; it can write to Turso and send push notifications.
- `npm run dev:quiz` runs the real quiz pipeline; it can write to Turso (5 questions).
- `npm run typecheck` checks `src/`, `api/`, `scripts/`, and Drizzle config without emitting files.
- `npm run build` compiles the backend pipeline to `dist/`.
- `npm run db:generate`, `db:migrate`, `db:push`, and `db:seed` manage Drizzle and sample data.
- `cd web && npm run dev` starts the Vite app on port 5173.
- `cd web && npm run build` builds the frontend. Run this from the repo root after `nvm use 20`; running directly inside `web/` may pick an older Node.

## Coding Style & Naming Conventions

Use TypeScript ES modules and keep `strict` compatibility. Follow the existing two-space indentation, semicolon, and double-quote style. Name files by feature (`classifier.ts`, `db-writer.ts`, `push-subscribe.ts`) and align Vercel route files with endpoints. Prefer typed helpers for env vars, database rows, and external API responses.

For new API routes, keep GET/read endpoints in Hono only when they do not read a request body. Any POST endpoint that reads a body must be a root `api/<name>.ts` Edge function and must be listed before the `/api/:path*` catch-all in `vercel.json`.

## Testing Guidelines

There is no dedicated test runner yet. Before submitting changes, run `npm run typecheck` and the relevant build. For frontend work, also run `cd web && npm run build`. If adding tests, place `*.test.ts` or `*.test.tsx` near the changed module and add an npm script.

For Library changes, verify `/api/library` shape, `/library` routing, expanded-row content, save/unsave optimistic updates, mobile safe-area behavior, Ask count display, and AskSheet opening/restoring history from an expanded row.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commits, for example `feat: sync saves to notion` and `fix: migrate /api/feedback to edge runtime`. Keep `type: concise imperative summary`.

Pull requests should include the user-facing change, affected routes/modules, required env changes, and verification commands. Include screenshots or recordings for PWA UI changes, especially mobile or standalone mode.

## Security & Configuration Tips

Do not commit `.env`, `.env.local`, API keys, VAPID private keys, Turso tokens, or Notion secrets. Keep browser-exposed variables prefixed with `VITE_`; server secrets belong in GitHub Actions or Vercel.

## Known Constraints & Review Risks

- `/api/library` currently loads all articles, feedback, saves, and conversation message counts, then joins in JS. This is acceptable while data is small; revisit pagination or date windows before 10x history growth. Do not add full `conversations.messages` to this endpoint.
- Unsave is a hard delete (`DELETE FROM saves`, fixed 2026-08-05). An earlier soft-hide design (`saves.deleted_at`) was documented but never actually migrated into the live DB — it silently 500ed every unsave request. Don't reintroduce soft-hide without adding a real migration first; hard delete is safe because Notion dedupe (`findSavePageByArticleId`) checks Notion directly, not the local row. See docs/KNOWN_ISSUES.md for the incident.
- Classifier concurrency is intentionally capped for provider limits. Do not add unbounded LLM calls or retries.
- The service worker in `web/public/sw.js` is only for push and notification click handling. Do not add fetch caching without revisiting the PWA cache history.
- Web Push should only fire after DB persistence succeeds; failed infrastructure should fail the workflow rather than notify stale or missing content.
- `device_id` is client-supplied (`X-Device-Id` header) with no auth behind it — trivially spoofable. This is an accepted tradeoff for a no-account hobby app, not an oversight; do not "fix" it by adding auth without being asked.
- Quiz dedup context (`getRecentQuizPrompts`) and classifier preference context (`buildRecentQuizContext` / `buildPreferenceContext`) must stay appended at the END of their respective system prompts to preserve the stable cache-prefix. Do not move either to the start or middle of the prompt.

## [ADDED CONTENT] Engineering Workflow & Review Framework

Preserve the project rules above. For non-trivial changes, do not code first: analyze the problem, identify affected modules, ask necessary questions, propose 2-3 design options, compare tradeoffs, recommend one, and wait for the user to choose before implementation. For non-trivial code changes, ask the user to do a brief risk review before implementation when it would improve learning: where could this break, concurrency/resource risks, scaling/failure modes. Then add what they missed. Small mechanical fixes may skip the option matrix and risk-review ceremony, but still state the assumption before editing.

Review every design for concurrency, resource usage, failure handling, 10x scalability, and observability. In this repo that means bounded LLM/API concurrency, safe retries, Turso query volume, Web Push behavior, Vercel/Edge routing, mobile PWA cost, clear logs, and no secret leakage.

Act as a mentor: challenge weak assumptions, explain tradeoffs before code, and guide debugging with targeted questions. If the user repeatedly skips reasoning on non-trivial decisions, slow down: push back, ask targeted follow-ups, and prefer a guiding question before giving the recommendation. Do not apply this to simple factual, status, or mechanical requests. Do not blindly agree, do not introduce broad rewrites for narrow problems, and do not add unbounded loops, unbounded provider calls, or POST body handlers in Hono. If Go is introduced later, use `context.Context`, avoid unbounded goroutines, and prefer worker pools.
