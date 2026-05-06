# AI Morning Brief

每日自動化技術情報系統：RSS → LLM 分析 → Turso DB → Web PWA。

## TL;DR（新 session 先看這段）

- 整條 pipeline 已上線：GitHub Actions 每天 07:30 台北時間跑 → 寫 Turso DB → **Web Push** 推播。
- Vercel 部署完成：`ai-morning-brief.vercel.app`（Hono API + React PWA + Edge Runtime functions）。
- **ntfy 已淘汰**（2026-04-25），現在唯一推播管道是 Web Push（VAPID + iOS standalone PWA）。
- 前端已過 5 輪 iPhone standalone PWA 穩定化（細節看 `docs/FRONTEND_FIX_LOG.md`，不要在這裡重複翻修）。第 5 輪拔掉了 `vite-plugin-pwa`；現在 SW (`web/public/sw.js`) 是真正的 push handler（`push` + `notificationclick` events，無 fetch cache）。
- **iPhone standalone PWA footer gap 已收斂（2026-04-28）**：最終解是延伸 root height 到 `100dvh + safe-area-inset-bottom`，再把 bottom dock 作為 extended root 內的 absolute layer。不要回到 fixed footer / negative safe-area offset；細節見 `docs/FRONTEND_FIX_LOG.md` Issue 6。
- Classifier 已吃進 feedback（V2 Investment 環節核心），近 30 天 / 20 筆 / 門檻 10 筆。Anthropic cache 有拆 prefix（穩定部分跨天保留）。
- **F4 Notion 整合（2026-04-25，dedupe 強化 2026-05-06）**：🔖 → `api/save.ts` Edge Runtime → Notion REST API（raw fetch，無 SDK）建 page，DB 端 `saves.articleId` unique。Notion 失敗仍寫 saves（`notion_page_id = NULL`），下次再點會 retry。dedupe：先查 Notion `Article ID` property + DB sync lock（`notion_syncing_at`），有舊 page 就 reuse；`/api/unsave` 改成 soft-hide（`saves.deleted_at`），row 與 `notion_page_id` 都保留，下次再 save 直接掛回同一 Notion page。
- **追問歷史（2026-05-06）**：每篇文章一條 `conversations` row（`messages` JSON + `message_count`），`api/ask-history.ts` Edge Runtime 提供 GET/POST upsert。AskSheet 開啟時 hydrate 過往對話、每完成一個 user→assistant turn 就保存；Library 顯示 low-key ask message count，點開可帶歷史回到 AskSheet。`/api/library` JOIN 時只取 `message_count`，**不**載 messages JSON。
- **產品方向重新校準（2026-04-26）**：原本 V2_DESIGN.md 把 quiz (F5) 排第一，覆盤後發現 quiz 是「賭使用者願意主動測驗」的高風險投資；真正使用者已表達的痛點是「滑過沒存的找不回 + LLM 內容隔天就丟」。新的三大支柱：(1) 每日推播 (V1) (2) Library / 歷史頁 (3) Retention layer (quiz, 蓋在 Library 上)。詳見 [docs/PRODUCT_REVIEW_2026-04-26.md](./docs/PRODUCT_REVIEW_2026-04-26.md)。
- **Library 頁面已 ship（2026-04-26，commit `0a61bad` / `ee694bb`）**：原 roadmap PR-A/B/C 一發併出。細節見系統架構 + 功能狀態 + Conventions。
- **下一步決策 gate**（觀察期至約 2026-05-11）：看自己會不會回頭翻 `/library`；不回頭翻就停在 stable 版，不急著疊 RSS 擴源 / quiz。

---

## 系統架構

```
GitHub Actions cron (daily 台北 07:30)
  └─ src/index.ts                     # pipeline 入口
       ├─ rss/feed.ts                 # RSS ingestion + 24h filter + 關鍵字打分
       ├─ db/client.getRecentFeedback # 讀近 30 天 feedback 作為偏好 context
       ├─ ai/classifier.ts            # per-article LLM 分類（concurrency=3）
       ├─ ai/brief.ts                 # brief generator（一次 LLM call）
       ├─ notify/db-writer.ts         # upsert 文章到 Turso（成功後才推播）
       └─ notify/web-push.ts          # 對 push_subscriptions 全表發 Web Push

Hono API (src/api/app.ts → api/index.ts on Vercel)
  ├─ GET  /api/feed?date=   # 從 Turso 讀當日文章
  └─ GET  /api/library      # 全歷史 + feedback / saved / notionSynced + ask message_count 多表 JS-join（不撈 messages JSON），read-only no-store

Edge functions（Vercel 獨立路由，不走 Hono — 詳見 Conventions）
  ├─ POST     /api/ask           # api/ask.ts — Haiku 4.5 SSE streaming 追問
  ├─ GET/POST /api/ask-history   # api/ask-history.ts — per-article conversations 讀 / upsert messages JSON
  ├─ POST     /api/push-subscribe# api/push-subscribe.ts — 寫 push_subscriptions
  ├─ POST     /api/save          # api/save.ts — 查 article + Notion dedupe（Article ID lookup + DB sync lock）+ upsert saves
  ├─ POST     /api/feedback      # api/feedback.ts — up/down（delete-then-insert，同 articleId 只留最新）
  └─ POST     /api/unsave        # api/unsave.ts — soft-hide saves（set deleted_at；row、notion_page_id、Notion page 都不動）

React PWA (web/)
  ├─ /          滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / Celebration
  ├─ /library   全歷史頁：所有歷史 tab（filter + 日期分組 + 展開 LLM 四段） / 收藏 tab（Notion sync stats）
  ├─ pathname routing：web/src/main.tsx 監聽 popstate，web/src/router.ts navigate() helper
  └─ Splash gate：iOS standalone 第一次開啟 → 請求 notification permission → 寫 subscription
```

---

## 功能狀態

| 功能 | 狀態 | 備註 |
|---|---|---|
| RSS → 分類 → 寫 Turso | ✅ | V1 遺留，穩定 |
| Web Push 推播 | ✅ | 標題 = lead story title, body = 「Hard Tech AI／Signals」section labels |
| Turso DB 寫入 | ✅ | article id = SHA-256(url).slice(0,16)；client 用 `https://` 而非 `libsql://`（serverless friendly） |
| Vercel 部署 | ✅ | `api/index.ts` (Hono read-only) + Edge：`ask` / `ask-history` / `push-subscribe` / `save` / `unsave` / `feedback` |
| PWA 卡片 UI | ✅ | iPhone standalone 已穩定，細節見 FRONTEND_FIX_LOG |
| 👍👎 → DB | ✅ | delete-then-insert 防誤按；Edge Runtime（2026-04-26 從 Hono 搬出，原本 504 timeout） |
| 💬 追問（Haiku SSE） | ✅ | `api/ask.ts` Edge Runtime raw fetch |
| 💬 追問歷史 | ✅ | `api/ask-history.ts` Edge：GET hydrate / POST upsert；`conversations` 一篇一 row；AskSheet 開啟還原、turn 完成保存；Library 顯示 ask message count |
| Classifier 吃 feedback | ✅ | 近 30 天 / 20 筆 / 門檻 10；偏好附 system prompt 尾端 |
| 🔖 Notion 整合 | ✅ | Edge Runtime + raw fetch；失敗 graceful；2026-05-06 加 dedupe（Notion Article ID lookup + DB sync lock）+ unsave 改 soft-hide（規則見 Conventions Pipeline/DB） |
| Library 頁面 | ✅ | `/library` route + `GET /api/library` + `POST /api/unsave`（Edge）。2026-04-27 Vercel preview 真機驗證完成 |
| Quiz 生成 | ⏳ 未做 | `quizzes` table 已建 schema |
| 晨間 Recall Quiz | ⏳ 未做 | 需先有 quiz 資料 |
| Skill-tag 雙軸 | ⏳ 未做 | schema 已有 `skillTags`，classifier 沒產 |
| 週報 | ⏳ 未做 | |

---

## 下一步（按優先順序，2026-04-26 重排）

> 重排理由：覆盤後發現 quiz 是高風險賭注，Library 是已表達需求。詳見 [docs/PRODUCT_REVIEW_2026-04-26.md](./docs/PRODUCT_REVIEW_2026-04-26.md)。

1. **下一步決策 gate**（觀察期至約 2026-05-11）— 觀察自己是否真的會回頭翻 `/library`。**退場條件**：1–2 週若自己沒回頭翻過，內容品質一輪 / Quiz 都不做，停在「每日推播 + Library」stable 版。產品定位見 [docs/LIBRARY_PROPOSAL.md](./docs/LIBRARY_PROPOSAL.md)，設計 review 見 [docs/LIBRARY_DESIGN_REVIEW_v1.md](./docs/LIBRARY_DESIGN_REVIEW_v1.md)。
2. **內容品質一輪**（Library 之後 — Library 越多源越值錢）：
   - 2a. **RSS 源擴充**：新增 Anthropic news / OpenAI blog / Cloudflare blog / AWS ML blog。RSS URL 上線前要 `curl` 驗證仍有效（Anthropic / OpenAI 換過很多次）
   - 2b. **觀察一週 keyword weight**：官方 blog 進來後是否被 PREFILTER 漏放或誤殺，視情況微調 `KEYWORD_WEIGHTS`
   - 2c. **Skill-tag 產出**（原 V2 F6）：classifier 輸出 `skillTags` 陣列，Library filter chip 才有第三維度可用（目前 Library 已預留 `skillTags` 顯示，等 classifier 產就會自動有東西）
   - **不要做的事**：AWS What's New（firehose）、Google AI Blog（行銷腔）、各家 changelog feeds（太細粒度）。詳見對話紀錄 2026-04-26 後段
3. **Quiz (F5)** — 降為 Library 上的 retention layer。前置條件：Library ship 後使用者真的有回去翻。配退場條件：「2 週連續 7 天沒答 quiz 就砍掉」。
4. **Notion 策略回看** — 不急著做 backfill / conversations 寫回 / 筆記 UI。先觀察 Library 是否已解決「歷史找回」需求；若 Notion 仍有價值，優先改成明確的 curated export，而不是擴大自動同步。
5. **Classifier 偏好 v2**（feedback 累積一兩個月後評估再動，**不要提早優化**）。

---

## 待確認 / 觀察中

- [x] `/api/feed?date=...` 在 Vercel 上正常回傳
- [x] `/api/push-subscribe` 寫入 `push_subscriptions` table（Edge Runtime，已驗證 2026-04-25）
- [x] GitHub Actions secrets 已設 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` + `VAPID_*`
- [ ] 連續 3 天 07:30 自動觸發都能成功收到 Web Push（觀察一週）
- [x] Library 在 Vercel preview 真機跑一遍（2026-04-27 — `/library` 路由、filter、展開 LLM、🔖 / 移除收藏、AskSheet 改 full-screen，「原文」改 link 樣式）
- [x] Library `/api/library` GET 在 Vercel 正常回傳（feedback / saved / notionSynced 三欄）
- [ ] **Notion 30 天回看**（到 2026-05-26）：30 天內若沒回 Notion 翻過 Sift Saves 一次，重新評估是否該砍

---

## Project Structure

```
src/
  index.ts            # pipeline 入口
  config.ts           # env, RSS sources, keyword weights
  date.ts             # Taipei date helper
  rss/feed.ts
  ai/provider.ts      # AIProvider interface + 共用 types
  ai/classifier.ts    # 分類器 + buildPreferenceContext()
  ai/brief.ts         # brief generator + degraded fallback
  ai/retry.ts
  ai/openai.ts · anthropic.ts
  notify/web-push.ts  # web-push 函式庫，對 push_subscriptions 全表發送
  notify/db-writer.ts # Turso upsert
  notion/client.ts    # raw fetch Notion REST API（createSavePage）
  db/schema.ts        # articles / feedback / saves (article_id unique, deleted_at soft-hide, notion_syncing_at lock) / conversations (article_id unique, messages JSON + message_count) / quizzes / push_subscriptions
  db/client.ts        # libSQL client (https://) + getRecentFeedback()
  api/app.ts          # Hono app（GET /api/feed + GET /api/library，read-only；library 只 select conversations.message_count，不撈 messages JSON）
  api/server.ts       # 本地 dev (port 3001)
api/index.ts             # Vercel entry (hono/vercel handle)
api/ask.ts               # Edge Runtime SSE for /api/ask
api/ask-history.ts       # Edge Runtime GET/POST → Turso HTTP API（per-article conversations upsert / fetch）
api/push-subscribe.ts    # Edge Runtime POST → Turso HTTP API（寫 push_subscriptions）
api/save.ts              # Edge Runtime POST → Notion dedupe (Article ID lookup + DB sync lock) + Turso HTTP API（upsert saves，clears deleted_at）
api/feedback.ts          # Edge Runtime POST → Turso HTTP API（delete-then-insert feedback）
api/unsave.ts            # Edge Runtime POST → Turso HTTP API（soft-hide via deleted_at；row、notion_page_id、Notion page 都保留）
vercel.json
web/
  index.html
  public/manifest.json · apple-touch-icon.png · icon-512.svg
  public/sw.js          # push handler SW（push + notificationclick events）
  src/main.tsx          # pathname routing：/library → Library，其他 → App
  src/router.ts         # navigate(path) helper（pushState + popstate dispatch）
  src/App.tsx           # 日報主畫面：swipe 物理 + streak + push permission gate
  src/Library.tsx       # /library 頁面：filter / 日期分組 / 展開 LLM / saves tab
  src/push.ts           # isPushSupported / isStandalone / completeSubscription
  src/components/
    Card.tsx · Chrome.tsx · AskSheet.tsx · Celebration.tsx
  src/{date,theme,types}.ts · index.css
  vite.config.ts
scripts/seed.ts
docs/
  PROPOSAL.md                       # V1 spec
  V2_DESIGN.md                      # V2 產品藍圖 + phased rollout
  FRONTEND_FIX_LOG.md               # 前端 / mobile UI 修復史（先讀這份再動 UI）
  LIBRARY_PROPOSAL.md               # Library 產品定位 + 設計 brief
  LIBRARY_DESIGN_REVIEW_v1.md       # Library 設計 v1 review + DB 可行性核對
  PRODUCT_REVIEW_2026-04-26.md      # 產品方向校準（quiz 降級、Library 升級）
.github/workflows/daily_sync.yml
```

---

## Commands

```bash
# Pipeline
npm run build          # tsc
npm run dev:pipeline   # tsx src/index.ts（會真的寫 DB + 推 Web Push）
npm run dev:api        # Hono API server (port 3001)

# Web
cd web && npm run dev  # Vite dev (port 5173, proxy → 3001)

# DB
npm run db:seed        # 3 篇假文章（今日日期）
```

## Env Vars

**Pipeline (GitHub Actions secrets) + Server (Vercel env):**
```
TURSO_DATABASE_URL    # libsql://xxx.turso.io（client.ts 內部換成 https:// transport）
TURSO_AUTH_TOKEN      # JWT
AI_PROVIDER           # "openai" | "anthropic" | "alternate"
OPENAI_API_KEY
ANTHROPIC_API_KEY
VAPID_SUBJECT         # mailto:you@example.com
VAPID_PUBLIC_KEY      # web-push generate-vapid-keys
VAPID_PRIVATE_KEY
```

**Notion (Vercel env only — 不需要進 GitHub Actions secrets，cron 不會呼叫 Notion):**
```
NOTION_API_KEY        # internal integration token (secret_xxx)
NOTION_DATABASE_ID    # database 要 share 給 integration
```
Notion database 需要的 properties：`Title (title)` `URL (url)` `Source (rich_text)` `Category (select)` `Score (number)` `Brief Date (date)` `Article ID (rich_text)`。

**Frontend (Vercel build-time only — `VITE_` prefix is required for Vite to bake into bundle):**
```
VITE_VAPID_PUBLIC_KEY # 同上 VAPID_PUBLIC_KEY 的值，但要用這個變數名才會出現在前端 bundle
```

---

## Conventions（動程式前務必看過）

**一般：**
- Node.js 20+（`nvm use 20` 先跑，再跑任何 npm 指令）
- 所有 env 走 `process.env`，不准 hardcode
- Provider Pattern：每個 AI backend 實作 `AIProvider` interface
- LLM 輸出一律繁體中文

**Pipeline / DB：**
- Classifier concurrency 上限 3（Anthropic free-tier TPM）
- Selection caps：`HARD_TECH_MAX=2`, `SIGNALS_MAX=1`, `BRIEF_MAX=3`
- Filler logic：若 HARD_TECH + SIGNALS < 3，top-scoring DROP 補位（renderLevel → LIGHT）
- Pipeline 順序固定是 brief → DB persist → Web Push。Web Push 是 PWA 入口，不可在 DB 寫入成功前送出。
- Infra 錯誤不送 Web Push：RSS 全掛、config/provider 錯誤、DB 寫入失敗、Web Push 全部發送失敗都要 `exit(1)`，讓 GitHub Actions failed；Actions log 是錯誤診斷 source of truth。
- DB upsert 一律用 `onConflictDoUpdate`（用 `onConflictDoNothing` 會讓 count log 誤報）
- db-writer 的 conflict target 是 `articles.url`
- `saves.articleId` 是 unique（一篇一筆）；`/api/save` handler 自己做 upsert（`ON CONFLICT(article_id) DO UPDATE`，順便清掉 `deleted_at`），不依賴 Drizzle upsert（Edge Runtime 用 raw Turso HTTP API）
- Notion sync 失敗不阻斷收藏：寫 `saves` row 但 `notion_page_id = NULL`，回 `{ ok: true, notionSynced: false }`，下次同篇再點會 retry
- **Notion dedupe 三層防線（2026-05-06）**：再次按 🔖 同一篇時 (a) 既有 `saves.notion_page_id` 不為 NULL → 直接 reuse，不打 Notion；(b) 沒 page id → 用 `saves.notion_syncing_at` 當 10 分鐘 sync lock（CAS update where IS NULL or stale），搶到 lock 才呼叫 Notion，搶不到回 `{ notionSyncing: true }`；(c) 真的要建 page 前先 `findSavePageByArticleId(articleId)` query Notion 上是否已有同 `Article ID`，有就 reuse、沒有才 `createSavePage`。三層都是為了避免 unsave→re-save 又生第二張 Notion page。
- `/api/unsave` 是 **soft-hide**（`UPDATE saves SET deleted_at = ?`）：**不刪 row、不動 notion_page_id、不刪 Notion page**。保留 row 是為了讓 re-save 走上面 dedupe (a) 直接掛回原本那張 Notion page；不刪 Notion page 是因為 Notion 是外部 PKM，使用者可能已經整理過內容。未來若調整，優先考慮把 Notion 降級為明確的「送到 Notion」curated export，而不是每次 save 自動同步。
- `conversations` 是「一個 articleId 一 row」：`messages` JSON、`message_count`、`model`、`created_at`、`updated_at`。`/api/ask-history` POST 是整段覆寫（不 append diff），AskSheet 在每個 user→assistant turn 完成後送一次。`/api/library` JOIN 時只 select `message_count`，**不要**載入 messages JSON（library payload 別變大）；要看完整對話走 `/api/ask-history?articleId=` GET。

**Classifier 偏好：**
- Preference context **必須附加在 system prompt 尾端**（保 cache prefix，不要插中間／開頭）
- `classifyArticles` 透過 `string[]` 形式呼叫 provider — `[CLASSIFIER_SYSTEM, preferenceContext]`，AnthropicProvider 只在第一個 block 打 cache_control，穩定 prefix 跨天不會被變動的偏好 invalidate
- Cold-start 門檻 10 筆，低於門檻一律不注入（防過擬合）
- 👎 per-category 要 ≥ 2 次才算負訊號（單一 👎 可能只是當天心情，別當真）

**Edge Runtime endpoints（POST 一律走這裡，不要進 Hono；GET 視情況也可走 Edge）：**
- `/api/ask` → `api/ask.ts`（SSE streaming）
- `/api/ask-history` → `api/ask-history.ts`（GET 讀 / POST upsert per-article conversations row）
- `/api/push-subscribe` → `api/push-subscribe.ts`（寫 Turso）
- `/api/save` → `api/save.ts`（查 article、Notion dedupe lookup、upsert saves，sync lock 防併發 double-create）
- `/api/unsave` → `api/unsave.ts`（soft-hide saves via deleted_at；不刪 row、不動 notion_page_id、不刪 Notion page）
- `/api/feedback` → `api/feedback.ts`（delete-then-insert feedback）
- **背景**：Hono `c.req.json()` / `c.req.text()` 在 `hono/vercel` Node.js adapter 上會 hang 到 300s timeout（GET 沒事，body 大小不是 trigger）。Edge Runtime 原生 `Request.json()` 沒這問題。診斷過 DB / libSQL / drizzle / VAPID 都不是病灶 — 結論是 Hono adapter 自己。所有 POST 已遷完（含 feedback 2026-04-26 復發後）。
- **規則**：以後任何**新的 POST endpoint 要讀 body**，直接寫 `api/<name>.ts` + `vercel.json` rewrite，**不要**加進 `src/api/app.ts`。Hono app 現在 read-only（`/api/feed` + `/api/library` GET）。
- `vercel.json` 的 rewrite 順序：`/api/ask`、`/api/ask-history`、`/api/push-subscribe`、`/api/save`、`/api/unsave`、`/api/feedback` 必須排在 `/api/:path* → /api/index` **前面**，不然會被 catch-all 吃掉送進 Hono。
- 不要為了 local dev 方便在 Hono app 裡複製一份 — 會 prompt drift / 行為不一致。
- 結果：本地 `npm run dev:api` 無法測這些 endpoint，要測請 push 到 Vercel preview。

**PWA / Service Worker：**
- **不要**重新加 `vite-plugin-pwa` 或其他 SW 產生器。app 是「每天開一次抓新資料」，沒有 offline 需求，SW 只會製造 cache 地獄（見 FRONTEND_FIX_LOG Issue 14）。
- Manifest 用靜態 `web/public/manifest.json`（index.html 單一 `<link rel="manifest">`）。
- `theme_color` / `background_color` / `<meta name="theme-color">` 三處必須全部對齊 `T.bg = #14110D`，不然 iOS standalone 會出現 status bar 色差「框框」。
- `web/public/sw.js` 現在是 **真正的 push handler**（`push` + `notificationclick` events），**沒有** fetch / cache event handler。如果以後加 fetch handler 一定要小心 cache 地獄重演。

**Web Push / iOS PWA：**
- iOS Web Push **只在 standalone 模式下支援**（首頁捷徑開啟，不是 Safari 直接開網址）。所以 `App.tsx` 的 splash gate `permissionResolved` 初始判定要先過 `isStandalone()`。
- `Notification.requestPermission()` 必須由 user gesture 觸發（按鈕 onClick），不能在 `useEffect` 內自動呼叫。
- `Notification.permission` 已是 `granted` 時，App startup useEffect 會自動 call `completeSubscription()` 補寫 `push_subscriptions`（fire-and-forget，使用者無感）。
- 當天有文章：通知標題 = `displayedItems[0].title`（lead story），body 兩行：第 1 行 = lead 文章的 `engineeringImpact`（讓 LLM 生的判斷上鎖屏，不只是頭條），第 2 行 = active section labels + 額外篇數（例：`Hard Tech AI · Signals · +2 篇`）。當天無文章：標題 = `AI Morning Brief {date}`、body = `今日無重大 AI 新聞`。
- 通知格式 2026-04-26 重做過一次：拿掉「from Sift」（icon 已表示來源）、`／` 改 `·`、釋出空間放 lead 的 `engineeringImpact`。看 `src/index.ts` Stage 6 的 comment，不要回退。

---

## Key Design Decisions

1. **Provider alternation**：GPT / Claude 按台北 day-of-year 奇偶輪替
2. **Rendering levels**：FULL / LIGHT / OMIT by brief generator
3. **Category tags**：#model-release #api-platform #infra-inference #tooling-open-source #benchmark-eval #agent-systems #policy-regulation #company-market #social-opinion #event-promo #research-adjacent
4. **Web design**：報紙 / FT editorial 風格，Source Serif 4 + JetBrains Mono
5. **Streak**：localStorage `mb_streak`，讀完最後一篇 +1
6. **Deploy**：Vercel free tier（V2_DESIGN.md §4 決策）

---

## Working Rules for Claude Code

- 修改檔案後必須跑 `npm run build`，不准跳過
- 超過 10 輪對話後，編輯檔案前一律重新讀取該檔案
- 大任務拆獨立模組，不要一個 agent 硬扛
- `nvm use 20` 先跑，再跑任何 npm 指令
- 遇到前端 / mobile UI 問題，**先讀 `docs/FRONTEND_FIX_LOG.md`** 再動手
- Commit 前先把 UI 結果描述給使用者，等他說 go 才動（Never commit proactively）

---

## Mentor Engineering Workflow

This section extends the project rules above. If there is tension, keep the
original project-specific rule and use this workflow as clarification.

### Default Collaboration Loop

For non-trivial work, do not write code first. Start by helping the user reason:

1. Restate the problem and identify the affected surface area.
2. Ask only the questions needed to remove meaningful ambiguity.
3. Propose 2-3 viable design options.
4. Compare tradeoffs: complexity, failure modes, latency/cost, deploy risk, and fit with existing conventions.
5. Recommend one option, but do not treat the recommendation as user approval.
6. Wait for the user to choose before implementation.
7. After approval, implement narrowly, verify, and report what changed.
8. For non-trivial code changes, ask the user to do a brief risk review before implementation when it would improve learning: where could this break, concurrency/resource risks, scaling/failure modes. Then add what they missed. Skip for simple verification, mechanical edits, emergency mitigation, or when explicitly told to proceed directly.
9. If the user repeatedly skips reasoning on non-trivial decisions, slow down: push back, ask targeted follow-ups, and prefer a guiding question before giving the recommendation. Do not apply this to simple factual, status, or mechanical requests.

Small mechanical fixes may skip the full option matrix, but still state the
assumption before editing. Emergency production fixes may prioritize mitigation,
then document the design follow-up.

### Review Checklist

Before implementation and again before final response, review:

- **Concurrency:** bounded parallelism, race conditions, duplicate writes, idempotency, retry behavior.
- **Resource usage:** LLM tokens, provider rate limits, Turso query volume, memory use, bundle size, mobile battery/network cost.
- **Failure handling:** partial failures, degraded behavior, retry safety, user-visible errors, GitHub Actions/Vercel failure signals.
- **Scalability:** what changes at 10x articles, feedback rows, saves, push subscriptions, or daily users.
- **Observability:** logs with enough context, clear action failure points, no secret leakage, source of truth for debugging.

### Teaching Behavior

Act as a mentor, not only a code generator:

- Ask the user to choose between meaningful tradeoffs instead of silently choosing architecture.
- Challenge assumptions when they conflict with product goals, operational constraints, or previous decisions.
- Explain why a design is safer or cheaper before showing code.
- Use short examples from this repo (`api/*.ts`, `src/index.ts`, `web/src/*`) when teaching.
- Prefer guiding questions for system design, debugging, and review; give direct answers for simple factual or mechanical tasks.

### Prevention Rules

- No blind agreement. If a request risks breaking Web Push, PWA behavior, Edge routing, cache behavior, or cost controls, say so directly.
- No direct coding for ambiguous features. Clarify scope, data flow, failure behavior, and verification first.
- No broad rewrites when a narrow change preserves existing behavior.
- No new unbounded loops, unbounded concurrency, or provider calls without explicit caps.
- No new POST endpoint that reads a body in Hono; keep the existing Edge Runtime rule.
