# AI Morning Brief

每日自動化技術情報系統：RSS → LLM 分析 → ntfy 推播。

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript (strict mode)
- **Deploy**: GitHub Actions cron job
- **Key deps**: `rss-parser`, Anthropic/OpenAI SDKs, native fetch (ntfy)
- **Notification**: ntfy (HTTP POST)

## Project Structure

```
src/
  index.ts            # Entry point: orchestrates fetch → filter → analyze → notify
  rss/feed.ts         # RSS ingestion & 24h filtering
  ai/provider.ts      # AIProvider interface + shared types
  ai/classifier.ts    # Per-article LLM classifier (parallel, concurrency-limited)
  ai/brief.ts         # Brief generator LLM + degraded fallback
  ai/retry.ts         # withRetry helper
  ai/openai.ts        # OpenAI (GPT) implementation
  ai/anthropic.ts     # Anthropic (Claude) implementation
  notify/ntfy.ts      # ntfy push delivery + formatBriefText
  config.ts           # Env vars, RSS sources, keyword weights, constants
docs/
  PROPOSAL.md         # Full requirements spec — read this first for any feature work
.github/
  workflows/daily_sync.yml
```

## Conventions

- All env vars via `process.env` — never hardcode keys.
- Provider Pattern: every AI backend implements `AIProvider` interface.
- Graceful degradation: one RSS source failing must not crash the run.
- LLM output in Traditional Chinese.
- Two-stage pipeline: Classifier (per-article, parallel) → Brief Generator (one call).
- Classifier concurrency capped at 3 — both OpenAI and Anthropic free-tier TPM limit is ~30k tokens/min.
- Selection caps: `HARD_TECH_MAX=2`, `SIGNALS_MAX=1`, `BRIEF_MAX=3` (ntfy: 1 Click + 2 action buttons).

## Commands

```bash
npm run build        # tsc
npm run start        # node dist/index.js
npm run dev          # tsx --env-file=.env src/index.ts
```

## Env Vars (required)

```
NTFY_TOPIC           # ntfy topic name
AI_PROVIDER          # "openai" | "anthropic" | "alternate"
OPENAI_API_KEY       # required if provider=openai or alternate
ANTHROPIC_API_KEY    # required if provider=anthropic or alternate
```

`alternate` rotates daily by Taipei day-of-year parity: even → GPT, odd → Claude.

## Key Design Decisions

1. **Provider alternation**: GPT / Claude 每日輪替，分散用量，互為備援。
2. **Why ntfy**: 零成本、自託管友善、支援 action buttons。
3. **Rendering**: FULL / LIGHT / OMIT — brief generator 決定。FULL 和 LIGHT 都填完整四欄 (summary / context / engineeringImpact / reason)；LIGHT 額外加 shortJudgment priority badge (`[訊號類型]：[具體事實]`)，不是替代內容欄位。
4. **Tag system**: 短 kebab-case — #model-release #api-platform #infra #tooling #eval #agent #policy #market #research
5. **Spec details**: `cat docs/PROPOSAL.md` for the full requirements.

## Working Rules for Claude Code

- 修改檔案後必須跑 `npm run build`，不准跳過。
- 超過 10 輪對話後，編輯檔案前一律重新讀取該檔案。
- 大任務拆成獨立模組，不要一個 Agent 硬扛。
- 修改後跑測試，失敗就說失敗，不粉飾。
