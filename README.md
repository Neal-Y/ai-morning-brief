# AI Morning Brief

每日自動化 AI 技術情報系統：RSS 抓取 → LLM 分析 → Turso DB → PWA + Web Push 推播。

**Live:** https://ai-morning-brief.vercel.app

## 功能概覽

- **每日 pipeline**：GitHub Actions 07:30（台北）自動抓 RSS、LLM 分類、寫 Turso DB、Web Push 推播到 iPhone PWA
- **Web PWA**：滑卡瀏覽、👍👎 回饋、💬 追問（Haiku streaming）、🔖 收藏、streak 計數
- **Web Push (VAPID)**：iOS standalone PWA 支援，通知標題 = lead story headline（不是泛用 metadata）
- **Feedback loop**：Classifier 讀近 30 天 👍👎 回饋調整選文偏好（≥10 筆啟動）
- **Provider alternation**：GPT-4o / Claude Sonnet 4.6 按日輪替

## Quick Start

```bash
# Backend pipeline + API
nvm use 20
npm install
cp .env.example .env   # 填入 keys
npm run dev:api        # Hono API (port 3001)

# Frontend
cd web && npm install
npm run dev            # Vite dev (port 5173, proxy → 3001)
```

手動跑一次 pipeline（會真的寫 DB + 推 Web Push）：

```bash
npm run dev:pipeline
```

產生 VAPID keys（Web Push 需要）：

```bash
npx web-push generate-vapid-keys
```

## Environment Variables

### Pipeline + Server (GitHub Actions secrets / Vercel env)

| Variable              | Required               | Description                          |
| --------------------- | ---------------------- | ------------------------------------ |
| `TURSO_DATABASE_URL`  | ✅                     | libsql://xxx.turso.io（client 內部換成 https://）|
| `TURSO_AUTH_TOKEN`    | ✅                     | Turso JWT token                      |
| `AI_PROVIDER`         | ✅                     | `openai` / `anthropic` / `alternate` |
| `OPENAI_API_KEY`      | if openai / alternate  | OpenAI API key                       |
| `ANTHROPIC_API_KEY`   | if anthropic / alternate | Anthropic API key                  |
| `VAPID_SUBJECT`       | ✅                     | `mailto:you@example.com`             |
| `VAPID_PUBLIC_KEY`    | ✅                     | Web Push VAPID public key            |
| `VAPID_PRIVATE_KEY`   | ✅                     | Web Push VAPID private key           |

### Frontend build-time (Vercel env, must use `VITE_` prefix)

| Variable                  | Required | Description |
| ------------------------- | -------- | ----------- |
| `VITE_VAPID_PUBLIC_KEY`   | ✅       | 與 `VAPID_PUBLIC_KEY` 相同值，但變數名要有 `VITE_` 前綴才會被 Vite bake 進前端 bundle |

`alternate` 模式：偶數天（年內第幾天）→ GPT-4o，奇數天 → Claude Sonnet 4.6。

## Deploy

### GitHub Actions（pipeline）

1. Push 到 GitHub
2. Settings → Secrets → Actions，新增以下 secrets：
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   - `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
   - `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
3. 每天台灣時間 07:30 自動執行

手動觸發：Actions → AI Morning Brief → Run workflow

### Vercel（Web + API）

```bash
vercel deploy
```

`api/index.ts`（Hono）+ `api/ask.ts`（Edge Runtime SSE）+ `api/push-subscribe.ts`（Edge Runtime → Turso HTTP API）分別部署為 Vercel Functions。`web/` 為靜態 React PWA。

> **為什麼 push-subscribe / ask 走 Edge Runtime 而不是 Hono？**
> Hono 在 Vercel Node.js adapter 上 `c.req.json()` 對某些 POST 會 hang 到 5 分鐘 timeout。Edge Runtime 用原生 `Request.json()` 沒這問題。詳見 `CLAUDE.md` Conventions 段。

## Cost

每天跑一次 pipeline，加上 Web 追問，估計年費：

| 元件 | 模型 | 用途 | 估計年費 |
| ---- | ---- | ---- | -------- |
| Classifier | GPT-4o / Sonnet 4.6（輪替） | 每天 top 12 篇各送一次 LLM | ~$32 |
| Brief | GPT-4o / Sonnet 4.6（輪替） | 每天 1 次 LLM call | ~$4 |
| Ask | Claude Haiku 4.5 | 使用者追問，streaming | ~$1 |
| **總計** | | | **~$35–40/年** |

定價參考（prompt caching 已啟用）：

| Model | Input /M | Output /M | Cache Read /M |
| ----- | -------- | --------- | ------------- |
| gpt-4o | $2.50 | $10.00 | $1.25（自動）|
| claude-sonnet-4-6 | $3.00 | $15.00 | $0.30（cache_control opt-in）|
| claude-haiku-4-5 | $0.80 | $4.00 | $0.08（cache_control opt-in）|

調整 `src/config.ts` 的 `CLASSIFIER_CAP`（預設 12）可線性控制 classifier 成本。

## Architecture

### System Overview

```
GitHub Actions cron (07:30 台北)
  └─ src/index.ts
       ├─ rss/feed.ts          RSS 抓取 + 24h 過濾 + 關鍵字打分
       ├─ db/client.ts         讀近 30 天 feedback 作偏好 context
       ├─ ai/classifier.ts     per-article LLM 分類（concurrency=3）
       ├─ ai/brief.ts          brief 生成（1 次 LLM call）
       ├─ notify/db-writer.ts  upsert 文章到 Turso
       └─ notify/web-push.ts   對 push_subscriptions 全表發 Web Push

Hono API  (src/api/app.ts → api/index.ts on Vercel)
  ├─ GET  /api/feed?date=      從 Turso 讀當日文章
  ├─ POST /api/feedback        👍👎 回饋（delete-then-insert）
  └─ POST /api/save            收藏文章

Edge Functions (Vercel 獨立路由，不走 Hono)
  ├─ POST /api/ask             api/ask.ts — Haiku 4.5 SSE streaming 追問（multi-turn）
  └─ POST /api/push-subscribe  api/push-subscribe.ts — 寫 push_subscriptions（Turso HTTP API）

React PWA (web/)
  ├─ 滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / streak
  └─ Splash gate：iOS standalone 第一次開啟時請求 notification 權限 + 寫 subscription
```

### Pipeline Stages

| Stage | 檔案 | 輸入 → 輸出 |
|-------|------|-------------|
| 1 Feed | `rss/feed.ts` | RSS feeds → `ArticleSummary[]`（過濾 + 打分）|
| 2 Classify | `ai/classifier.ts` | top 12 篇 → `ClassifiedArticle[]`（bucket / renderLevel / score）|
| 3 Select | `src/index.ts` | 全部分類 → 3 篇（HARD_TECH ≤2, SIGNALS ≤1，不足補 filler）|
| 4 Brief | `ai/brief.ts` | 3 篇 → `BriefResult`（summary / context / engineeringImpact）|
| 5 Persist | `notify/db-writer.ts` | `BriefResult` → Turso upsert |
| 6 Push | `notify/web-push.ts` | lead title + section labels → 所有訂閱者 |

Infra 錯誤不送 Web Push：RSS 全掛、config/provider 錯誤、DB 寫入失敗、Web Push 全部發送失敗都會 `exit(1)`，由 GitHub Actions 標記 workflow failed；診斷細節以 Actions log 為 source of truth。Web Push 只承載使用者閱讀訊號：brief ready 或 empty day。

### Database Schema（Turso / libSQL）

| Table | 用途 |
|-------|------|
| `articles` | 每日文章 + 分類結果 |
| `feedback` | 👍👎 回饋，用於 classifier 偏好 |
| `saves` | 🔖 收藏紀錄 |
| `conversations` | 💬 追問對話歷史 |
| `quizzes` | Quiz QA pairs（schema 已建，功能待開發）|
| `push_subscriptions` | Web Push subscription endpoint + VAPID keys |
