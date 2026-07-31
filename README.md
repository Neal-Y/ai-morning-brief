# Sift (AI Morning Brief)

一條每日自動運行的資料管線：RSS 擷取 → LLM 分類 → Turso DB 持久化 → Web Push 交付。
GitHub Actions cron 驅動，Vercel Edge Runtime 提供 API 服務層。
自 2026 年 4 月起持續每日運行。

使用者端是一支 iOS PWA：每日推播 → 滑卡閱讀 → 👍👎 回饋 → 追問 → 收藏同步 Notion，歷史文章可在 `/library` 回溯。

**Live:** https://ai-morning-brief-chi.vercel.app

---

## 三個工程重點

### 1. 有回饋迴路的 Feedback Loop，不是一次性腳本

Classifier 每次選文前會讀取近 30 天的 👍👎 回饋作為偏好 context，並附加在 system prompt **尾端**（保 Anthropic cache prefix 穩定，不插中間或開頭）。冷啟動門檻 ≥ 10 筆才啟動，防過擬合；per-category 負訊號需 ≥ 2 次 👎 才算（單筆可能是噪音）。

### 2. 成本被當成設計約束

啟用 prompt caching、classifier 每日上限 12 篇（`CLASSIFIER_CAP` 可線性調整成本）、GPT-4o 與 Claude Sonnet 4.6 按台北日期奇偶輪替（分散單一供應商 rate limit 與依賴風險），全系統年成本控制在 **~$35–40**。`CLASSIFIER_CONCURRENCY=3` 是 free-tier Anthropic TPM 的安全邊際。完整拆解見 [Cost](#cost)。

### 3. 錯誤邊界與執行順序硬編碼

Web Push 只在 DB 寫入成功後才送出（Stage 5 → Stage 6 強制串行），避免推播後 DB 寫入失敗導致使用者開 app 看不到內容。RSS 全掛、config/provider 錯誤、DB 寫入失敗、Web Push 全部發送失敗都會 `exit(1)`，GitHub Actions 標記 workflow failed；Classifier 的 fallback bucket 是 DROP（不是靜默晉升），避免低分文章因例外處理而進入 brief。基礎設施問題由 Actions log 負責，不推播給使用者。

---

## 技術決策說明

### 為什麼 POST 全走 Edge Runtime，不走 Hono？

Hono 在 Vercel Node.js adapter 上，`c.req.json()` 對部分 POST request 會 hang 到 5 分鐘 timeout——2026-04-26 在 `/api/feedback` 重現，body < 100 bytes 也觸發。排查過 DB、libSQL、drizzle、VAPID 都不是病灶；結論是 adapter 本身的問題。Edge Runtime 用原生 `Request.json()` 沒這問題。

現行規則：所有需要讀 request body 的新 POST endpoint，直接寫 `api/<name>.ts`（Edge Runtime）+ `vercel.json` rewrite，不加進 Hono app。Hono 現在 read-only（僅 `/api/feed` 與 `/api/library` GET）。

### 為什麼用 Turso HTTP API 而不是 `libsql://`？

Edge Runtime 是 stateless、短命的執行環境，`libsql://` 的 WebSocket persistent connection 在這裡無法建立。Edge functions 統一用 Turso 的 HTTP API（`https://` transport）——等同 REST over HTTP，無狀態連線，天然適合 serverless。Pipeline（GitHub Actions Node.js 環境）同樣使用 `https://` transport，統一行為減少環境差異。

---

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
  └─ GET  /api/library         歷史文章 + feedback/saves/ask count 狀態（read-only）

Edge Functions (Vercel 獨立路由，不走 Hono)
  ├─ POST /api/ask             api/ask.ts — Haiku 4.5 SSE streaming 追問（multi-turn）
  ├─ GET/POST /api/ask-history api/ask-history.ts — 每篇文章一份對話歷史（Turso HTTP API）
  ├─ POST /api/push-subscribe  api/push-subscribe.ts — 寫 push_subscriptions
  ├─ POST /api/save            api/save.ts — Notion Article ID 去重 + upsert/restore saves
  ├─ POST /api/unsave          api/unsave.ts — soft-hide in-app save（保留 Notion link）
  └─ POST /api/feedback        api/feedback.ts — 👍👎 回饋（delete-then-insert）

React PWA (web/)
  ├─ 今日滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / streak
  ├─ /library 歷史頁：日期分組、filter、展開 LLM 內容、收藏/移除收藏、AskSheet + Ask count
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

### Database Schema（Turso / libSQL）

| Table | 用途 |
|-------|------|
| `articles` | 每日文章 + 分類結果 |
| `feedback` | 👍👎 回饋，用於 classifier 偏好調整 |
| `saves` | 🔖 收藏紀錄；`article_id` unique，`deleted_at` soft hide，`notion_page_id` 保留 re-save 去重 |
| `conversations` | 💬 追問對話歷史；一篇文章一筆，`messages` JSON + `message_count` 供 Library 輕量顯示 |
| `quizzes` | Quiz QA pairs（schema 已建，功能待開發）|
| `push_subscriptions` | Web Push subscription endpoint + VAPID keys |

---

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

---

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

---

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

`api/index.ts`（Hono read-only：`/api/feed`、`/api/library`）+ `api/ask.ts` + `api/ask-history.ts` + `api/push-subscribe.ts` + `api/save.ts` + `api/unsave.ts` + `api/feedback.ts`（皆 Edge Runtime）分別部署為 Vercel Functions。`web/` 為靜態 React PWA。

`vercel.json` 的 rewrite 順序：所有 Edge endpoint 必須排在 `/api/:path* → /api/index` catch-all **前面**，否則會被吞進 Hono。

---

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

### Notion (Vercel env only — 不需進 GitHub Actions secrets)

| Variable             | Required for 🔖 | Description |
| -------------------- | --------------- | ----------- |
| `NOTION_API_KEY`     | ✅              | Notion internal integration token (`secret_...`)，integration 要有 database 的寫權限 |
| `NOTION_DATABASE_ID` | ✅              | 目標 database id；database 必須 share 給 integration |

**Manual setup**：

1. 到 Notion → Settings → Integrations → New internal integration → 拿 token。
2. 建一個 database，properties：`Title (title)` `URL (url)` `Source (rich_text)` `Category (select)` `Score (number)` `Brief Date (date)` `Article ID (rich_text)`。
3. database 右上「...」→ Add connections → 選你的 integration。
4. 從 database URL 抓 ID（`notion.so/<workspace>/<DATABASE_ID>?v=...`）。
5. `NOTION_API_KEY` + `NOTION_DATABASE_ID` 加到 Vercel 的 production / preview env。

Notion sync 失敗不阻斷收藏：`saves` row 仍寫入（`notion_page_id = NULL`），下次點同一篇自動 retry。再次 save 前先用 Notion `Article ID` property 查重，有既有 page 直接 reuse，不建新頁。`/api/unsave` 只 soft-hide in-app save，不刪 Notion page，也不丟 `notion_page_id`。

`alternate` 模式：偶數天（年內第幾天）→ GPT-4o，奇數天 → Claude Sonnet 4.6。

---

## 功能概覽

<details>
<summary>展開</summary>

- **每日 pipeline**：GitHub Actions 07:30（台北）自動抓 RSS、LLM 分類、寫 Turso DB、Web Push 推播到 iPhone PWA
- **Web PWA**：滑卡瀏覽、👍👎 回饋、💬 追問（Haiku streaming）、🔖 收藏、streak 計數
- **Library / 歷史頁** (`/library`)：所有歷史文章 + 收藏 tab、filter、日期分組、展開 LLM 四段內容、收藏／移除收藏、AskSheet 直接從歷史卡開追問並恢復該篇歷史對話
- **Web Push (VAPID)**：iOS standalone PWA 支援，通知標題 = lead story headline，body 第 1 行 = lead 文章的 `engineeringImpact`（LLM 判斷直接上鎖屏）
- **🔖 → Notion 同步**：點收藏自動同步 Notion page；Article ID 查重 + soft-unsave 保留 page link，避免同篇重複建頁
- **Feedback loop**：Classifier 讀近 30 天 👍👎 回饋調整選文偏好（≥10 筆啟動）
- **Provider alternation**：GPT-4o / Claude Sonnet 4.6 按日輪替

</details>
