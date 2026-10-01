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

## Issue 18: "Signal" visual redesign (2026-09-29)

### Symptom

Not a bug: the user was tired of the warm-brown / ember / newspaper-outline look. Two real defects surfaced while reviewing it: the home-screen icon (ink navy + amber funnel) didn't match the app's palette, and `inkFaint` labels were 3.2:1 on `bg` and 2.9:1 on `card`, below 4.5:1.

### Fix

Picked from three mocked-up directions (design canvas, option A):

- **Palette** (`web/src/theme.ts`): `bg #0B121A`, `card #131C26`, `raised #1A2531`, `ink #EAF0F6`, `inkFaint #7C8CA0` (≥4.5:1 on both surfaces), `accent #F5A524` with dark `onAccent` text, `positive #3DD68C`, `negative #FF6B6B`. Dead `THEME_LIGHT` / `ACCENT_PRESETS` and the never-written `localStorage.accent` override were removed. `TAG_COLORS` became dark-friendly hues; article chips are now a coloured dot + label.
- **Materials**: inset rounded cards (`CARD_FRAME` in `App.tsx`, radius 24), tonal borderless buttons with an inset top highlight, a frosted-glass feedback capsule and bottom nav (`backdrop-filter: blur(24px) saturate(160%)`, with the `-webkit-` prefix). The old full-width opaque dock surface behind the feedback row is gone; the capsule carries its own glass.
- **Native feel** (`index.css`): no tap highlight, no text selection / callout on buttons, nav and links, `overscroll-behavior: none` on html, `.btn-press` gets an eased scale + brightness, and reduced-motion disables it.
- 🔥⚡ emoji replaced with SVG glyphs (`components/icons.tsx`).
- `theme-color` meta, manifest `theme_color` / `background_color` and the html/body background in `index.css` all moved to `#0B121A` together (Issue 14 rule).

**Not changed**: fonts, the Issue 6 layout model (extended root, absolute nav at `bottom: 0`, dock at `navInset + FEEDBACK_BAR_GAP`), `sw.js`, and `app/` (still on the old palette).

### Typography pass (2026-09-29, same day)

- Minimum text size is now 11px (was 8–10px mono labels), except the heatmap axis labels, which must fit a 10px cell.
- Letter spacing capped at 1px on Latin uppercase labels. CJK labels get none, because tracking made 「第 1 題 · 共 2 題」 read one glyph at a time; that counter also moved from mono to sans.
- No italics on CJK-heavy text (summaries, reasons, Library group headers and empty states, Ask title and suggestions). CJK fonts have no italic, so the browser synthesises an oblique. Latin italics (the masthead, Celebration copy) stay.
- Quiz prompt 26→24px; article body and Engineering Impact 15→16px; Library detail body 13→14px.

### Risk / follow-up

- iOS may keep the old manifest `background_color` for the launch splash until the shortcut is re-added. That only affects the first frame, and re-adding is **not** recommended just for this: a new home-screen install gets fresh storage (`mb_device_id`, streak, quiz ask history) and a new push subscription.
- `backdrop-filter` over a scrolling card costs GPU. It's fine on recent iPhones, but if scrolling ever stutters, drop the blur on the dock first.

### Validation

- `cd web && npm run build` passed.
- Playwright at 390×844 @2x with mocked API: Feed (idle + saved), Ask sheet, Quiz resolved-wrong state, Library expanded row, Activity. No page errors.
- 2026-09-29: the user checked the installed iPhone PWA (the acceptance target for anything touching bottom chrome, Issue 6) after the prod deploy and found no problems.


## Issue 19: Ordering quiz — tap-to-swap → drag; quiz progress reset on tab switch (2026-09-30)

**Symptoms**
1. Users complained the ordering question "can't be dragged" — tap-one-then-tap-another swap wasn't discoverable, and a full reorder took many swaps.
2. Leave the Quiz tab on question 3, come back: the progress read "1/5". `main.tsx` unmounts `Quiz` on every tab switch; remounting refetched `/api/quiz`, which serves **unattempted** questions first, so question 3 became item 0 and two new questions were appended (the day's set silently grew to 7, and XP reset).

**Fix**
- `OrderingCard.tsx` → `DragList`: whole-row press-and-drag on Pointer Events, no dependency. A ≡ grip hints it. Tap-to-swap removed (having both needs tap-vs-drag disambiguation).
  - Rows are `touch-action: none` (a finger on a row always drags, never scrolls QuizFrame). This is safe because `quiz/generate.ts` now caps ordering at 5 items, so the list fits on screen.
  - The lifted row follows the finger through a direct `style.transform`. React re-renders only when the target slot changes, and the other rows then slide out of the way.
  - Row midpoints are measured once at drag start. Rows wrap to different heights, so no fixed row height is assumed.
  - `setPointerCapture`; single pointer only; 6px slop before a press counts as a drag.
  - `pointercancel` / `lostpointercapture` drop the row back without committing. iOS sends cancel, not up, when a system gesture interrupts.
  - On drop, transitions are disabled for one frame. Otherwise the shift-transform reset animates on top of the DOM reorder and rows slide a second slot.
- `Quiz.tsx`: today's quizzes + index + results persist in localStorage `mb_quiz_session`, keyed by Taipei date. On mount it restores instead of refetching; the next day it is ignored. This also survives iOS killing the standalone PWA. A half-finished answer on the current question is not saved; that question restarts.

**Verification**: Playwright (390×844, touch). One drag used real CDP touch events (pointerType touch), and the rest used the mouse. The list sorted correctly and resolved ✓ with +20 XP. After answering Q1, a Quiz → Feed → Quiz round-trip and a full reload both still read 「第 2 題」, with no extra `/api/quiz` fetch. The user confirmed the drag on a real iPhone PWA on 2026-09-30.

## Issue 20: A wrong answer said "wrong" but not what right looks like (2026-09-30)

Ordering, matching and fill-blank marked each mistake ✗ but never showed the correct answer. The only place it appeared was the explanation text, which often doesn't restate it. Now each card shows the answer in place:
- **Ordering**: a misplaced row reads 「✗ 應為 N」.
- **Matching**: a wrongly linked left cell shows its real partner (「→ …」, in green) under its text.
- **Fill-blank**: the wrong pick is struck through, with the right word in a green pill beside it.

Single-choice already highlighted the correct option.


## Issue 21: Ask sheet — keyboard hid the question, one-size suggestions; nav tabs vs. home swipe (2026-09-30)

**Symptoms**
1. Opening the keyboard in the Ask sheet pushed its top (and the question being asked about) off-screen.
2. Suggestion chips were three hardcoded article questions (「跟競品比有什麼 trade-off？」…), shown for quiz questions too.
3. Quiz Ask sent the explanation even before the user had answered, so the model could spoil the answer. It also never saw the options.
4. A swipe up to go home often started on 簡報 / Library, the centre tabs sitting right above the home indicator, and pressed them instead.

**Fix**
- **Keyboard** (`useKeyboardFrame` in `AskSheet.tsx`): while the keyboard is up (`innerHeight − visualViewport.height > 120`), the sheet is pinned to the visual viewport. It uses `top = vv.offsetTop − host top` and `height = vv.height`, updating on `vv` resize and scroll. The thread shrinks while the header and question stay put, and the input drops its safe-area padding.
  - This is scoped to the modal sheet only. The app shell still uses CSS layout: sizing the shell from `visualViewport` is what Issue 6 rejected.
  - **First real-device test failed (2026-09-30)**. The detection compared `window.innerHeight − vv.height`, but iOS shrinks `innerHeight` together with the visual viewport, so the delta stayed ~0 and the keyboard was never detected. The sheet got pushed up exactly as before. The baseline is now `max(documentElement.clientHeight, tallest vv.height seen)`, and the layout viewport doesn't move with the keyboard. While the keyboard is up, the sheet also takes full-screen chrome (square corners, status-bar padding, no drag handle), since it now reaches the top of the screen.
  - **Second real-device test (2026-09-30)**. The keyboard was now detected, but the sheet dropped behind it. The sheet was `position: absolute` with `top = vv.offsetTop − host top`, and iOS scrolls the page to reveal the input and then scrolls it back after the sheet shrinks, so the host-relative top went stale mid-scroll. Now, while the keyboard is up, the sheet is `position: fixed` with `top = vv.offsetTop` and `height = vv.height`. Fixed is relative to the layout viewport, which is exactly what `offsetTop` is measured against, so page scroll can't skew it. Horizontal bounds come from `parentElement` to keep the 480px column. Use `parentElement` rather than `offsetParent`, which is null for a fixed element and made the frame flip off on the next event. No ancestor of AskSheet sets transform, filter or perspective. Keep it that way, or fixed stops being viewport-relative.
- **Pinned question card** (quiz only): it sits outside the scrolling thread and is clamped to 3 lines. Tap it to expand the full question, plus 你的答案 / 正確答案 once answered, or the answer-free material before answering.
- **Suggestions**:
  - Quiz suggestions follow the question's state: before answering (hint / what concept is being tested), after a wrong answer (「我選「X」為什麼不對？」 + a concrete example), after a right answer (edge cases / where it bites in practice). They stay available mid-thread and hide once asked.
  - Article suggestions are generated per article by `api/ask.ts` (`mode: 'suggest'`) and cached in localStorage. Skeleton chips show during the ~1s generation, and generic fallbacks show on error.
- **Quiz Ask context**: each card's `resolve(correct, yourAnswer)` now reports a plain-text answer, and `describeForAsk()` builds answer-free material plus the answer key. See ARCHITECTURE `/api/ask`.
- **Nav**: `NAV_GESTURE_GAP = 10` is a non-tappable strip added to the nav's base under the tab row. It raises the tabs away from the home gesture without growing them toward it. Tabs also lose `btn-press`, whose touch-down shrink and brighten was what lit up during a home swipe. Pages pick up the taller nav automatically through the measured `useNavInset()`.

**Verification**: Playwright (390×844) with a stubbed `visualViewport`:
- With a simulated 336px keyboard, the input's bottom sat at 498 against a visible limit of 508, and the question card stayed on screen.
- The pre-answer request carried `{ prompt, material, answered: false }` with no explanation. After a wrong answer it carried `yourAnswer` 「C. 競態條件」 and `correctAnswer` 「B. N+1 查詢問題」.
- Article suggestions made one call and then rendered.

The keyboard and home-swipe fixes still **need a real iPhone PWA check**. Chromium has neither an iOS keyboard nor the home gesture.

## Issue 22: Bug sweep — state lost on tab switch, attempts lost on leave (2026-09-30)

Found in a deliberate sweep after the Ask keyboard fixes:
- **Feed restarted at card 1 on every tab switch.** `App` unmounts on each tab switch (same cause as the quiz "1/5" bug in Issue 19). Every 👍/👎/🔖 on screen also reset. Now `mb_feed_session` (`{date, idx, feedback, saved}`, keyed by brief date) restores the position and reactions.
- **Quiz attempts were only recorded on 「下一題」.** Leaving mid-explanation dropped the attempt and handed back the same question, with the answer already seen. `QuizFrame` now fires `onResolve` when the question is answered, which is where `Quiz.tsx` submits the attempt and appends the result. A restore resumes at `max(index, results.length)`.
- **Library ask-count mark always read 0.** The multi-user change (`b23f1d5`) dropped the `conversations` join from `/api/library`. It is restored, still count-only and never the messages JSON.
- **html/body stayed card-coloured after the celebration.** Leaving via 「去答今天的判斷題」 kept the card colour on the other tabs' overscroll and safe-area bands. `App` now resets it on unmount.
- **Desktop ←/→ keys set feedback locally but never POSTed it.** They now go through `registerFeedback`.

Verification: Playwright (390×844, mocked API).
- Feed: MORE then SAVE, then Library → 簡報. The same card is shown and 🔖 still shows as saved.
- Quiz: answer Q1, leave without 下一題, come back. The page shows 「第 2 題」, with exactly one `POST /api/quiz-attempt`.
- After leaving the celebration, `body` background is back to `#0B121A`.

## Issue 23: One brand — "Sift" everywhere (2026-09-30)

The UI mixed "The Morning Brief" (the pre-Signal italic-serif Feed header and launch screen, plus the Library empty state), "Morning Brief" / "Brief" (the `<title>` and manifest), "AI Morning Brief" (push fallback titles), and "Sift" (the native app and the icon's name).

Everything is now "Sift":
- manifest `name` / `short_name`, `<title>` and `apple-mobile-web-app-title`;
- the Feed header and the launch screen, which use `SiftWordmark` / `SiftMark` in `icons.tsx` (the home-screen icon's funnel, drawn in the accent) with Inter 800 instead of italic serif;
- the launch tagline 「篩掉雜訊，留下訊號」;
- the Library empty state;
- the push fallback titles (`sw.js`, `src/index.ts`): `Sift · YYYY-MM-DD`.

**Not changed, deliberately:**
- The icon PNGs. A recoloured set was drawn, but iOS snapshots a home-screen PWA's icon and label at install. Seeing a new icon means deleting and re-adding the PWA, and deleting it wipes its storage, including `mb_device_id` and with it all history. The user chose not to.
- The installed home-screen label, which also keeps showing "Brief" until a re-add, for the same reason.

## Issue 24: Report a question, weekly review, instant tabs (2026-09-30)

- **Report a question.** `QuizFrame` has a low-key 「回報」 action that opens reason chips (答案有誤 / 題意不清 / 太簡單 / 其他) and sends `POST /api/quiz-report`. Once reported, an unanswered question can be skipped with 「跳過這題」, which records no attempt: `Quiz.tsx` stores `null` in `results`, so the result slots still line up with question positions and the count and XP ignore it. CompletionCard's total is the number of answered questions.
- **Weekly review.** `WeeklyReview` on the Activity page replaces the 本週組成 pie (`WeekPie.tsx` deleted). It shows active days, articles read, questions answered, accuracy against last week, the most-missed categories, this week's missed questions and this week's saves, all from Edge `GET /api/weekly`.
- **Instant tabs.**
  - Activity and the Quiz/Feed streak render the last `localStorage` copy (`mb_cache_activity`, `mb_cache_weekly`) on the first frame, then refresh in the background.
  - Once the brief is on screen, the Feed prefetches today's quiz set into `mb_quiz_session` (`web/src/quiz/session.ts`). The prefetch never overwrites an existing session, and it shares one in-flight request with the Quiz tab.

Verification: Playwright (390×844, mocked API).
- Prefetch wrote the session, and opening Quiz made no second `/api/quiz` call.
- Report → 題意不清 → 跳過 moved on to 「第 2 題」 with one `POST /api/quiz-report` and no quiz-attempt.
- The weekly card rendered from cache while `/api/weekly` was held for 3s.
- Against local SQLite: the reminder dry run skipped the device active today and gave streak-4 and new-device copy to the others; `/api/quiz` served normally with no `quiz_reports` table and excluded the reported id once it existed.

## Issue 25: Activity page read wrong (2026-09-30, from a real-device screenshot)

- **Heatmap month labels were hardcoded** (`Jan` at week 0 … `Nov` at week 43), as if the grid were a calendar year. It is actually the last 52 weeks ending this week, so late-September activity was labelled "Nov". `monthLabels()` now derives the labels from today: the first column whose Monday falls in a new month gets the label, and a label within 3 columns of the previous one is dropped.
- **Duplicate numbers.** The header 🔥 chip repeated 連續天數, and the 本週答題 card repeated 本週回顧's 答了幾題. The top row is now all-time: 連續天數 / 累計答題 / 總正確率, using the new `totalAnswered` from `/api/activity`. The week lives only in the review card.
- **Missed-question list.** Fill-blank and matching prompts are generic instructions (「請填入正確術語完成以下句子：」). `api/weekly.ts` now shows the blanked sentence for fill-blank, and the prompt plus the left-hand items for matching.
- **Line clamp bleeding.** `-webkit-line-clamp` on an element that also has padding let a third line show through in the padding. The padding moved to a wrapper element.
- **Misleading 「最近 5 天」 label.** The row showed only the day's top category, which read as if every question that day was in it. It now shows `TOP +N`.

## Issue 26: Library opened slowly (2026-10-01)

`/api/library` was a Hono route on the Node function. Every open paid the cold start, and the payload (all history) grows every day.

- **Edge.** It now lives in `api/library.ts` and runs one Turso pipeline (articles + this device's feedback / saves / ask counts), with the same response shape as before. The Hono copy is removed.
- **Cache first.** `Library.tsx` renders `mb_cache_library` on the first frame and refreshes in the background. The cache is written only from the complete list, so a partial page never replaces a complete cache. After that it tracks local changes (saves, ask counts).
- **Two-stage cold load.** With no cache, the page fetches `?days=14` and paints it, then fetches the full history and swaps it in. A late first page never overwrites the full list. If the full request fails, the error is shown only when nothing is on screen. Search and filters run client-side, so they work on the full list once it arrives.

Verification:
- Handler run against local SQLite through a fake `/v2/pipeline` `fetch`: OMIT excluded, ordering (date desc, score desc), joins (`clear` feedback ignored, notionSynced), and `days` slicing / `hasMore` / validation all correct.
- Playwright, with the full response held 8s: the first page painted in 0.36s and search found a 30-day-old article after the full load. Warm open from cache painted in 0.3s with the API held 5s.

---

## What Was Intentionally Not Changed

- ~~`lastReadAgo="today"` placeholder~~: removed from the header in Issue 18 along with the streak row redesign.

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
