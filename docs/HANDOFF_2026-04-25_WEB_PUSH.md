# Handoff — Web Push / ntfy Removal

> **Status (2026-04-28)**：本文件為 2026-04-25 ntfy 拔除 / Web Push 切換當下的交接快照。後續產品方向（Library ship、quiz 降級等）以 [CLAUDE.md](../CLAUDE.md) TL;DR 為準，本文不再更新。

Date: 2026-04-25

## Current State

- `ntfy` is removed as a product notification path. Do not reintroduce `NTFY_TOPIC` for normal brief delivery.
- Web Push is the only user-facing notification channel.
- `/api/push-subscribe` is an Edge Runtime endpoint that writes browser subscriptions into `push_subscriptions`.
- `notify/web-push.ts` sends VAPID Web Push to all stored subscriptions.
- GitHub Actions runs the daily pipeline at 07:30 Taipei time.

## Error Handling Decision

- Web Push should only mean "there is something to read" or "empty day".
- Infra errors should not be sent to the user's lock screen.
- GitHub Actions failure + Actions log is the source of truth for RSS/config/provider/DB/push failures.
- The pipeline must persist articles to Turso before sending Web Push. A tapped notification depends on `/api/feed` reading today's articles from DB.
- DB write failure is fatal.
- Empty-day Web Push failure is fatal.
- Web Push failure is fatal if no notification can be delivered.

## Pipeline Order

1. Load config.
2. Fetch RSS and prefilter.
3. If no articles: send empty-day Web Push, then exit 0.
4. Select AI provider.
5. Classify articles.
6. Generate brief, falling back to degraded brief if the brief LLM fails.
7. Persist `BriefResult` to Turso.
8. Send Web Push with lead story title + active section labels.

## Known Non-Fatal Degradations

- Feedback context load failure: continue without preference injection.
- Per-article classifier failure: use fallback classification for that article.
- Brief generator failure: use `buildDegradedBrief()`.

## Verification

- Run `npm run typecheck`.
- Run `npm run build`.
- Check `git diff` for any accidental `ntfy` reintroduction.
- If real env vars are available, `npm run dev:pipeline` will write DB rows and send Web Push.

## Next Product Work

- F4 Notion integration: `POST /api/save` should eventually create a structured Notion page for saved articles.
- Quiz generation can follow after Notion save is stable.
