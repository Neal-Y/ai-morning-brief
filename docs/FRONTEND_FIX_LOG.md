# Frontend Fix Log

Last updated: 2026-04-28

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

Unresolved as of 2026-04-28.

Earlier we incorrectly marked this resolved. New device screenshots confirmed the remaining standalone PWA issue is real:

- the bottom area is painted with app background
- but the action buttons still visually float above it
- Safari and standalone PWA still do not match in a satisfying way

Current interpretation:

- we can use the bottom area visually
- we have not yet made the buttons occupy it the way the product wants
- this bug should stay open until the installed iPhone PWA no longer shows a conspicuous empty band under the action buttons

Latest change under test:

- `web/src/App.tsx` now treats the footer as a fixed chrome layer again, with no negative safe-area offset and no extra bottom shelf element
- the button row is rendered outside the inner app shell that has `overflow: hidden`, so the bottom safe-area band sits behind it instead of clipping it
- the button row uses fixed positioning with `bottom: max(0px, calc(12px - env(safe-area-inset-bottom, 0px)))`; this is the lowest tested position that keeps the controls inside the root viewport instead of clipping them
- `ArticleCard` receives a measured bottom inset again, but applies it only when the card body is tall enough that the fixed buttons could cover content
- this avoids the previous `Math.max(..., 96)` reserve that could create visible empty card space under short content

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
  - status: superseded by the fixed chrome counter-offset approach
- local working-tree experiment on 2026-04-28, current
  - restores fixed footer ownership outside the inner app shell with `overflow: hidden`
  - positions the button row with `bottom: max(0px, calc(12px - env(safe-area-inset-bottom, 0px)))`
  - this supersedes the intermediate `bottom: 12px` attempt, which still left the visible empty band, and the full `12px - safe-area` attempts, which clipped the controls in the installed PWA even after moving the footer outside the inner shell
  - avoids the earlier failed pattern where negative safe-area offset plus compensating padding either cancelled itself out or risked clipping the controls
  - restores measured card bottom reserve via `feedbackBarHeight`, but `ArticleCard` only applies it when content would otherwise collide with the fixed footer
  - status: build passed; still needs installed iPhone PWA validation

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
