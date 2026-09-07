# Frontend Fix Log

Last updated: 2026-09-07

Purpose: give the next session a concrete handoff for the mobile/web issues already fixed, why they happened, and what still needs verification on a real phone.

## Scope

Files changed in this stabilization pass:

- `web/src/components/Card.tsx`
- `web/src/components/AskSheet.tsx`
- `web/src/App.tsx`
- `web/src/components/Chrome.tsx`
- `web/src/components/Celebration.tsx`
- `web/src/date.ts`
- `src/api/app.ts`
- `src/date.ts`
- `scripts/seed.ts`

## Issue 1: Card bottom had a large empty gap

### Symptom

On taller mobile screens, the article card showed a large dark gap above the bottom action bar, making the card feel visually detached from the bottom edge.

### Root Cause

`ArticleCard` used a fixed spacer:

- `flex: 1`
- `maxHeight: 40`

That meant only part of the remaining vertical space was consumed before the `Engineering Impact` block. Extra height stayed below the callout instead of being absorbed by layout.

### Risk / User Impact

- The UI looked like a broken RWD layout.
- Different phone heights exaggerated the gap.
- It reduced confidence even though the content itself was correct.

### Fix

Removed the spacer and made the `Engineering Impact` callout pin itself to the bottom with `margin-top: auto`.

### Changed File

- `web/src/components/Card.tsx`

### Validation

- Visual layout check during local review
- `cd web && npm run build` passed

## Issue 2: AskSheet streaming felt laggy and "jumped"

### Symptom

During SSE streaming, the Ask panel kept jumping while the answer was arriving. It felt sticky, jittery, and hard to read on mobile.

### Root Cause

Two things combined badly:

1. Every SSE chunk triggered `setMessages`, so React re-rendered on nearly every token burst.
2. Every message update also triggered `scrollIntoView({ behavior: 'smooth' })`, so streaming caused repeated smooth-scroll animations.

### Risk / User Impact

- Streaming felt broken even though the backend worked.
- Mobile browsers amplified the jank.
- Reading mid-answer was unpleasant.

### Fix

Changed AskSheet rendering and scroll behavior:

- buffered streaming text in a ref
- flushed UI updates with `requestAnimationFrame`
- only auto-scrolled when the user was already near the bottom
- used `auto` scroll during active streaming instead of repeated smooth scroll
- added `overflowAnchor: 'none'` and `overscrollBehavior: 'contain'`

### Changed File

- `web/src/components/AskSheet.tsx`

### Validation

- local interactive test
- `cd web && npm run build` passed

## Issue 3: Ask request kept running after the sheet was closed

### Symptom

If the user closed Ask mid-stream, the old request could keep running and continue writing into UI state.

### Root Cause

The fetch in `AskSheet` had no cancellation path. Closing the sheet only hid the component visually; it did not abort the in-flight request.

### Risk / User Impact

- stale replies could leak into the next open
- background work continued unnecessarily
- hidden UI state could mutate after close

### Fix

Added `AbortController` handling:

- abort active request on close
- abort active request on article change
- abort on component unmount
- drop the pending assistant placeholder when a close happens mid-stream

### Changed File

- `web/src/components/AskSheet.tsx`

### Validation

- logic review
- `cd web && npm run build` passed

## Issue 4: Feed date could be wrong because of UTC date generation

### Symptom

The app and API used `new Date().toISOString().slice(0, 10)` to generate the "today" date. For a Taipei-based morning brief, that can point at the wrong day around timezone boundaries.

### Root Cause

`toISOString()` is UTC. The product is conceptually tied to Taipei day boundaries.

### Risk / User Impact

- frontend could request the wrong `briefDate`
- `/api/feed` fallback could query the wrong day
- local `db:seed` could write fake articles under the wrong date

### Fix

Added explicit Taipei date helpers and replaced UTC string slicing in:

- frontend feed request
- backend `/api/feed` fallback
- local seed script

### Changed Files

- `web/src/date.ts`
- `src/date.ts`
- `web/src/App.tsx`
- `src/api/app.ts`
- `scripts/seed.ts`

### Validation

- type/build validation
- root `npm run build` passed
- `cd web && npm run build` passed

## Issue 5: Celebration screen showed hardcoded read count

### Symptom

The end-of-edition screen always showed `READ = 3` regardless of the actual number of articles.

### Root Cause

The value was hardcoded in the UI component.

### Risk / User Impact

- the summary screen became false as soon as article count changed
- it weakened trust in the product metrics

### Fix

Made the celebration component receive:

- `readCount`
- `briefDate`

and render real values instead of hardcoded placeholders.

### Changed Files

- `web/src/components/Celebration.tsx`
- `web/src/App.tsx`

### Validation

- type/build validation
- `cd web && npm run build` passed

## Issue 6: Persistent small bottom gap in standalone iPhone PWA

### Symptom

When comparing Safari and the installed PWA side by side:

- the bottom action bar sat at almost the same vertical position in both
- in Safari, the browser toolbar visually filled the lower area
- in standalone PWA, that same area appeared as a small black gap under the action bar

Important distinction:

- this is not the earlier card-content spacing bug
- the remaining gap is at the app shell / footer / safe-area level

### Root Cause

Still not fully confirmed.

What is confirmed now:

- the bottom area is not a fake Safari gray strip; the app can paint into it
- the remaining visual problem is specifically that the action buttons still sit too high inside the standalone PWA
- this is not the earlier card-content spacing bug

Current best hypothesis:

- iOS standalone PWA bottom safe-area behavior is still constraining the footer layout in a way that differs from Safari-in-browser
- some earlier fixes only changed the footer background, not the actual button position
- `FeedbackBar` visual spacing and standalone safe-area behavior are interacting, so changing only one layer has not been enough

### Risk / User Impact

- bottom action bar looked detached from the real screen bottom
- Safari and PWA behaved inconsistently
- it creates the false impression that content spacing is still broken

### Attempted Fixes

The following were already tried:

- sizing the whole app shell from `visualViewport.height` / `innerHeight`
- rolling the root app shell back to CSS `100dvh`
- switching the app shell to `position: fixed; inset: 0`
- tightening bottom safe-area padding for `FeedbackBar` and `AskSheet`
- pushing a fixed footer downward with negative `bottom` offsets
- extending the outer app wrapper past the bottom safe area
- converting `FeedbackBar` from an overlay `position: fixed` footer into a normal in-flow layout footer
- painting the bottom safe area while separately trying to sink the button row deeper into it

### Current Status

Resolved on 2026-04-28 from installed iPhone PWA screenshots.

Earlier we incorrectly marked this resolved, then reopened it after device screenshots showed the remaining standalone PWA issue was real:

- the bottom area was painted with app background
- but the action buttons still visually floated above it
- Safari and standalone PWA did not match in a satisfying way

Final accepted interpretation:

- `100dvh` in iOS standalone can stop at the top of the bottom black/safe-area band
- fixed-position footers are bounded by that clipped dynamic viewport
- pushing fixed controls below that boundary clips them
- the working model is to extend the root app height by the bottom safe-area inset, then place the footer as an absolute layer inside that extended root

Final implementation:

- `web/src/index.css` extends root height to `calc(100dvh + env(safe-area-inset-bottom, 0px))`
- `#root` is positioned relative, so the absolute app shell uses the extended root as its containing block
- `web/src/App.tsx` uses an absolute full-height outer app layer instead of `position: fixed; inset: 0`
- the button row renders outside the inner app shell that has `overflow: hidden`
- a non-interactive dock surface sits behind the button row with a subtle top rule, restoring separation between card content and bottom chrome
- the button row uses absolute positioning in the extended outer app layer with `FEEDBACK_BAR_BOTTOM = 56`
- `FeedbackBar` buttons use a uniform 44px minimum height, tighter radius, softer 1px border at 0.7 opacity, and a deep inactive fill so they read as dock controls instead of oversized floating outline buttons
- `ArticleCard` receives a measured bottom inset only when the card body is tall enough that footer controls could cover content; short content does not get artificial bottom padding

### Experiment Timeline / Pitfalls

This issue consumed several rounds of experiments. Record them explicitly so the next session does not repeat the same path.

- `057cacd update borderTop`
  - visual polish only
  - removed some "separate floating panel" feeling from the footer
  - did **not** solve the standalone PWA bottom-gap problem
- `8cf55d4 test app bottom`
  - outer app wrapper was extended past the bottom safe area
  - useful as a diagnostic only
  - result: changing the outer shell alone did not make the action buttons occupy the bottom space
- `6d4583b test: negative bottom offset to push feedback bar past safe-area`
  - tried the aggressive fixed-footer approach: negative `bottom` on the footer
  - result: iOS did let the footer move, but the buttons could be pushed partly off-screen
  - lesson: negative offset is real, but unsafe without compensating layout
- `1dd8a98 test: pad bar bottom by safe-area + 12 to keep buttons on screen`
  - compensated the negative offset with extra bottom padding
  - result: the UI visually snapped back close to baseline
  - lesson: this mostly repainted or rebalanced the footer instead of achieving the desired "buttons live lower" effect
- `8481551 fix: remove app wrapper safe-area offset`
  - removed an experimental outer-wrapper safe-area offset that had too much blast radius
  - lesson: changing the app shell coordinate system without changing footer ownership is noisy and hard to reason about
- `0da29a0 refactor: move app feedback bar into layout flow`
  - major refactor: `FeedbackBar` stopped being `position: fixed` and became a normal in-flow footer
  - removed the `feedbackBarHeight` / `ResizeObserver` / `bottomInset` plumbing that only existed to support an overlay footer
  - result: cleaner layout model, but the installed PWA still showed the buttons visually too high
  - lesson: the issue is not only "fixed vs in-flow"; the footer's own spacing still matters
- `36a8451 tweak: sink app feedback bar deeper into safe area`
  - reduced explicit safe-area preservation and added a downward shift
  - result: some movement, but still not enough to count as fixed from the product point of view
  - lesson: partial sinking can change the background more than it changes the perceived button position
- local working-tree experiment on 2026-04-28, earlier
  - removes footer safe-area preservation almost entirely and leaves `paddingBottom: 4`
  - goal: stop merely painting the lower area and actually place the controls into it
  - status: superseded by the extended-root dock approach
- local working-tree experiment on 2026-04-28, current
  - extends `html` height to `100dvh + env(safe-area-inset-bottom)`
  - sets `#root { position: relative; }` so absolute app positioning is anchored to the extended root
  - moves outer app ownership from `position: fixed; inset: 0` to an absolute full-height app layer
  - adds a `pointerEvents: none` dock surface behind the footer with a subtle top border
  - positions the button row as `position: absolute; bottom: FEEDBACK_BAR_BOTTOM` inside that extended outer layer (`56px` after real-device tuning)
  - tunes `FeedbackBar` button styling for a more dock-like control row: uniform 44px height, smaller radius, softer 0.7-opacity border, and deep inactive fill
  - `bottom: 12px` successfully entered the bottom area but sat too low on the real device; `24px` improved but still felt low; `48px` was close, and real-device tuning settled on `56px` to avoid the rounded screen corner clipping feeling
  - this supersedes fixed-position attempts, which either stopped at the top of the bottom band or clipped when moved below it
  - avoids the earlier failed pattern where negative safe-area offset plus compensating padding either cancelled itself out or risked clipping the controls
  - restores measured card bottom reserve via `feedbackBarHeight`, but `ArticleCard` only applies it when content would otherwise collide with the footer
  - status: accepted from installed iPhone PWA screenshots; build passed

### Wrong Assumptions Already Debunked

- "This is just the old card-content gap again."
  - false. The card-content gap and the bottom action-bar float are separate issues.
- "If the bottom area is painted, the controls are already using it."
  - false. We proved the app can paint that area while the buttons still sit visibly above it.
- "Changing only `paddingBottom` on a fixed footer should be enough."
  - false. Several rounds showed footer padding alone mostly changes the background relationship, not the product-perceived button position.
- "Changing only the outer app wrapper should drag the footer with it."
  - false in any useful sense. The footer behavior has to be reasoned about directly.
- "This was resolved on 2026-04-23."
  - false. That resolution was based on an incorrect read of screenshots and must not be trusted.

### Related Refactors

These changes were part of the investigation and should be remembered, even if the visual bug remains open:

- footer ownership moved from overlay/fixed to in-flow layout in `web/src/App.tsx`
- the old card/footer coupling was simplified by removing:
  - `feedbackBarHeight`
  - `feedbackBarRef`
  - `ResizeObserver` used only for footer overlay spacing
  - `bottomInset` passed into `ArticleCard`
- `web/src/components/Card.tsx` is therefore cleaner now, even though the visual PWA footer bug is still unresolved

### Next Session Guardrails

Before trying new code, keep these constraints in mind:

- judge success only from the installed iPhone PWA launched from the home screen
- Safari-in-browser is useful as a comparison reference, but not the acceptance target
- do not mark this fixed just because the bottom area is painted
- acceptance condition is stricter:
  - the action buttons must no longer read as floating above a conspicuous empty band
  - the installed PWA should look materially closer to a native bottom bar
- if a change only alters background color or shell height while the perceived button position stays the same, count it as a non-fix

### Changed Files

- `web/src/App.tsx`
- `web/src/components/Chrome.tsx`
- `web/src/components/AskSheet.tsx`
- `web/src/components/Card.tsx`
- `docs/FRONTEND_FIX_LOG.md`

### Validation

- multiple Safari vs standalone screenshots reproduced the issue after earlier "resolved" assumptions
- current status is based on real installed iPhone PWA screenshots from 2026-04-28
- `cd web && npm run build` passed after each footer experiment

### Amendment (2026-09-07): bottom-nav port transferred ownership of the safe-area band

`ebf73c6` added a bottom tab bar (`BottomNav.tsx`) to the web PWA (Quiz/Feed/Library/Activity), and it slots into the exact model this issue established — extended root (`html` at `100dvh + env(safe-area-inset-bottom)`, `#root { position: relative }`), bottom chrome as an absolute layer inside that extended root. `BottomNav` is that absolute layer now: `bottom: 0`, `padding-bottom: env(safe-area-inset-bottom)`, `z-index: 50`. It owns the bottom safe-area band and home-indicator clearance.

Because of that, **`FEEDBACK_BAR_BOTTOM = 56`** — the constant this issue tuned against a real device specifically to clear the home indicator — **no longer exists** in `web/src/App.tsx`. If you go looking for it, this is why. The feedback dock now sits a small fixed gap above the nav (`FEEDBACK_BAR_GAP = 14`, positioned as `bottom: navInset + FEEDBACK_BAR_GAP`), and the old fixed `FEEDBACK_DOCK_HEIGHT = 112` was replaced by a height computed from the nav's measured bar height (`navInset`, published via `NavInsetContext` in `Shell.tsx`).

This does not change the experiment history, the debunked assumptions, or the acceptance model above — it only moves who is responsible for the bottom safe-area band. See Issue 16 for a `ResizeObserver` pitfall in how that height gets measured, and Issue 17 for a layered z-index consequence.

## Issue 7: Header date should match the brief date, not device-local "now"

### Symptom

The top chrome date was derived from the current device date instead of the actual `briefDate` being viewed.

### Root Cause

The header rendered `new Date()` directly.

### Risk / User Impact

- header could disagree with the feed date
- it became especially misleading around timezone edges or if historical dates are loaded

### Fix

Formatted the header date from the resolved `briefDate` and passed it down from `App`.

### Changed Files

- `web/src/components/Chrome.tsx`
- `web/src/App.tsx`
- `web/src/date.ts`

### Validation

- build validation passed

## Issue 8: AskSheet always visible on initial load + ✕ not closeable

### Symptom

On launch, the AskSheet slide-up panel appeared immediately instead of being hidden. Tapping ✕ did nothing.

### Root Cause

Two separate bugs:

1. `transform: translateY(100%)` was not clipped by `overflow: hidden` on the parent — transforms create a new stacking context that can escape the overflow boundary.
2. AskSheet was nested inside the touch-handler `div`. iOS intercepted all pointer events for swipe, so ✕ never received its tap.

### Fix

- Changed AskSheet to mount/unmount: component returns `null` when not open, so it is never in the DOM when closed.
- Added `entered` state + `requestAnimationFrame` to drive the slide-up CSS transition after mount (mounts at `translateY(100%)`, rAF triggers `translateY(0)`).
- Moved AskSheet and overlay `div` **outside** the touch-handler `div` in `App.tsx`.

### Changed Files

- `web/src/components/AskSheet.tsx`
- `web/src/App.tsx`

### Validation

- Interactive test on device
- `cd web && npm run build` passed

---

## Issue 9: LESS / MORE button caused card to freeze

### Symptom

Tapping LESS or MORE froze the card. The next card never appeared.

### Root Cause

`registerFeedback` was `async` and `await`-ed the `/api/feedback` POST before calling `advance()`. On Vercel cold-start, the POST could take 2-4 seconds, blocking the transition.

### Fix

Removed `async`/`await`. Feedback POST is now fire-and-forget (`.catch(() => {})`); `advance()` is called immediately.

### Changed File

- `web/src/App.tsx`

### Validation

- Tapping LESS / MORE now advances instantly
- `cd web && npm run build` passed

---

## Issue 10: UI polish — loading animation, thinking dots, rounded corners, safe areas

### Changes

- **Loading page**: "The Morning Brief" title now breathes (`opacity` + `scale` keyframe) instead of a static `loading...` string.
- **AskSheet thinking state**: three bouncing dots inside the assistant bubble (`dotBounce` keyframe) instead of plain text.
- **Rounded corners**: all buttons and inputs changed `borderRadius: 2 → 8`; AskSheet top corners `borderRadius: 16`.
- **Safe areas**: `env(safe-area-inset-top)` on TopChrome, `env(safe-area-inset-bottom)` on FeedbackBar and AskSheet input area.
- **Viewport**: `viewport-fit=cover` added to `web/index.html` so safe-area env vars resolve correctly.

### Changed Files

- `web/src/index.css` (new keyframes: `breathe`, `dotBounce`)
- `web/src/components/AskSheet.tsx`
- `web/src/components/Chrome.tsx`
- `web/index.html`

### Validation

- `cd web && npm run build` passed

---

## Issue 11: ASK response very slow or erroring out

### Symptom

After tapping ASK and submitting a question, the response took 10+ seconds and often returned "抱歉，發生錯誤，請再試一次。"

### Root Cause

The `/api/ask` route ran as a Node.js serverless function on Vercel with a 10-second max execution time. The Anthropic SDK was also not guaranteed to stream correctly in that runtime.

### Fix

Rewrote `api/ask.ts` as a **Vercel Edge Runtime** function (`export const config = { runtime: 'edge' }`):

- Raw `fetch` to `https://api.anthropic.com/v1/messages` — no SDK dependency.
- `TransformStream` converts Anthropic's SSE format (`content_block_delta`) into the simpler `data: <json text>\n\n` format the frontend reads.
- Edge Runtime has no 10-second timeout and provides native streaming.

Added explicit route in `vercel.json` so `/api/ask` matches before the Hono catch-all.

### Changed Files

- `api/ask.ts` (rewritten)
- `vercel.json`

### Validation

- `npm run build` passed
- Deployed to Vercel; user to confirm speed improvement on device

---

## Issue 12: Standalone PWA — large empty area in middle of card

### Symptom

In standalone PWA (added to iPhone home screen), a large empty gap appeared between the article body (Reason line) and the Engineering Impact callout box. The same content in Safari browser showed no visible gap.

### Root Cause

The card used `margin: 'auto 16px 16px'` on the Engineering Impact block. `margin-top: auto` causes it to pin to the bottom of the flex container.

In Safari, the browser toolbar (~50px) reduces available card height, so the auto-margin is small and looks fine. In standalone PWA, that toolbar space becomes usable card area — the card is taller, and `margin-top: auto` distributes all extra height as a gap between the body content and Engineering Impact.

### Fix

Changed `margin: 'auto 16px 16px'` → `margin: '12px 16px 16px'`. Engineering Impact now flows immediately after the Reason bar. Extra space (if any) moves to the very bottom of the card, where it reads as intentional whitespace, not a broken layout.

### Changed File

- `web/src/components/Card.tsx`

### Validation

- Safari vs standalone screenshots: gap moves from middle of card to bottom
- `cd web && npm run build` passed

---

## Issue 13: Celebration page dark band at bottom

### Symptom

The end-of-day Celebration screen ("That's it for today") had a persistent dark color stripe at the very bottom, below the stats cards, when running as a standalone iPhone PWA. The band was darker than the main card background and could not be removed by padding adjustments.

### Root Cause

Two layered issues:

1. **Perspective ancestor**: Celebration was originally rendered inside a parent `div` with `perspective: 1200px`. A `perspective` creates a new stacking context and containing block for `position: fixed` children, so `position: fixed; inset: 0` was clipped to that ancestor, not the true viewport.
2. **Background color mismatch**: After moving Celebration out of `perspective`, the `html` and `body` still had hardcoded `background: #14110D` (T.bg) while the Celebration used `#1F1B15` (T.card). Any gap in iOS PWA fixed-positioning let the body background show through.

### Risk / User Impact

- The dark band looked like a visual glitch in the PWA.
- It undermined user confidence in the end-of-session summary screen.
- The band persisted even when adjusting padding, making it hard to debug.

### Fix

Three-layer fix:

1. Moved `<Celebration>` to a React root-level Fragment, fully outside the main app wrapper. No ancestor has `overflow: hidden`, `perspective`, or `transform`, so `position: fixed; inset: 0` now truly covers the viewport.
2. Main app wrapper uses `visibility: atCelebration ? 'hidden' : 'visible'` so it never competes for space.
3. Added a `useEffect` in `App.tsx` that syncs `document.documentElement.style.background` and `document.body.style.background` to `T.card` when `atCelebration`, `T.bg` otherwise. This is the final safety net — even if iOS PWA has fixed-positioning quirks, the underlying html/body is the same color as the content.

Also refactored Celebration layout:
- header stays at top
- stats cards vertically centered in `flex: 1; justifyContent: center`
- footer pinned at end
- added `paddingTop: 'max(40px, env(safe-area-inset-top))'` and `paddingBottom: 'max(24px, env(safe-area-inset-bottom))'` for safe-area respect

### Changed Files

- `web/src/App.tsx`
- `web/src/components/Celebration.tsx`
- `web/src/index.css`

### Validation

- Visual inspection: dark band no longer appears
- Safe area insets properly respected on both iPhone top notch and bottom home indicator
- `cd web && npm run build` passed

---

## Issue 14: iOS standalone PWA "框框" (theme_color seam) + stale SW cache

### Symptom

On iPhone home-screen PWA only (not Safari), a thin color band appeared around the status bar area / edges of the app — visibly a different shade from the dark app body. Users also reported that pushing a new build + swiping the app away + reopening did not pick up the new version consistently.

### Root Cause

Three overlapping problems in the PWA layer:

1. **Conflicting manifests**. `web/index.html` explicitly linked `/manifest.json` (the static one in `web/public/`), but `vite-plugin-pwa` was ALSO injecting a second `<link rel="manifest" href="/manifest.webmanifest">` into the same HTML at build time. iOS would pick one or the other depending on UA/version.

2. **Three different `theme_color` values across the build output**:
   - `<meta name="theme-color" content="#0f172a">` in `index.html` (slate-900)
   - `/manifest.json`: `#0F1923` (dark teal)
   - `/manifest.webmanifest` (VitePWA-generated): `#0f172a`
   The actual app body is `T.bg = #14110D` (warm dark brown). In standalone mode iOS paints the status bar background from `theme_color` — none of the three matched the app, so a visible seam appeared around the top edge.

3. **Stale service worker**. VitePWA configured `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` and auto-injected `/registerSW.js` in the built HTML. This registered a Workbox SW that precached the wrong `/manifest.webmanifest` + missing `/icon-192.png` + `/icon-512.png`. Even after pushing new builds, the SW could serve cached assets, making updates feel unreliable.

The app is a once-a-day read — it has no offline use case. The entire PWA plugin was providing negative value.

### Risk / User Impact

- Visible color seam around the status bar in standalone mode broke the "native app" illusion.
- Pushes did not reliably reach the user's installed PWA — they'd swipe away the app, reopen, and still see the old version.
- Frontend changes were getting debugged against an SW-cached stale copy instead of fresh code.

### Fix

1. **Removed `vite-plugin-pwa`** entirely (`npm uninstall vite-plugin-pwa` + deleted plugin from `vite.config.ts`).
2. **Unified `theme_color` / `background_color` on `#14110D`** in both `index.html` meta tag and `web/public/manifest.json` so the static manifest is the single source of truth and matches the app's real `T.bg`.
3. **Added a self-unregistering service worker** at `web/public/sw.js`. When an existing home-screen PWA checks `/sw.js` for updates, it fetches this new content, installs it, and its `activate` handler wipes all caches and calls `self.registration.unregister()`, leaving the browser SW-free.
4. **Belt-and-suspenders cleanup in `main.tsx`**: on every page load, `navigator.serviceWorker.getRegistrations()` is walked and each entry is unregistered, and `caches.keys()` entries are deleted. No-op once nothing's left to clean.

### Changed Files

- `web/vite.config.ts` — plugin removed, documented why
- `web/index.html` — `theme-color` → `#14110D`
- `web/public/manifest.json` — `theme_color` + `background_color` → `#14110D`
- `web/public/sw.js` — new, kill-switch SW
- `web/src/main.tsx` — unregister/clear-caches on every load
- `web/package.json` — `vite-plugin-pwa` dep removed

### Validation

- `cd web && npm run build` passes
- Built `dist/` no longer contains `manifest.webmanifest`, `registerSW.js`, `workbox-*.js`, or any VitePWA-generated assets
- `dist/index.html` contains exactly one `<link rel="manifest">` and one `<meta name="theme-color">`, both aligned on `#14110D`

### Real-device follow-up

Existing PWA installs may need one or two foreground cycles for the kill-switch SW to activate. If a user still sees the framed/stale behavior after pushing:

1. Foreground the installed PWA, wait ~5s (this triggers the SW update check), then kill + reopen.
2. If still stale, long-press home-screen icon → Remove app → re-add to home screen.

The kill-switch is idempotent, so even repeated runs are safe.

---

## Issue 15: Swipe feedback was never recorded (bare `fetch` vs `apiFetch`, 400 swallowed by `.catch`)

### Symptom

None visible in the UI — swiping a card left/right (👍/👎) appeared to work normally: the card advanced immediately, exactly as if the vote had been recorded.

### Root Cause

Two things stacked, and together they meant swipe feedback was never written to the DB at all:

1. `App.tsx`'s `onPointerUp` swipe branch called bare `fetch('/api/feedback', …)` directly, while the button path (`registerFeedback`) called `apiFetch(…)`. Only `apiFetch` attaches the `X-Device-Id` header.
2. `api/feedback.ts` requires that header and rejects its absence outright: `if (!deviceId) return jsonResponse({ ok: false, error: 'missing_device_id' }, 400)`. Confirmed against production with curl — POST without `X-Device-Id` returns `{"ok":false,"error":"missing_device_id"}` / HTTP 400; the same POST with the header returns `{"ok":true}` / HTTP 200.

The swipe branch's call was `fetch('/api/feedback', {...}).catch(() => {})`. A 400 is a **resolved** promise, not a rejected one — `.catch` never fires, and the response body/status was never inspected. So no unattributed row was written; **no row was written at all**. Swiping is the primary way feedback is given on the Feed, so the main path contributed nothing to `feedback` since the `missing_device_id` guard landed. Only the button path (`registerFeedback`, using `apiFetch`) ever actually recorded a vote. This was a pre-existing bug, not introduced by the Quiz/Activity port in `ebf73c6` — it just got noticed during that pass.

### Risk / User Impact

- Silent total data loss on the primary feedback path: no error, no visual sign, card behavior identical to success.
- Downstream consequence: `src/db/client.ts`'s `getRecentFeedback()` feeds the classifier's preference context (last 30 days / 20 rows / threshold 10, per CLAUDE.md). Because web swipe votes never landed, that context has only ever learned from web button-press votes plus whatever `app/` sent — historical web swipe feedback is simply absent and cannot be recovered. Worth knowing before reading meaning into the current preference signal, or concluding the cold-start threshold was never reached because engagement was low (it may just be uncounted).
- For completeness: `/api/library` selects feedback scoped `where(eq(feedback.deviceId, deviceId))` (`src/api/app.ts`), so even a hypothetical device-less row would have been invisible to every device — but that's moot here since the insert never happened.

### Fix

Use `apiFetch` in the swipe branch too, matching the button path.

### Changed File(s)

- `web/src/App.tsx`

### Validation

- A Playwright touch-drag on the Feed produced `POST /api/feedback` carrying `X-Device-Id`; before the fix, the header was absent on the same interaction.

### Guardrail

In `web/`, never call bare `fetch` for an app API route. `apiFetch` is the only thing that attaches `X-Device-Id`, and endpoints like `api/feedback.ts` reject a missing header with a 400 — but `.catch()` alone does not surface a non-2xx response: a resolved promise with `ok: false` is indistinguishable from success unless `res.ok` (or the response body) is actually checked. A silent 400 looks exactly like a working feature. Grep for `fetch(` (not `apiFetch(`) hitting `/api/*` before shipping anything that touches request plumbing, and never treat `.catch(() => {})` as a substitute for checking `res.ok`.

---

## Issue 16: `ResizeObserver` on the bottom nav never fired for safe-area changes

### Symptom

With a bottom safe-area inset simulated, the Feed action row overlapped the top of the bottom nav by roughly 20px (measured: nav top at 609px, action buttons spanning 585–629px).

### Root Cause

`Shell.tsx` measures the bottom nav's height and publishes it through `NavInsetContext` (needed because `env(safe-area-inset-bottom)` isn't readable as a number from JS, and consumers like `ArticleCard` need a real px value to lay out against). The observer was registered as `ro.observe(el)` — the default observed box is `content-box`. The nav's height changes come entirely from `padding-bottom: env(safe-area-inset-bottom)`, and padding does not move the content box, so the callback never fired when the inset appeared/changed, and `navInset` stayed at its stale pre-inset value (0, on first mount before any inset was known).

### Risk / User Impact

- The initial `useLayoutEffect` measurement is correct on a real iOS device (the inset already exists at first paint), so this mostly bites on inset changes **after** mount — orientation change, or any other event that alters the safe-area inset mid-session.
- It also silently defeated any test harness that simulates the inset after the component has already mounted, which is exactly how this was caught.

### Fix

`ro.observe(el, { box: 'border-box' })`, so padding-driven size changes are observed.

### Changed File(s)

- `web/src/Shell.tsx`

### Validation

- After the fix, no control straddles the nav; the lowest control's bottom sits at 595 against a nav top of 609 — the intended 14px (`FEEDBACK_BAR_GAP`) gap.

### Guardrail

When observing an element whose size is driven by padding or border (safe-area padding especially — `env(safe-area-inset-*)` is exactly this pattern), you must pass `{ box: 'border-box' }`. The default `content-box` observation mode silently observes nothing for padding-only size changes — no error, the callback just never fires.

---

## Issue 17: Full-screen AskSheet assumed its host was exactly `100dvh`

### Symptom

Opening 追問 (Ask) from a quiz question pushed the sheet's header (title + ✕ close button) off the top of the screen. The sheet could not be closed.

### Root Cause

`AskSheet.tsx`'s `fullScreen` mode hardcoded `height: '100dvh'` with `position: absolute; bottom: 0`. In `Library.tsx`, the host is a `position: fixed; inset: 0` wrapper that is itself viewport-sized, so `100dvh` happened to fit exactly. Inside the new `QuizFrame` (added by the Quiz port), the host is shorter than the dynamic viewport, so a `100dvh`-tall box anchored to the host's bottom pushed its top to a negative offset — off-screen.

### Risk / User Impact

- The sheet was unclosable on the Quiz tab: the ✕ button was rendered above the visible viewport, with no way to dismiss short of reloading.

### Fix

In `fullScreen` mode, pin `top: 0` in addition to `bottom: 0` and let height follow the host instead of hardcoding `100dvh`. Library is unaffected — its host is already viewport-height, so the computed result is identical there.

Related, same change: `AskSheet`'s `z-index` went 30 → 60 (and Library's wrapper 30 → 60, `App.tsx`'s scrim 25 → 55) so the sheet renders above the bottom nav's `z-index: 50` — the sheet is meant to be a full modal takeover regardless of which tab it's opened from.

### Changed File(s)

- `web/src/components/AskSheet.tsx`
- `web/src/Library.tsx`
- `web/src/App.tsx`

### Validation

- Manual check: AskSheet opened from `QuizFrame` now shows its header and is closeable; Library's AskSheet behavior unchanged (same computed geometry as before).

### Guardrail

A component that can be hosted inside more than one layer (a viewport-sized fixed wrapper in one place, a shorter in-page container in another) must size itself from its host (`top`/`bottom`/`inset`), not from a viewport unit like `100dvh` or `100vh`. Viewport units are only safe when you've verified every current and future host is itself exactly viewport-sized — which is not a property you can rely on staying true.

---

## What Was Intentionally Not Changed

- `lastReadAgo="today"` in the header is still a placeholder string. It is cosmetic, not a correctness bug.

## Verification Commands

```bash
source ~/.nvm/nvm.sh && nvm use 20
npm run build

cd web
source ~/.nvm/nvm.sh && nvm use 20
npm run build
```

## Recommended Real-Device Checks

1. Open Ask, wait for streaming, then close it mid-response.
2. Reopen Ask immediately and confirm no stale answer continues.
3. Focus the Ask input and type on a real phone — confirm no keyboard/viewport jitter.
4. Confirm card shows no large mid-card gap in standalone PWA mode.
5. Confirm today's feed loads under Taipei date assumptions.
6. Confirm ASK response arrives in a few seconds (Edge Runtime).
