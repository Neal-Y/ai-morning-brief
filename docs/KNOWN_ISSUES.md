# Known Issues

> **Status: Living backlog.** Add an item when you spot a real discrepancy between what the code claims and what it does. Remove/check off when fixed — don't let this rot into another stale doc.
>
> Severity is about user-visible wrongness, not code elegance. "Dead field nobody reads" is low; "screen shows a number that's always wrong" is high.

---

## `app/` (Sift, React Native)

### ✅ Fixed 2026-08-04 — Quiz tab streak was hardcoded, not real

`app/src/screens/QuizScreen.tsx:10` used to have `const STREAK = 12`, always rendered as `🔥 12` regardless of the user's actual streak — disagreeing with `ActivityScreen.tsx`, which correctly computed it from `fetchActivity().streak`. Fixed by fetching real `fetchActivity().streak` on mount (best-effort — falls back to `0` if the call fails, never to a fake number).

### ✅ Fixed 2026-08-04 — Feed-screen "saved" state was local-only, disagreed with Library

`app/src/screens/FeedScreen.tsx` tracked bookmark state in local `useState` only, never seeded from the server — previously-saved articles showed as unsaved on every fresh load. Fixed by calling `fetchLibrary()` alongside `fetchFeed()` on mount and seeding the local `saved` Set from `LibraryArticle.saved`. Deliberately reused the existing `/api/library` endpoint rather than adding `saved` to `/api/feed` — `/api/feed` is edge-cached (`s-maxage=300`, shared across all devices) and mixing a per-device field into that response would either poison the shared cache or force dropping the cache entirely; `/api/library` is already `no-store` and device-scoped, so it's the correct place for this data.

### ✅ Fixed 2026-08-04 — `@expo/vector-icons` used but not a declared dependency

Added `@expo/vector-icons` to `app/package.json` dependencies explicitly (was previously resolved only transitively through `expo`).

### 🟡 Quiz fallback only covers `single_choice`

`app/src/data.ts` — if `fetchQuizzes()` fails or returns zero mappable items, `loadQuestions()` falls back to a hardcoded `FALLBACK` array of 3 `single_choice` questions. The app normally serves a free mix of all 4 types; on fallback, `ordering`/`matching`/`fill_blank` silently disappear for that session. File header comment already documents this as "offline/error fallback only, not the primary path" — flagging here so it doesn't get mistaken for a content bug when someone eventually sees an all-single-choice quiz set.

### 🟢 Dead fields in the article API contract

`Article.recommendation` (`'READ_NOW'|'SKIM'|'SKIP'`, `types.ts`) is populated by the classifier and shipped in every `/api/feed`/`/api/library` response, but no screen or component reads it — contrast with `renderLevel`, which *does* gate UI (`工程影響`/`深入脈絡` sections). Similarly `LibraryArticle.notionSynced` and `RawArticle.classifiedAt` are declared but unconsumed by any current screen. Not a bug — just payload weight with no reader; worth knowing before "optimizing" the API response shape, since removing them would be safe today.

### 🟢 `device_id` is client-supplied with no auth behind it

`X-Device-Id` is a UUID the app generates and stores in `AsyncStorage` (`app/src/device.ts`) — trivially spoofable, no server-side verification. **This is an accepted tradeoff for a no-account hobby app**, not an oversight. Listed here for visibility, not as a to-do — do not "fix" it by adding auth unless the product actually needs it.

---

## `web/` (PWA)

### 🟢 `device_id` does not carry across clients (web vs. app)

`web/src/device.ts` stores its UUID under localStorage key `mb_device_id`; `app/src/device.ts` stores its under AsyncStorage key `sift_device_id`. The two were never meant to line up and weren't migrated when the web port shipped (2026-09-07) — a user who used `app/` in Expo Go and then switches to the web PWA starts Activity/streak/saves history from zero. Accepted tradeoff of the no-account design (same shape as `app/`'s `device_id is client-supplied with no auth` entry above), not a bug — listed for visibility only.

### 🟡 Bottom-nav/quiz port verified only in simulated conditions, not on a real installed iPhone PWA (2026-09-07)

The four-tab web port (Quiz/Feed/Library/Activity, see [README.md](./README.md)) was verified with Playwright at an iPhone-13 viewport with a *simulated* 34px bottom safe area: tab switching without a full reload, all four quiz types scoring correct XP with five `POST /api/quiz-attempt` → 200, `Activity` matching `/api/activity` field-by-field, nav rows staying above the home-indicator band at both 0px and 34px insets, and the push-permission gate under emulated standalone mode. The **real installed iPhone PWA has not been checked** — this machine only has Xcode Command Line Tools, no iOS Simulator/device access — and per `FRONTEND_FIX_LOG.md` Issue 6, the installed PWA is the only acceptance target for bottom-chrome layout (`env(safe-area-inset-bottom)` behaves differently in a real installed PWA than in any simulated/emulated viewport). Treat the port as unverified against that guardrail until someone checks it on a real device.

---

## Backend / pipelines

### 🟡 Quiz follow-up history cannot persist to the DB — two independent guards block it (found 2026-09-07)

CLAUDE.md's Key Design Decision #8 and (until this doc's last edit) ARCHITECTURE.md's Quiz pipeline section both describe quiz Ask follow-ups as hanging on the real `conversations` table via a synthetic `articleId = quiz-${id}`. That persistence path has **never actually worked** — verified empirically 2026-09-07, not new behavior from the same-day web port:

1. `api/ask-history.ts`'s `isArticleId` guard is `/^[a-f0-9]{16}$/` — `quiz-6` fails it and the POST 400s with `invalid_article_id`.
2. Even a well-formed 16-hex id that doesn't exist in `articles` still fails: `conversations.article_id` has a foreign key to `articles.id` (`src/db/schema.ts`) that **is actually enforced** by the live DB — POSTing a made-up id like `deadbeefdeadbeef` 500s.

Relaxing the regex alone would not be enough; dropping the FK requires a SQLite table rebuild (create → copy → rename) since SQLite has no `ALTER ... DROP CONSTRAINT`. Not attempted here — docs-only pass.

**Blast radius**: `app/`'s `saveAskHistory` swallows the 400 in an empty `catch {}`, so this has failed **silently** for the entire Expo Go beta — quiz follow-up history has never persisted on `app/`, even though the UI never showed an error. `/api/ask` streaming itself is unaffected on either client (it takes `articleTitle`/`articleSummary`/`articleContext`, never `articleId`) — asking always worked, only the "come back later and see your past questions" persistence was broken.

**Resolution — web only**: `web/src/askHistory.ts` (shipped in the same 2026-09-07 web-port commit) routes quiz threads (`articleId` starting `quiz-`) to `localStorage` under `mb_quiz_ask_quiz-<id>` instead of `/api/ask-history`; article threads are unchanged and still hit the API. Chosen over fixing the backend because reach is equivalent in practice — there's no account system, and `device_id` is itself just a localStorage/AsyncStorage UUID, so server-side history isn't meaningfully more durable than local storage for this app. `app/` was not touched and still has the silent-failure behavior described above.

Same family as the `saves.deleted_at` / `notion_syncing_at` entry below — docs describing more capability than the implementation actually has.

### ✅ Fixed 2026-08-05 — `saves.deleted_at` / `notion_syncing_at` were referenced by code but never existed in the live DB

Discovered when `GET /api/library` started 500ing for every request carrying `X-Device-Id` (i.e. every real app request) after `src/api/app.ts` added a `sql\`deleted_at IS NULL\`` filter. `PRAGMA table_info(saves)` against the live Turso DB showed only `id, article_id, device_id, user_note, notion_page_id, created_at` — no `deleted_at`, no `notion_syncing_at`, even though `src/db/schema.ts` also never declared them (schema.ts was actually correct/honest here). The soft-delete + Notion "sync lock" design was written into `unsave.ts`/`save.ts` and documented as shipped (2026-05-06), but the migration never actually landed in production, and the sync-lock half was never even implemented in `save.ts` — pure doc drift, on top of a pure schema drift.

**Blast radius before the fix**: `GET /api/library` 500ed for every device-scoped request. `POST /api/unsave` had almost certainly been 500ing since deployed (the app's optimistic local UI update just made unsaving *look* like it worked, while the DB write silently failed). `POST /api/save`'s re-save-after-unsave path would also have 500ed.

**Resolution — simplified instead of migrated**: rather than adding the missing columns, `/api/unsave` was changed to a real `DELETE FROM saves` (hard delete). This is safe and simpler because Notion-duplicate prevention was never actually dependent on the DB row surviving — `save.ts`'s real dedupe is (a) reuse `saves.notion_page_id` if present, else (b) query Notion directly via `findSavePageByArticleId(articleId)`, which finds the same page regardless of whether a local `saves` row exists. No migration needed; `deleted_at`/`notion_syncing_at` references removed from `unsave.ts`/`save.ts` entirely. `GET /api/library`'s filter was reverted to match (no `deleted_at` clause — a hard-deleted row just isn't in the table anymore, nothing to filter).
