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

## Cost

每天執行一次，估計年費：

| Model | Input /M | Output /M | Cache Read /M |
| ----- | -------- | --------- | ------------- |
| gpt-4o | $2.50 | $10.00 | $1.25（自動，50% off）|
| claude-sonnet-4-6 | $3.00 | $15.00 | $0.30（opt-in，90% off）|

兩個 provider 均啟用 prompt caching（OpenAI 自動、Anthropic 透過 `cache_control`），classifier system prompt 重複發送的成本大幅降低。

**估計 ~$20–25/年**（`alternate` 模式，每天送 top 12 篇文章給 classifier）。

調整 `config.ts` 的 `CLASSIFIER_CAP`（預設 12）可進一步控制成本。

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────┐
│  Stage 1 — rss/feed.ts                              │
│                                                     │
│  7 RSS sources ──Promise.allSettled──► fetch 平行   │
│    → filterLast24h()   只留 24h 內文章              │
│    → scoreArticle()    關鍵字加減分 (llm=+4, ...)   │
│    → prefilter()       丟掉分數 < -2 的文章         │
│                                                     │
│  輸出：ArticleSummary[]  (title/link/score/...)     │
└──────────────────────┬──────────────────────────────┘
                       │ 依分數排序，取 top 12
                       ▼
┌─────────────────────────────────────────────────────┐
│  Stage 2 — ai/classifier.ts                         │
│                                                     │
│  每篇文章各送一次 LLM（平行，最多 3 個同時）         │
│    → 回傳 bucket:      HARD_TECH_AI / SIGNALS / DROP│
│    → 回傳 renderLevel: FULL / LIGHT / OMIT          │
│    → 回傳 score, summary, engineeringImpact...      │
│                                                     │
│  輸出：ClassifiedArticle[]                          │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Stage 3 — index.ts（選篇邏輯）                     │
│                                                     │
│  HARD_TECH_AI  最多取 2 篇                          │
│  SIGNALS       最多取 1 篇                          │
│  不滿 3 篇 → 從 DROP 裡補分數最高的（降級為 LIGHT） │
│                                                     │
│  輸出：selected[]（固定 3 篇）                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Stage 4 — ai/brief.ts                              │
│                                                     │
│  3 篇文章 → 送一次 LLM → 生成完整 brief             │
│    BriefResult: title / sections[] / actionLinks[]  │
│    每篇含 summary / context / engineeringImpact     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Stage 5 — notify/ntfy.ts                           │
│                                                     │
│  formatBriefText() → 結構轉純文字                   │
│  sendNtfy()        → HTTP POST 到 ntfy.sh           │
│                        title + body + 3 action buttons│
└─────────────────────────────────────────────────────┘
```

### Stage 一覽

| Stage | 檔案 | 做什麼 | 輸入 → 輸出 |
|-------|------|--------|-------------|
| 1 Feed | `rss/feed.ts` | 抓文章、過濾、關鍵字打分 | RSS feeds → `ArticleSummary[]` |
| 2 Classify | `ai/classifier.ts` | LLM 判斷每篇價值與分類 | top 12 篇 → `ClassifiedArticle[]` |
| 3 Select | `index.ts` | 按 bucket 規則挑 3 篇 | 全部分類結果 → 3 篇 `selected[]` |
| 4 Brief | `ai/brief.ts` | LLM 寫完整摘要 | 3 篇 → `BriefResult` |
| 5 Notify | `notify/ntfy.ts` | 格式化 + 推播 | `BriefResult` → 手機通知 |

**Provider alternation:** `AI_PROVIDER=alternate` 按台北時區當日年內天數奇偶輪替 GPT / Claude，兩個 API key 都需要設定。
