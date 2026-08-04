# Frontend Fix Log — Sift (React Native / Expo)

> **Status: Living log.** Same pattern as [FRONTEND_FIX_LOG.md](./FRONTEND_FIX_LOG.md) (the web PWA's log) — one file per client, because the two have almost no shared gotchas (native module availability vs. browser/PWA quirks). Read this before debugging `app/` UI issues; add an entry whenever you hit and resolve a non-obvious `app/`-specific bug.

---

## Issue 1 — `react-native-reanimated` fails to initialize on this Expo Go install

**Symptom**: `Exception in HostFunction` thrown from `NativeReanimated`/`NativeWorklets` at module-load time — reproduced across every `react-native-reanimated` version tried (3.15.x through 4.1.x), including the official minimal example with no custom code.

**Root cause**: Expo Go install/device-specific incompatibility with reanimated's native module. Not a version-pinning problem — every version failed the same way.

**Fix**: Rewrote all entrance/feedback animations (`OptionRow.tsx` pop/shake, quiz-answer +XP fly, `CompletionCard.tsx` zoom/fade) using RN-core `Animated` (`Animated.Value`, `.timing`, `.spring`, `.sequence`) instead. Added `app/src/components/Reveal.tsx` (`FadeInDown`, `ZoomIn`) as drop-in replacements for reanimated's `entering={FadeInDown}` API. `react-native-reanimated` is fully uninstalled from `app/package.json`.

**Guardrail**: Do not reach for `react-native-reanimated` in `app/` again without testing on this exact device/Expo Go install first. RN-core `Animated` is the proven path. If gesture-driven drag/drop later genuinely needs reanimated, that will likely require a custom dev client (EAS Build) rather than Expo Go — which the project is heading toward anyway (TestFlight via EAS Build, see [../CLAUDE.md](../CLAUDE.md)).

---

## Issue 2 — Expo Go connects to the wrong LAN IP (USB adapter priority)

**Symptom**: Expo Go times out trying to reach the dev server; Metro's QR code/URL advertises an unreachable IP.

**Root cause**: On this dev Mac, a USB LAN adapter (`en8`) has higher network-service priority than Wi-Fi (`en0`), so Expo picks `en8`'s subnet instead of the Wi-Fi IP the phone is actually on.

**Fix**: Start Expo pinned to the correct interface:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.0.105 npx expo start   # substitute current Wi-Fi IP
```

**Guardrail**: If Expo Go can't connect and the LAN otherwise looks fine, check `ipconfig getifaddr en0` against what Metro printed before assuming a network/firewall issue — it's usually this.

---

## Issue 3 — Expo Go silently assumes `npm run dev:api` is running locally

**Symptom**: Every screen except Ask fails to load data in Expo Go, with no obvious cause — feels like a network/backend outage even when prod is fine.

**Root cause**: `app/src/api.ts` computes `API_BASE` once at module load (`resolveApiBase()`). Whenever `Constants.expoConfig?.hostUri` is set — which is **always true in Expo Go dev mode**, override or not — it builds `http://<LAN-IP>:3001` and uses that unless `EXPO_PUBLIC_API_BASE_URL` is set. So running the app via Expo Go without also having `npm run dev:api` running locally means every request (except `streamAsk`/`submitQuizAttempt`, which are hardcoded straight to prod) hits an unreachable local port and fails.

**Fix**: `app/.env` (gitignored, local-only) sets `EXPO_PUBLIC_API_BASE_URL=https://ai-morning-brief-chi.vercel.app`, overriding the auto-detect so Expo Go defaults to prod. No local server needed for day-to-day use.

**Guardrail**: When you actually want to test unreleased backend changes (`src/api/app.ts` edits before deploying), comment out that line in `app/.env` and start `npm run dev:api` — that restores LAN auto-detection. Don't forget to uncomment it again afterward, or the next Expo Go session will silently try to hit a local server that isn't running.
