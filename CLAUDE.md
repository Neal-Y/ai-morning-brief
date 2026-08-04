# AI Morning Brief（產品名「Sift」）

雙軌內容系統：(1) RSS → LLM 分析 → 每日技術簡報（V1 遺留，穩定） (2) LLM 出題 → backend/infra 判斷力 quiz（遊戲化學習）。兩條 pipeline 各自獨立產生，共用同一顆 Turso DB + 同一個 client 殼（React Native App「Sift」+ Web PWA）。

## 回話風格（節省 token）

簡單、扼要、結論有力。不要客套、不要為了銜接寫過場廢話、不要重述我剛說過的話、不要做完一件小事就長篇報告。
直接給結論與理由；要我決定時給選項+推薦，不要鋪陳。程式碼/設計的取捨該講還是要講（mentor 原則不變），但用最少的字講完。

## TL;DR（新 session 先看這段）

- 整條 pipeline 已上線：GitHub Actions 每天 07:30 台北時間跑 → 寫 Turso DB → **Web Push** 推播。
- Vercel 部署完成：`ai-morning-brief-chi.vercel.app`（Hono API + React PWA + Edge Runtime functions）。
- **ntfy 已淘汰**（2026-04-25），現在唯一推播管道是 Web Push（VAPID + iOS standalone PWA）。
- 前端已過 5 輪 iPhone standalone PWA 穩定化（細節看 `docs/FRONTEND_FIX_LOG.md`，不要在這裡重複翻修）。第 5 輪拔掉了 `vite-plugin-pwa`；現在 SW (`web/public/sw.js`) 是真正的 push handler（`push` + `notificationclick` events，無 fetch cache）。
- **iPhone standalone PWA footer gap 已收斂（2026-04-28）**：最終解是延伸 root height 到 `100dvh + safe-area-inset-bottom`，再把 bottom dock 作為 extended root 內的 absolute layer。不要回到 fixed footer / negative safe-area offset；細節見 `docs/FRONTEND_FIX_LOG.md` Issue 6。
- Classifier 已吃進 feedback（V2 Investment 環節核心），近 30 天 / 20 筆 / 門檻 10 筆。Anthropic cache 有拆 prefix（穩定部分跨天保留）。
- **F4 Notion 整合（2026-04-25，dedupe 強化 2026-05-06）**：🔖 → `api/save.ts` Edge Runtime → Notion REST API（raw fetch，無 SDK）建 page，DB 端 `saves.articleId` unique。Notion 失敗仍寫 saves（`notion_page_id = NULL`），下次再點會 retry。dedupe：先查 Notion `Article ID` property + DB sync lock（`notion_syncing_at`），有舊 page 就 reuse；`/api/unsave` 改成 soft-hide（`saves.deleted_at`），row 與 `notion_page_id` 都保留，下次再 save 直接掛回同一 Notion page。
- **追問歷史（2026-05-06）**：每篇文章一條 `conversations` row（`messages` JSON + `message_count`），`api/ask-history.ts` Edge Runtime 提供 GET/POST upsert。AskSheet 開啟時 hydrate 過往對話、每完成一個 user→assistant turn 就保存；Library 顯示 low-key ask message count，點開可帶歷史回到 AskSheet。`/api/library` JOIN 時只取 `message_count`，**不**載 messages JSON。
- **產品方向重新校準（2026-04-26）**：原本 V2 設計把 quiz (F5) 排第一，當時覆盤後降級成「Library 上的 retention layer」，退場條件是「沒回頭翻 library 就不做 quiz」。詳見 [docs/decisions/2026-04-26-product-review.md](./docs/decisions/2026-04-26-product-review.md)（**背景文件，決策已被後續開發蓋過，見下一條**）。
- **Library 頁面已 ship（2026-04-26，commit `0a61bad` / `ee694bb`）**：原 roadmap PR-A/B/C 一發併出。細節見系統架構 + 功能狀態 + Conventions。
- **⚠️ 2026-04-26 的「Library 決策 gate」已作廢**：Quiz 實際上照做了，且已經是主力產品（app 改名「Sift」、四分頁、封測中）。不用再回頭驗證 gate 有沒有通過，這條規則不再生效，純留作歷史紀錄。
- **現況（2026-08）**：Quiz pipeline 程式碼正常運作，但 `quiz_sync.yml` cron **目前手動關閉**（操作者選擇，等使用頻率提高再開，不是壞掉）。DB 裡已有先前生成的題庫，`/api/quiz` 的 recycle 邏輯（優先出沒答過的，答完就循環）持續供應，不會因為 cron 關閉就退回 `app/src/data.ts` 的 3 題硬編碼 fallback（那只在 API 整個打不到時才觸發）。app「Sift」在 Expo Go 封測中，狀況穩定。**下一步是 EAS Build → TestFlight**。
- **Notion 整合維持現狀、不主動投資**：使用者不會回頭看 Notion saves，但整合已經串好、成本是 sunk，先放著不拆，也不再加功能。舊的「Notion 30 天回看」檢查點作廢。

---

## 系統架構

> 這裡是摘要。演算法細節（classifier bucket/renderLevel 規則、rank+select 算法、quiz 驗證規則）、完整 DB schema、完整 API contract 見 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**（living spec，改邏輯務必同步更新）。

```
GitHub Actions cron — 兩條獨立 pipeline，錯開時間互不影響
  ├─ daily_sync.yml（07:30 台北）→ src/index.ts             # 文章 pipeline
  │    ├─ rss/feed.ts                 # RSS ingestion + 24h filter + 關鍵字打分
  │    ├─ db/client.getRecentFeedback # 讀近 30 天 feedback 作為偏好 context
  │    ├─ ai/classifier.ts            # per-article LLM 分類（concurrency=3）
  │    ├─ ai/brief.ts                 # brief generator（一次 LLM call）
  │    ├─ notify/db-writer.ts         # upsert 文章到 Turso（成功後才推播）
  │    └─ notify/web-push.ts          # 對 push_subscriptions 全表發 Web Push
  └─ quiz_sync.yml（06:00 台北）→ src/quiz-pipeline.ts       # quiz pipeline（不依賴文章）
       ├─ db/client.getRecentQuizPrompts # 讀近期已出過的題目 prompt，防重複
       ├─ quiz/generate.ts             # LLM 出題（single_choice / ordering / matching / fill_blank 混出）
       └─ db/quiz-writer.ts            # 寫入 quizzes table

Hono API (src/api/app.ts → api/index.ts on Vercel) — read-only GET
  ├─ GET  /api/feed?date=   # 從 Turso 讀當日文章
  ├─ GET  /api/library      # 全歷史 + feedback / saved / notionSynced + ask message_count 多表 JS-join（不撈 messages JSON），read-only no-store
  ├─ GET  /api/quiz         # 今日 quiz 題組
  └─ GET  /api/activity     # 學習紀錄：heatmap / streak / 正確率等統計（device_id 範圍）

Edge functions（Vercel 獨立路由，不走 Hono — 詳見 Conventions）
  ├─ POST     /api/ask           # api/ask.ts — Haiku 4.5 SSE streaming 追問（文章與 quiz 共用；quiz 用合成 articleId=`quiz-${id}`）
  ├─ GET/POST /api/ask-history   # api/ask-history.ts — per-(article, device) conversations 讀 / upsert messages JSON
  ├─ POST     /api/push-subscribe# api/push-subscribe.ts — 寫 push_subscriptions
  ├─ POST     /api/save          # api/save.ts — 查 article + Notion dedupe（Article ID lookup + DB sync lock）+ upsert saves
  ├─ POST     /api/feedback      # api/feedback.ts — up/down（delete-then-insert，同 articleId 只留最新）
  ├─ POST     /api/unsave        # api/unsave.ts — soft-hide saves（set deleted_at；row、notion_page_id、Notion page 都不動）
  └─ POST     /api/quiz-attempt  # api/quiz-attempt.ts — 寫入 quiz_attempts（quizId / deviceId / correct）

React PWA (web/) — 原生 iOS app（app/）上線後為次要 client，仍是 Web Push 入口
  ├─ /          滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / Celebration
  ├─ /library   全歷史頁：所有歷史 tab（filter + 日期分組 + 展開 LLM 四段） / 收藏 tab（Notion sync stats）
  ├─ pathname routing：web/src/main.tsx 監聽 popstate，web/src/router.ts navigate() helper
  └─ Splash gate：iOS standalone 第一次開啟 → 請求 notification permission → 寫 subscription

React Native App「Sift」(app/) — 主力 client，Expo Go 封測中
  ├─ 四分頁（bottom tab）：Quiz（今日題目）/ Feed（簡報）/ Library / Activity（學習紀錄）
  ├─ QuizScreen   — 每日 quiz 題組（single_choice / ordering / matching / fill_blank）；XP：對 +20 / 錯 +5
  ├─ QuizFrame    — 四種題型共用 chrome（進度條 / streak / XP / 分類 pill）+ 💬 AskSheet（追問這題）
  ├─ FeedScreen   — 滑卡瀏覽今日文章；swipe right=有用 / left=略過；💬 AskSheet / 🔖 save
  ├─ LibraryScreen — 全歷史 + 收藏 tab（呼叫 /api/library）
  ├─ ActivityScreen — 學習紀錄：年度 heatmap（DotGrid）/ 週 pie / streak / 正確率（呼叫 /api/activity）
  ├─ src/api.ts   — 自動偵測 Metro host（dev LAN）或 fallback 到 prod；quiz-attempt / ask SSE（expo/fetch）
  ├─ src/theme.ts — T / FONT / RADIUS / XP 設計 token（鏡像 web/ dark theme）
  └─ src/device.ts — AsyncStorage device UUID（`sift_device_id`，X-Device-Id header，多使用者隔離用）
```

---

## 功能狀態

| 功能 | 狀態 | 備註 |
|---|---|---|
| RSS → 分類 → 寫 Turso | ✅ | V1 遺留，穩定 |
| Web Push 推播 | ✅ | 標題 = lead story title, body = 「Hard Tech AI／Signals」section labels |
| Turso DB 寫入 | ✅ | article id = SHA-256(url).slice(0,16)；client 用 `https://` 而非 `libsql://`（serverless friendly） |
| Vercel 部署 | ✅ | `api/index.ts` (Hono read-only) + Edge：`ask` / `ask-history` / `push-subscribe` / `save` / `unsave` / `feedback` |
| PWA 卡片 UI | ✅ | iPhone standalone 已穩定，細節見 `docs/FRONTEND_FIX_LOG.md` |
| 👍👎 → DB | ✅ | delete-then-insert 防誤按；Edge Runtime（2026-04-26 從 Hono 搬出，原本 504 timeout） |
| 💬 追問（Haiku SSE） | ✅ | `api/ask.ts` Edge Runtime raw fetch |
| 💬 追問歷史 | ✅ | `api/ask-history.ts` Edge：GET hydrate / POST upsert；`conversations` 一篇一 row；AskSheet 開啟還原、turn 完成保存；Library 顯示 ask message count |
| Classifier 吃 feedback | ✅ | 近 30 天 / 20 筆 / 門檻 10；偏好附 system prompt 尾端 |
| 🔖 Notion 整合 | ✅ | Edge Runtime + raw fetch；失敗 graceful；2026-05-06 加 dedupe（Notion Article ID lookup + DB sync lock）+ unsave 改 soft-hide（規則見 Conventions Pipeline/DB） |
| Library 頁面 | ✅ | `/library` route + `GET /api/library` + `POST /api/unsave`（Edge）。2026-04-27 Vercel preview 真機驗證完成 |
| React Native App「Sift」| ⏳ 封測中 | Expo SDK 54，Expo Go 開發，TestFlight 為目標；四分頁 Quiz/Feed/Library/Activity |
| Quiz 生成 | ✅ 程式碼完成，⏸️ cron 手動暫停 | `src/quiz-pipeline.ts` 獨立於文章 pipeline；`quiz_sync.yml`（06:00 台北）目前手動關閉，等使用頻率提高再開。現有題庫透過 `/api/quiz` recycle 邏輯持續供應，不會變空 |
| Quiz 作答紀錄 | ✅ | `POST /api/quiz-attempt` → `quiz_attempts`；XP：答對 +20 / 答錯 +5（`app/src/theme.ts` XP 常數） |
| 學習紀錄 / Activity | ✅ | `GET /api/activity` + `ActivityScreen.tsx`：年度 heatmap、週 pie、streak、正確率，皆以 device_id 為範圍 |
| 多使用者支援 | ✅ | `device_id` 貫穿 feedback / saves / conversations / push_subscriptions / quiz_attempts；app 端 `src/device.ts` 用 AsyncStorage 存 UUID（`sift_device_id`），每次 fetch 帶 `X-Device-Id` |
| Quiz 追問 | ✅ | Quiz 題目重用文章的 AskSheet + `/api/ask` / `/api/ask-history`，用合成 `articleId = quiz-${id}` 掛進同一套 conversations 機制，沒有另開一套 |
| 晨間 Recall Quiz（排程推播提醒去答題）| ⏳ 未做 | Quiz 生成本身已上線，但「排程通知去答題」這層還沒做 |
| Skill-tag 雙軸 | ⏳ 未做 | schema 已有 `skillTags`，classifier 沒產 |
| 週報 | ⏳ 未做 | |

---

## 下一步（2026-08 現況重排）

> 舊版（2026-04-26）把 Quiz 當高風險賭注、排在 Library 之後、配了退場條件。實際發展沒照這個腳本走——Quiz 已經做完且封測順暢，舊排序作廢。以下是目前真正的優先序。

1. **Sift → TestFlight**：Quiz pipeline、四分頁 app、多使用者 device_id 都已到位，下一步是 EAS Build 送審。這是目前唯一的 active 任務。
2. **內容品質一輪**（文章 pipeline 這條，優先度低於 1，非阻塞）：
   - RSS 源擴充：Anthropic news / OpenAI blog / Cloudflare blog / AWS ML blog。上線前要 `curl` 驗證 URL 仍有效
   - Skill-tag 產出（`skillTags` classifier 還沒產）：Library filter chip 第三維度
   - 不要做：AWS What's New（firehose）、Google AI Blog（行銷腔）、各家 changelog feeds（太細粒度）
3. **晨間 Recall Quiz**（排程通知提醒去答題）：Quiz 生成本身已上線，這層還沒做，等 TestFlight 過了再評估要不要加
4. **Notion 整合**：維持現狀，不主動投資、不拆——已串好且 sunk cost，使用者不會回頭看，優先度最低
5. **Classifier 偏好 v2**（feedback 累積夠久再評估，不要提早優化）

---

## 待確認 / 觀察中

- [x] `/api/feed?date=...` 在 Vercel 上正常回傳
- [x] `/api/push-subscribe` 寫入 `push_subscriptions` table（Edge Runtime，已驗證 2026-04-25）
- [x] GitHub Actions secrets 已設 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` + `VAPID_*`
- [x] 連續多天 07:30 自動觸發成功收到 Web Push（穩定運行至今，2026-08）
- [x] Library 在 Vercel preview 真機跑一遍（2026-04-27 — `/library` 路由、filter、展開 LLM、🔖 / 移除收藏、AskSheet 改 full-screen，「原文」改 link 樣式）
- [x] Library `/api/library` GET 在 Vercel 正常回傳（feedback / saved / notionSynced 三欄）
- [x] Quiz pipeline 正常出題（獨立 cron，`quiz_sync.yml`）
- [x] Sift app 四分頁在 Expo Go 封測跑起來（Quiz/Feed/Library/Activity）
- [ ] EAS Build → TestFlight 送審
- ~~Notion 30 天回看~~：作廢，不會回去看，但整合維持現狀不拆（見 TL;DR）

---

## Project Structure

```
src/
  index.ts            # 文章 pipeline 入口
  quiz-pipeline.ts    # quiz pipeline 入口（獨立於文章 pipeline，見 quiz_sync.yml）
  config.ts           # env, RSS sources, keyword weights
  date.ts             # Taipei date helper
  rss/feed.ts
  ai/provider.ts      # AIProvider interface + 共用 types
  ai/select-provider.ts # GPT/Claude 輪替邏輯（文章 + quiz pipeline 共用）
  ai/classifier.ts    # 分類器 + buildPreferenceContext()
  ai/brief.ts         # brief generator + degraded fallback
  ai/retry.ts
  ai/openai.ts · anthropic.ts
  quiz/generate.ts    # LLM 出題（4 題型 + AVOID REPEATING dedup context，同 classifier 手法附在 system prompt 尾端）
  quiz/types.ts        # QuizType + 各題型 payload interface
  notify/web-push.ts  # web-push 函式庫，對 push_subscriptions 全表發送
  notify/db-writer.ts # Turso upsert（文章）
  db/quiz-writer.ts   # Turso insert（quiz 題目）
  notion/client.ts    # raw fetch Notion REST API（createSavePage）
  db/schema.ts        # articles / feedback / saves / conversations / quizzes / quiz_attempts / push_subscriptions — feedback/saves/conversations/quiz_attempts/push_subscriptions 皆有 device_id 欄位
  db/client.ts        # libSQL client (https://) + getRecentFeedback() + getRecentQuizPrompts()
  api/app.ts          # Hono app（GET /api/feed + /api/library + /api/quiz + /api/activity，全部 read-only）
  api/server.ts       # 本地 dev (port 3001)
api/index.ts             # Vercel entry (hono/vercel handle)
api/ask.ts               # Edge Runtime SSE for /api/ask（文章與 quiz 共用，quiz 用合成 articleId）
api/ask-history.ts       # Edge Runtime GET/POST → Turso HTTP API（per-(article, device) conversations upsert / fetch）
api/push-subscribe.ts    # Edge Runtime POST → Turso HTTP API（寫 push_subscriptions）
api/save.ts              # Edge Runtime POST → Notion dedupe (Article ID lookup + DB sync lock) + Turso HTTP API（upsert saves，clears deleted_at）
api/feedback.ts          # Edge Runtime POST → Turso HTTP API（delete-then-insert feedback）
api/unsave.ts            # Edge Runtime POST → Turso HTTP API（soft-hide via deleted_at；row、notion_page_id、Notion page 都保留）
api/quiz-attempt.ts      # Edge Runtime POST → Turso HTTP API（寫 quiz_attempts，device_id 必填）
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
app/                     # React Native app「Sift」（Expo SDK 54）
  App.tsx                # 根元件：字型載入 + bottom tab navigator（Quiz/Feed/Library/Activity）
  app.json                # expo name/slug = "Sift"
  package.json           # expo ^54, react-native 0.81, @expo-google-fonts/*
  src/
    api.ts               # fetch wrapper（Metro host 自動偵測 dev / prod fallback）；fetchActivity() / submitQuizAttempt()
    theme.ts             # T / FONT / RADIUS / XP 設計 token（鏡像 web/ dark theme）
    device.ts            # AsyncStorage device UUID（`sift_device_id`，X-Device-Id header）
    types.ts             # Article / FeedResponse 等共用型別
    data.ts              # 靜態資料 / mock helpers
    screens/
      QuizScreen.tsx     # 今日題目分頁：載入 quiz、記錄結果、算 XP
      FeedScreen.tsx     # 簡報分頁：swipe 卡片 + AskSheet + save
      LibraryScreen.tsx  # Library 分頁：全歷史 + 收藏 tab
      ActivityScreen.tsx # 學習紀錄分頁：年度 heatmap（DotGrid）/ 週 pie / streak / 正確率
    components/          # ArticleCard / AskSheet / DotGrid / QuizFrame（四題型共用 chrome + AskSheet）/ QuizCard / CompletionCard 等 RN 元件
scripts/seed.ts
docs/
  README.md                         # docs/ 目錄，先看這份分清楚 living spec vs 凍結決策紀錄
  ARCHITECTURE.md                   # living：classifier/quiz 演算法細節、完整 DB schema、完整 API contract
  KNOWN_ISSUES.md                   # living：目前真的錯的地方（非 wishlist）
  PRINCIPLES.md                     # living：可重複使用的產品/工程判斷原則
  DEPLOY.md                         # living：本地開發 + 部署 + env vars
  FRONTEND_FIX_LOG.md               # living：web/ PWA 修復史（先讀這份再動 web UI）
  FRONTEND_FIX_LOG_APP.md           # living：app/ RN 修復史（先讀這份再動 app UI）
  decisions/                        # 凍結，不再改；每篇檔頭寫「現況以哪份 living doc 為準」
    2026-04-13-v1-proposal.md         # V1 spec（機制細節已搬到 ARCHITECTURE.md）
    2026-04-25-handoff-web-push.md    # ntfy → Web Push 交接快照
    2026-04-26-v2-design.md           # V2 產品藍圖 + phased rollout（roadmap 已過期，哲學/rejected 表仍有參考價值）
    2026-04-26-product-review.md      # 產品方向校準（結論已被推翻，原則已搬到 PRINCIPLES.md）
    2026-04-26-library-proposal.md    # Library 產品定位 + 設計 brief
    2026-04-27-library-design-review-v1.md  # Library 設計 v1 review + DB 可行性核對
.github/workflows/daily_sync.yml
```

---

## Commands

```bash
# Pipeline
npm run build          # tsc
npm run dev:pipeline   # tsx src/index.ts（會真的寫 DB + 推 Web Push）
npm run dev:quiz       # tsx src/quiz-pipeline.ts（會真的寫 DB，5 題）
npm run dev:api        # Hono API server (port 3001)

# Web
cd web && npm run dev  # Vite dev (port 5173, proxy → 3001)

# React Native App
cd app && npx expo start   # Expo Go 開發（Metro bundler，LAN IP 自動偵測）
cd app && npx expo start --ios   # iOS Simulator

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
- `/api/ask` → `api/ask.ts`（SSE streaming；文章與 quiz 共用，quiz 用合成 `articleId=quiz-${id}`）
- `/api/ask-history` → `api/ask-history.ts`（GET 讀 / POST upsert per-(article, device) conversations row）
- `/api/push-subscribe` → `api/push-subscribe.ts`（寫 Turso）
- `/api/save` → `api/save.ts`（查 article、Notion dedupe lookup、upsert saves，sync lock 防併發 double-create）
- `/api/unsave` → `api/unsave.ts`（soft-hide saves via deleted_at；不刪 row、不動 notion_page_id、不刪 Notion page）
- `/api/feedback` → `api/feedback.ts`（delete-then-insert feedback）
- `/api/quiz-attempt` → `api/quiz-attempt.ts`（寫 `quiz_attempts`；`X-Device-Id` header 必填，缺就 400）
- **背景**：Hono `c.req.json()` / `c.req.text()` 在 `hono/vercel` Node.js adapter 上會 hang 到 300s timeout（GET 沒事，body 大小不是 trigger）。Edge Runtime 原生 `Request.json()` 沒這問題。診斷過 DB / libSQL / drizzle / VAPID 都不是病灶 — 結論是 Hono adapter 自己。所有 POST 已遷完（含 feedback 2026-04-26 復發後）。
- **規則**：以後任何**新的 POST endpoint 要讀 body**，直接寫 `api/<name>.ts` + `vercel.json` rewrite，**不要**加進 `src/api/app.ts`。Hono app 現在 read-only（`/api/feed`、`/api/library`、`/api/quiz`、`/api/activity` 皆 GET）。
- `vercel.json` 的 rewrite 順序：`/api/ask`、`/api/ask-history`、`/api/push-subscribe`、`/api/save`、`/api/unsave`、`/api/feedback`、`/api/quiz-attempt` 必須排在 `/api/:path* → /api/index` **前面**，不然會被 catch-all 吃掉送進 Hono。
- 不要為了 local dev 方便在 Hono app 裡複製一份 — 會 prompt drift / 行為不一致。
- 結果：本地 `npm run dev:api` 無法測這些 endpoint，要測請 push 到 Vercel preview。

**Quiz pipeline / 多使用者：**
- Quiz 出題完全獨立於文章 pipeline：不同 cron 檔（`quiz_sync.yml` 06:00 台北 vs `daily_sync.yml` 07:30 台北）、不同 entry（`quiz-pipeline.ts` vs `index.ts`）、不共用 selection 邏輯；共用的只有 `ai/select-provider.ts`（GPT/Claude 輪替）和同一顆 Turso DB
- Quiz dedup 用同一招：`getRecentQuizPrompts()` 撈近期已出過的題目 prompt，附加在 `QUIZ_SYSTEM` **尾端**（"AVOID REPEATING" 區塊），保 cache prefix 穩定 — 跟 classifier 的 `buildPreferenceContext()` 手法一致，不要重新發明
- `device_id` 是目前唯一的多使用者隔離機制（沒有帳號系統）：`feedback` / `saves` / `conversations` / `push_subscriptions` / `quiz_attempts` 都有 `device_id` 欄位，app 端由 `src/device.ts` 生成 UUID 存 AsyncStorage，每次 fetch 帶 `X-Device-Id` header。新增任何寫入型 endpoint 若涉及個人化資料，記得比照加 `device_id` 欄位 + header 檢查

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

## React Native App「Sift」(app/)

- **產品形態**：新聞（Feed，讀當日 AI brief）+ 遊戲化 quiz（Quiz，backend/infra 工程判斷力題目）雙軌，共用 Library / Activity / Ask 基礎設施。兩條內容各自獨立 pipeline 產生（見系統架構），app 端是統一的殼
- **Expo SDK 54**，以 Expo Go 開發封測中；目標發佈路徑是 TestFlight（EAS Build）
- **四分頁 bottom tab**：Quiz（✦ 今日題目）/ Feed（◎ 簡報）/ Library（⊟）/ Activity（紀錄 — 學習儀表板）
- **字型**：NotoSansTC 400/500/700/900 + JetBrains Mono 400/500/700，由 `@expo-google-fonts` 載入；App.tsx 等字型就緒才渲染
- **主題**：`src/theme.ts` 匯出 `T`（色彩）/ `FONT`（字型 key）/ `RADIUS` / `XP`（答對/答錯經驗值）；刻意鏡像 web/ dark theme，讓兩個 client 視覺一致
- **API**：`src/api.ts` 用 `Constants.expoConfig.hostUri` 自動抓 Metro LAN IP（dev），production build 固定走 `https://ai-morning-brief-chi.vercel.app`。**Expo Go dev 模式下 `hostUri` 永遠存在**，所以不設 override 的話一律假設 `npm run dev:api` 有在跑本地——沒開就整個打不通。`app/.env`（gitignored，不會被 push）目前設了 `EXPO_PUBLIC_API_BASE_URL` 固定指向 prod，讓日常用 Expo Go 不用開本地 server；要測後端改動時把這行註解掉即可切回本地自動偵測
- **SSE 追問**：`streamAsk()` 改用 `expo/fetch`（RN 原生 fetch 無法讀 streaming body）；Edge `/api/ask` 只存在於 Vercel，本地 dev server 沒有，開發時直接打 prod。Quiz 題目追問重用同一套 AskSheet + `/api/ask` + `/api/ask-history`，用合成 `articleId = quiz-${id}` 掛進 conversations table，**沒有**為 quiz 另開一套追問機制
- **Device ID**：`src/device.ts` 用 AsyncStorage 生成 UUID（key: `sift_device_id`），每次 fetch 帶 `X-Device-Id` header；貫穿 feedback / saves / conversations / push_subscriptions / quiz_attempts 五個 table，是多使用者隔離的唯一依據（無帳號系統）
- **Quiz 互動類型**：`single_choice` / `ordering` / `matching` / `fill_blank`（`api/quiz-attempt.ts` 記錄作答結果，寫入 `quiz_attempts`）；出題交由獨立 `quiz_sync.yml` cron，非即時生成
- **Activity（學習紀錄）**：`GET /api/activity`（Hono，read-only）回傳 heatmap / streak / 正確率，皆用 `X-Device-Id` 圈定範圍
- **不要**在 app/ 加 SW、manifest、VAPID 相關邏輯 — push 仍由 web/ PWA 負責
- **已知問題**：Quiz 分頁的 streak 是寫死的常數（跟 Activity 分頁算出來的真實 streak 對不上）、Feed 分頁的收藏狀態是純前端 local state（重整後會跟 Library 不同步）。完整清單見 [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)，動 `QuizScreen.tsx` / `FeedScreen.tsx` 前先看一眼

---

## Key Design Decisions

1. **Provider alternation**：GPT / Claude 按台北 day-of-year 奇偶輪替
2. **Rendering levels**：FULL / LIGHT / OMIT by brief generator
3. **Category tags**：#model-release #api-platform #infra-inference #tooling-open-source #benchmark-eval #agent-systems #policy-regulation #company-market #social-opinion #event-promo #research-adjacent
4. **Web design**：報紙 / FT editorial 風格，Source Serif 4 + JetBrains Mono
5. **Streak**：localStorage `mb_streak`，讀完最後一篇 +1
6. **Deploy**：Vercel free tier（[decisions/2026-04-26-v2-design.md](./docs/decisions/2026-04-26-v2-design.md) §4 決策）
7. **雙內容 pipeline 解耦**：Quiz 不依賴文章資料，獨立 cron / entry / dedup，只共用 provider 選擇邏輯和 DB。理由：兩條內容各自有自己的更新節奏和失敗模式，耦合在一起會讓文章 pipeline 的錯誤處理複雜化，也讓 quiz 沒辦法獨立重跑
8. **Quiz 追問重用文章 Ask 基礎設施**：用合成 `articleId = quiz-${id}` 讓 quiz 題目掛進既有的 `/api/ask` + `conversations` table，而不是為 quiz 另建一套追問系統——避免維護兩套幾乎一樣的 SSE + 歷史儲存邏輯
9. **多使用者靠 device_id，不做帳號系統**：AsyncStorage 生成 UUID 當身分依據，貫穿五張表。輕量但有已知限制：換裝置 = 換身分，資料不會跟著人走

---

## Working Rules for Claude Code

- 修改檔案後必須跑 `npm run build`，不准跳過
- 超過 10 輪對話後，編輯檔案前一律重新讀取該檔案
- 大任務拆獨立模組，不要一個 agent 硬扛
- `nvm use 20` 先跑，再跑任何 npm 指令
- 遇到前端 / mobile UI 問題，**先讀對應的 fix log 再動手**：`web/` 看 `docs/FRONTEND_FIX_LOG.md`，`app/` 看 `docs/FRONTEND_FIX_LOG_APP.md`
- 文件改動先看 `docs/README.md` 分清楚 living spec（跟 code 同步）vs `docs/decisions/`（凍結，不改）——不要把新事實寫進 `decisions/` 底下的檔案
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
