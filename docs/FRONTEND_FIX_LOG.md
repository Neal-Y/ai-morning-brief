# Frontend Fix Log

Last updated: 2026-04-22

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

## Issue 6: App shell height differed between Safari and standalone PWA

### Symptom

When comparing Safari and the installed PWA side by side, the bottom action bar sat at almost the same vertical position in both. In Safari, the browser toolbar filled the lower area. In standalone PWA, that same space appeared as an empty black gap.

### Root Cause

A follow-up stabilization attempt switched the root app shell to `visualViewport.height` / `innerHeight`. On iPhone, that made the shell behave like the shorter in-browser viewport, so standalone PWA exposed the "reserved" lower area as empty space.

### Risk / User Impact

- bottom action bar looked detached from the real screen bottom
- Safari and PWA behaved inconsistently
- it created the false impression that content spacing was still broken

### Fix

Rolled the root app shell back to CSS `100dvh`.

Important decision:

- do not use `visualViewport` to size the whole app shell
- if keyboard-specific issues remain, handle them only at the Ask/input layer

### Changed Files

- `web/src/App.tsx`

### Validation

- compared Safari vs standalone screenshots
- build validation passed

### Remaining Risk

If a real iPhone still shows keyboard-related vertical shaking while typing inside Ask, the next step is a deeper `visualViewport` + keyboard avoidance pass specifically for the sheet/input region, not for the whole app shell.

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

## What Was Intentionally Not Changed

- `lastReadAgo="today"` in the header is still a placeholder string.
  It is cosmetic, not a correctness bug.
- No deeper iOS keyboard-avoidance system was added yet.
  That should only be done if real-device testing still reproduces motion problems.

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
3. Focus the Ask input and type on a real phone.
4. Confirm the card bottom no longer shows a large empty gap.
5. Confirm today's feed loads under Taipei date assumptions.
