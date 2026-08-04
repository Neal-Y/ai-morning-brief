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

### 🟢 `@expo/vector-icons` used but not a declared dependency

`ArticleCard.tsx`, `LibraryScreen.tsx`, `QuizFrame.tsx` import `{ Feather, Ionicons }` from `@expo/vector-icons`, but it's not in `app/package.json` — only present transitively via `expo`. Works today because Expo pulls it in and Metro hoists it; would break if `expo`'s own dependency on it is ever dropped, or under stricter dependency resolution.

**Fix shape**: add `@expo/vector-icons` to `app/package.json` dependencies explicitly.

### 🟢 Dead fields in the article API contract

`Article.recommendation` (`'READ_NOW'|'SKIM'|'SKIP'`, `types.ts`) is populated by the classifier and shipped in every `/api/feed`/`/api/library` response, but no screen or component reads it — contrast with `renderLevel`, which *does* gate UI (`工程影響`/`深入脈絡` sections). Similarly `LibraryArticle.notionSynced` and `RawArticle.classifiedAt` are declared but unconsumed by any current screen. Not a bug — just payload weight with no reader; worth knowing before "optimizing" the API response shape, since removing them would be safe today.

### 🟢 `device_id` is client-supplied with no auth behind it

`X-Device-Id` is a UUID the app generates and stores in `AsyncStorage` (`app/src/device.ts`) — trivially spoofable, no server-side verification. **This is an accepted tradeoff for a no-account hobby app**, not an oversight. Listed here for visibility, not as a to-do — do not "fix" it by adding auth unless the product actually needs it.

---

## Backend / pipelines

*(none open — add here when found)*
