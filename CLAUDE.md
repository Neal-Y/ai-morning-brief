# AI Morning Brief

每日自動化技術情報系統：RSS → LLM 分析 → ntfy 推播。

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript (strict mode)
- **Deploy**: GitHub Actions cron job
- **Key deps**: `rss-parser`, `node-fetch` (for ntfy), Anthropic/OpenAI SDKs
- **Notification**: ntfy (HTTP POST)

## Project Structure

```
src/
  index.ts            # Entry point: orchestrates fetch → filter → analyze → notify
  rss/feed.ts         # RSS ingestion & 24h filtering
  ai/provider.ts      # AIProvider interface
  ai/openai.ts        # OpenAI (GPT) implementation
  ai/anthropic.ts     # Anthropic implementation
  notify/ntfy.ts      # ntfy push delivery
  config.ts           # Env vars, RSS source list, constants
docs/
  PROPOSAL.md         # Full requirements spec — read this first for any feature work
.github/
  workflows/daily_sync.yml
```

## Conventions

- All env vars via `process.env` — never hardcode keys.
- Provider Pattern: every AI backend implements `AIProvider` interface.
- Graceful degradation: one RSS source failing must not crash the run.
- LLM prompt persona: 「資深後端架構師」— output in Traditional Chinese.
- Output format: 極簡摘要 (≤30 chars) + 技術洞察 (distributed systems / Go ecosystem angle).

## Commands

```bash
npm run build        # tsc
npm run start        # node dist/index.js
npm run dev          # tsx src/index.ts
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

1. **Why Provider Pattern**: 兩個 provider 互相備援，alternate 模式每日輪替分散用量。
2. **Why ntfy**: 零成本、自託管友善、支援 Markdown + Actions。
3. **Filter logic**: 24h window + keyword relevance scoring, cap at 2-3 articles.
4. **Spec details**: `cat docs/PROPOSAL.md` for the full requirements.
