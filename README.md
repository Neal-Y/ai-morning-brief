# AI Morning Brief

每日自動化 AI 技術情報系統 — RSS 抓取 → LLM 分析 → ntfy 手機推播。

## Quick Start

```bash
# 1. Clone & install
git clone <repo-url> && cd ai-morning-brief
npm install

# 2. Set env vars
cp .env.example .env
# Edit .env with your keys

# 3. Run locally
npm run dev
```

## Environment Variables

| Variable             | Required              | Description                                      |
| -------------------- | --------------------- | ------------------------------------------------ |
| `NTFY_TOPIC`         | ✅                    | Your ntfy topic name                             |
| `AI_PROVIDER`        | ✅                    | `openai` / `anthropic` / `alternate`             |
| `OPENAI_API_KEY`     | if openai / alternate | OpenAI API key                                   |
| `ANTHROPIC_API_KEY`  | if anthropic / alternate | Anthropic API key                             |

`alternate` 模式：每日自動輪替，偶數天（年內第幾天）→ GPT，奇數天 → Claude。

## Deploy to GitHub Actions

1. Push this repo to GitHub
2. 到 repo → Settings → Secrets and variables → Actions → New repository secret
3. 新增以下 Secrets：
   - `NTFY_TOPIC`
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
4. GitHub Actions 每天台灣時間 07:30 自動執行

手動測試：Actions → AI Morning Brief → Run workflow

## Architecture

```
RSS Sources (7 feeds)
  └─ 24h filter + keyword scoring
       └─ LLM Classifier (per-article, parallel)
            └─ Bucket: HARD_TECH_AI / IMPORTANT_AI_SIGNALS / DROP
                 └─ Rank + select (cap 3)
                      └─ LLM Brief Generator
                           └─ ntfy push (title + body + action buttons)
```

**Provider alternation:** `AI_PROVIDER=alternate` 按台北時區當日年內天數奇偶輪替 GPT / Claude，兩個 API key 都需要設定。
