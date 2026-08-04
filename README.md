# Sift 「AI Morning Brief — 個人化每日晨報 pipeline」

兩條每日自動運行的資料管線，共用一顆 DB、一個 client 殼：
- **文章管線**：RSS 擷取 → LLM 分類 → Turso DB 持久化 → Web Push 交付
- **Quiz 管線**：LLM 出題（backend/infra 判斷力題目）→ Turso DB 持久化

兩條管線各自獨立排程、獨立 cron，不互相依賴——出題不需要文章資料，文章 pipeline 掛掉也不影響 quiz。
GitHub Actions cron 驅動，Vercel Edge Runtime 提供 API 服務層。
自 2026 年 4 月起持續每日運行。

使用者端是 React Native app「Sift」（Expo，封測中）+ 一支 iOS PWA：每日推播新聞 → 滑卡閱讀 → 👍👎 回饋 → 追問 → 收藏同步 Notion；每日 quiz → 遊戲化作答（4 種題型）→ 學習紀錄儀表板。歷史內容可在 Library 回溯。

**Live (Web PWA):** https://ai-morning-brief-chi.vercel.app

---

## 四個工程重點

### 1. 兩條內容管線解耦，不是硬塞進同一條 pipeline

文章和 quiz 是完全獨立的兩套產出：不同 cron 排程（07:30 / 06:00 台北，刻意錯開）、不同 entry point、不同 dedup 邏輯，只共用 provider 選擇邏輯和同一顆 DB。好處是任一條掛掉不拖累另一條，各自可以獨立重跑、獨立調整節奏。使用者端的 Ask 追問則反過來刻意共用：quiz 題目用合成 `articleId = quiz-${id}` 掛進既有的 conversations 機制，沒有為 quiz 另建一套幾乎一樣的 SSE + 歷史儲存邏輯——同一決策原則（重不重複用）在兩個方向上給出不同答案，取決於失敗域是否該隔離。

### 2. 有回饋迴路的 Feedback Loop，不是一次性腳本

Classifier 每次選文前會讀取近 30 天的 👍👎 回饋作為偏好 context，並附加在 system prompt **尾端**（保 Anthropic cache prefix 穩定，不插中間或開頭）。冷啟動門檻 ≥ 10 筆才啟動，防過擬合；per-category 負訊號需 ≥ 2 次 👎 才算（單筆可能是噪音）。

### 3. 成本被當成設計約束

啟用 prompt caching、classifier 每日上限 12 篇（`CLASSIFIER_CAP` 可線性調整成本）、GPT-4o 與 Claude Sonnet 4.6 按台北日期奇偶輪替（分散單一供應商 rate limit 與依賴風險），全系統年成本控制在 **~$40–45**。`CLASSIFIER_CONCURRENCY=3` 是 free-tier Anthropic TPM 的安全邊際。完整拆解見 [Cost](#cost)。

### 4. 錯誤邊界與執行順序硬編碼

Web Push 只在 DB 寫入成功後才送出（Stage 5 → Stage 6 強制串行），避免推播後 DB 寫入失敗導致使用者開 app 看不到內容。RSS 全掛、config/provider 錯誤、DB 寫入失敗、Web Push 全部發送失敗都會 `exit(1)`，GitHub Actions 標記 workflow failed；Classifier 的 fallback bucket 是 DROP（不是靜默晉升），避免低分文章因例外處理而進入 brief。基礎設施問題由 Actions log 負責，不推播給使用者。

---

## 技術決策說明

### 為什麼 POST 全走 Edge Runtime，不走 Hono？

Hono 在 Vercel Node.js adapter 上，`c.req.json()` 對部分 POST request 會 hang 到 5 分鐘 timeout——2026-04-26 在 `/api/feedback` 重現，body < 100 bytes 也觸發。排查過 DB、libSQL、drizzle、VAPID 都不是病灶；結論是 adapter 本身的問題。Edge Runtime 用原生 `Request.json()` 沒這問題。

現行規則：所有需要讀 request body 的新 POST endpoint，直接寫 `api/<name>.ts`（Edge Runtime）+ `vercel.json` rewrite，不加進 Hono app。Hono 現在 read-only（`/api/feed`、`/api/library`、`/api/quiz`、`/api/activity` 皆 GET）。

### 為什麼用 Turso HTTP API 而不是 `libsql://`？

Edge Runtime 是 stateless、短命的執行環境，`libsql://` 的 WebSocket persistent connection 在這裡無法建立。Edge functions 統一用 Turso 的 HTTP API（`https://` transport）——等同 REST over HTTP，無狀態連線，天然適合 serverless。Pipeline（GitHub Actions Node.js 環境）同樣使用 `https://` transport，統一行為減少環境差異。

---

## Architecture

Full mechanics (classifier decision tables, rank+select algorithm, quiz validation rules, complete DB schema, complete API contract) live in **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**. Below is the summary.

### System Overview

```
GitHub Actions cron — 兩條獨立 pipeline
  ├─ daily_sync.yml (07:30 台北) → src/index.ts
  │    ├─ rss/feed.ts          RSS 抓取 + 24h 過濾 + 關鍵字打分
  │    ├─ db/client.ts         讀近 30 天 feedback 作偏好 context
  │    ├─ ai/classifier.ts     per-article LLM 分類（concurrency=3）
  │    ├─ ai/brief.ts          brief 生成（1 次 LLM call）
  │    ├─ notify/db-writer.ts  upsert 文章到 Turso
  │    └─ notify/web-push.ts   對 push_subscriptions 全表發 Web Push
  └─ quiz_sync.yml (06:00 台北) → src/quiz-pipeline.ts   （不依賴文章資料；cron 目前手動暫停，見 docs/ARCHITECTURE.md）
       ├─ db/client.ts         讀近期已出題 prompt 防重複
       ├─ quiz/generate.ts     LLM 出題（4 題型混出）
       └─ db/quiz-writer.ts    寫入 quizzes table

Hono API  (src/api/app.ts → api/index.ts on Vercel) — read-only
  ├─ GET  /api/feed?date=      從 Turso 讀當日文章
  ├─ GET  /api/library         歷史文章 + feedback/saves/ask count 狀態
  ├─ GET  /api/quiz            今日 quiz 題組
  └─ GET  /api/activity        學習紀錄：heatmap / streak / 正確率（device_id 範圍）

Edge Functions (Vercel 獨立路由，不走 Hono)
  ├─ POST /api/ask             api/ask.ts — Haiku 4.5 SSE streaming 追問（文章與 quiz 共用）
  ├─ GET/POST /api/ask-history api/ask-history.ts — 每篇文章一份對話歷史（Turso HTTP API）
  ├─ POST /api/push-subscribe  api/push-subscribe.ts — 寫 push_subscriptions
  ├─ POST /api/save            api/save.ts — Notion Article ID 去重 + upsert/restore saves
  ├─ POST /api/unsave          api/unsave.ts — soft-hide in-app save（保留 Notion link）
  ├─ POST /api/feedback        api/feedback.ts — 👍👎 回饋（delete-then-insert）
  └─ POST /api/quiz-attempt    api/quiz-attempt.ts — 寫入 quiz_attempts

React Native App「Sift」(app/) — 主力 client，Expo Go 封測中
  ├─ 四分頁：Quiz（今日題目）/ Feed（簡報）/ Library / Activity（學習紀錄）
  └─ device_id（非帳號系統）貫穿五張表，作為多使用者隔離依據

React PWA (web/) — Web Push 入口
  ├─ 今日滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / streak
  ├─ /library 歷史頁：日期分組、filter、展開 LLM 內容、收藏/移除收藏、AskSheet + Ask count
  └─ Splash gate：iOS standalone 第一次開啟時請求 notification 權限 + 寫 subscription
```

### Pipeline Stages（文章管線；quiz 管線是獨立的單步驟：出題 → 寫入，見上方架構圖）

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
| `saves` | 🔖 收藏紀錄；`(device_id, article_id)` unique，`deleted_at` soft hide，`notion_page_id` 保留 re-save 去重 |
| `conversations` | 💬 追問對話歷史；一 (article, device) 一筆，`messages` JSON + `message_count` 供 Library 輕量顯示；quiz 用合成 article_id 共用此表 |
| `quizzes` | Quiz 題目（4 題型，polymorphic `payload` JSON）|
| `quiz_attempts` | Quiz 作答紀錄：`quiz_id` / `device_id` / `correct` |
| `push_subscriptions` | Web Push subscription endpoint + VAPID keys |

> `feedback` / `saves` / `conversations` / `quiz_attempts` / `push_subscriptions` 都有 `device_id` 欄位——沒有帳號系統，靠 app 端生成的 UUID（AsyncStorage）做多使用者隔離。

---

## Cost

每天跑兩條 pipeline，加上 Web 追問，估計年費：

| 元件 | 模型 | 用途 | 估計年費 |
| ---- | ---- | ---- | -------- |
| Classifier | GPT-4o / Sonnet 4.6（輪替） | 每天 top 12 篇各送一次 LLM | ~$32 |
| Brief | GPT-4o / Sonnet 4.6（輪替） | 每天 1 次 LLM call | ~$4 |
| Quiz 生成 | GPT-4o / Sonnet 4.6（輪替） | 每天 1 次 LLM call，出 5 題 | ~$4（量級同 Brief，未精算；**cron 目前手動暫停，實際花費是 $0**，見下方 Architecture） |
| Ask | Claude Haiku 4.5 | 使用者追問（文章 + quiz），streaming | ~$1 |
| **總計** | | | **~$40–45/年** |

定價參考（prompt caching 已啟用）：

| Model | Input /M | Output /M | Cache Read /M |
| ----- | -------- | --------- | ------------- |
| gpt-4o | $2.50 | $10.00 | $1.25（自動）|
| claude-sonnet-4-6 | $3.00 | $15.00 | $0.30（cache_control opt-in）|
| claude-haiku-4-5 | $0.80 | $4.00 | $0.08（cache_control opt-in）|

調整 `src/config.ts` 的 `CLASSIFIER_CAP`（預設 12）可線性控制 classifier 成本。

---

## Local Setup & Deploy

本地開發指令、GitHub Actions / Vercel 部署步驟、完整 Environment Variables 表、Notion manual setup，見 **[docs/DEPLOY.md](./docs/DEPLOY.md)**。

---

## 功能概覽

<details>
<summary>展開</summary>

- **雙每日 pipeline**：GitHub Actions 文章（07:30 台北）+ quiz（06:00 台北）各自獨立排程，寫同一顆 Turso DB
- **Sift app（RN，封測中）**：四分頁 Quiz / Feed / Library / Activity；device_id 做多使用者隔離
- **Quiz**：4 種互動題型（single_choice / ordering / matching / fill_blank），答對 +20 XP / 答錯 +5 XP，AskSheet 追問重用文章 Ask 基礎設施
- **Activity 學習紀錄**：年度 heatmap、週 pie、streak、正確率
- **Web PWA**：滑卡瀏覽、👍👎 回饋、💬 追問（Haiku streaming）、🔖 收藏、streak 計數
- **Library / 歷史頁** (`/library`)：所有歷史文章 + 收藏 tab、filter、日期分組、展開 LLM 四段內容、收藏／移除收藏、AskSheet 直接從歷史卡開追問並恢復該篇歷史對話
- **Web Push (VAPID)**：iOS standalone PWA 支援，通知標題 = lead story headline，body 第 1 行 = lead 文章的 `engineeringImpact`（LLM 判斷直接上鎖屏）
- **🔖 → Notion 同步**：點收藏自動同步 Notion page；Article ID 查重 + soft-unsave 保留 page link，避免同篇重複建頁
- **Feedback loop**：Classifier 讀近 30 天 👍👎 回饋調整選文偏好（≥10 筆啟動）
- **Provider alternation**：GPT-4o / Claude Sonnet 4.6 按日輪替，文章與 quiz pipeline 共用同一套邏輯

</details>
