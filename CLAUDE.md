# AI Morning Brief

每日自動化技術情報系統：RSS → LLM 分析 → Turso DB → Web PWA。

## TL;DR（新 session 先看這段）

- 整條 pipeline 已上線：GitHub Actions 每天 07:30 台北時間跑 → 寫 Turso DB → **Web Push** 推播。
- Vercel 部署完成：`ai-morning-brief.vercel.app`（Hono API + React PWA + Edge Runtime functions）。
- **ntfy 已淘汰**（2026-04-25），現在唯一推播管道是 Web Push（VAPID + iOS standalone PWA）。
- 前端已過 5 輪 iPhone standalone PWA 穩定化（細節看 `docs/FRONTEND_FIX_LOG.md`，不要在這裡重複翻修）。第 5 輪拔掉了 `vite-plugin-pwa`；現在 SW (`web/public/sw.js`) 是真正的 push handler（`push` + `notificationclick` events，無 fetch cache）。
- Classifier 已吃進 feedback（V2 Investment 環節核心），近 30 天 / 20 筆 / 門檻 10 筆。Anthropic cache 有拆 prefix（穩定部分跨天保留）。
- **F4 Notion 整合（2026-04-25）**：🔖 → `api/save.ts` Edge Runtime → Notion REST API（raw fetch，無 SDK）建 page，DB 端 `saves.articleId` unique，Notion 失敗仍寫 saves（`notion_page_id = NULL`），下次再點會 retry。
- **下一個大事**：收藏時順手生成 quiz（F5）。

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
  └─ POST /api/feedback     # up/down（delete-then-insert，同 articleId 只留最新）

Edge functions（Vercel 獨立路由，不走 Hono — 詳見 Conventions）
  ├─ POST /api/ask              # api/ask.ts — Haiku 4.5 SSE streaming 追問
  ├─ POST /api/push-subscribe   # api/push-subscribe.ts — 寫 push_subscriptions
  └─ POST /api/save             # api/save.ts — 查 article + Notion 建 page + upsert saves

React PWA (web/)
  ├─ 滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / Celebration
  └─ Splash gate：iOS standalone 第一次開啟 → 請求 notification permission → 寫 subscription
```

---

## 功能狀態

| 功能 | 狀態 | 備註 |
|---|---|---|
| RSS → 分類 → 寫 Turso | ✅ | V1 遺留，穩定 |
| Web Push 推播 | ✅ | 標題 = lead story title, body = 「Hard Tech AI／Signals」section labels |
| Turso DB 寫入 | ✅ | article id = SHA-256(url).slice(0,16)；client 用 `https://` 而非 `libsql://`（serverless friendly） |
| Vercel 部署 | ✅ | `api/index.ts` (Hono) + `api/ask.ts` & `api/push-subscribe.ts` (Edge) |
| PWA 卡片 UI | ✅ | iPhone standalone 已穩定，細節見 FRONTEND_FIX_LOG |
| 👍👎 → DB | ✅ | delete-then-insert 防誤按 |
| 💬 追問（Haiku SSE） | ✅ | `api/ask.ts` Edge Runtime raw fetch |
| Classifier 吃 feedback | ✅ | 近 30 天 / 20 筆 / 門檻 10；偏好附 system prompt 尾端 |
| 🔖 Notion 整合 | ✅ | `api/save.ts` Edge Runtime + raw fetch；Notion 失敗 graceful（saves 仍寫，notion_page_id null，下次 retry） |
| Quiz 生成 | ⏳ 未做 | `quizzes` table 已建 schema |
| 晨間 Recall Quiz | ⏳ 未做 | 需先有 quiz 資料 |
| Skill-tag 雙軸 | ⏳ 未做 | schema 已有 `skillTags`，classifier 沒產 |
| 週報 | ⏳ 未做 | |

---

## 下一步（按優先順序）

1. **收藏時生成 quiz (F5 起點)** — Haiku 順手產 QA pair，存 `quizzes` table。
2. **晨間 recall quiz** — 打開 app 先答 3/7/14 天前的卡。
3. **Skill-tag 產出** — classifier 加 `skillTags` 欄位。
4. **Notion 強化（v1.1）** — 失敗 backfill cron、conversations 寫回後塞進 page、筆記輸入 UI。
5. **通知文案再優化**（觀察一週通知品質後評估）：
   - 目前 lead = `displayedItems[0].title`（最高分 HARD_TECH_AI 的 RSS 原標）
   - 真實 case 看下來如果 lead 經常很弱，考慮讓 brief generator 多輸出一個 `lead: { articleId, headline }` 欄位（同一次 LLM call 改 schema，cost = 0）
6. **Classifier 偏好 v2**（跑一週後評估再動，**不要提早優化**）：
   - 明確 exploration slot（非 filler 副產品）
   - `selectionReason` / `wasFiller` 欄位
   - 前端 feedback undo
   - 時間衰減權重

---

## 待確認（真機 / 部署）

- [x] `/api/feed?date=...` 在 Vercel 上正常回傳
- [x] `/api/push-subscribe` 寫入 `push_subscriptions` table（Edge Runtime，已驗證 2026-04-25）
- [x] GitHub Actions secrets 已設 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` + `VAPID_*`
- [ ] 連續 3 天 07:30 自動觸發都能成功收到 Web Push（觀察一週）

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
  db/schema.ts        # articles / feedback / saves (article_id unique) / conversations / quizzes / push_subscriptions
  db/client.ts        # libSQL client (https://) + getRecentFeedback()
  api/app.ts          # Hono app（/api/feed /api/feedback）
  api/server.ts       # 本地 dev (port 3001)
api/index.ts             # Vercel entry (hono/vercel handle)
api/ask.ts               # Edge Runtime SSE for /api/ask
api/push-subscribe.ts    # Edge Runtime POST → Turso HTTP API（寫 push_subscriptions）
api/save.ts              # Edge Runtime POST → Notion + Turso HTTP API（建 page + upsert saves）
vercel.json
web/
  index.html
  public/manifest.json · apple-touch-icon.png · icon-512.svg
  public/sw.js          # push handler SW（push + notificationclick events）
  src/App.tsx           # swipe 物理 + streak + push permission gate
  src/push.ts           # isPushSupported / isStandalone / completeSubscription
  src/components/
    Card.tsx · Chrome.tsx · AskSheet.tsx · Celebration.tsx
  src/{date,theme,types}.ts · index.css
  vite.config.ts
scripts/seed.ts
docs/
  PROPOSAL.md         # V1 spec
  V2_DESIGN.md        # V2 產品藍圖 + phased rollout
  FRONTEND_FIX_LOG.md # 前端 / mobile UI 修復史（先讀這份再動 UI）
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
- `saves.articleId` 是 unique（一篇一筆）；`/api/save` handler 自己做 select-then-update / insert，不依賴 Drizzle upsert（Edge Runtime 用 raw Turso HTTP API）
- Notion sync 失敗不阻斷收藏：寫 `saves` row 但 `notion_page_id = NULL`，回 `{ ok: true, notionSynced: false }`，下次同篇再點會 retry

**Classifier 偏好：**
- Preference context **必須附加在 system prompt 尾端**（保 cache prefix，不要插中間／開頭）
- `classifyArticles` 透過 `string[]` 形式呼叫 provider — `[CLASSIFIER_SYSTEM, preferenceContext]`，AnthropicProvider 只在第一個 block 打 cache_control，穩定 prefix 跨天不會被變動的偏好 invalidate
- Cold-start 門檻 10 筆，低於門檻一律不注入（防過擬合）
- 👎 per-category 要 ≥ 2 次才算負訊號（單一 👎 可能只是當天心情，別當真）

**Edge Runtime endpoints（POST 一律走這裡，不要進 Hono）：**
- `/api/ask` → `api/ask.ts`（SSE streaming）
- `/api/push-subscribe` → `api/push-subscribe.ts`（寫 Turso）
- `/api/save` → `api/save.ts`（查 article、Notion 建 page、upsert saves）
- **背景**：Hono 的 body parser 在 `hono/vercel` Node.js adapter 上會 hang —— `c.req.json()` / `c.req.text()` 對某些 POST 永遠不 resolve，function 撐到 300s timeout 才回 504。GET 沒事，不是 DB / libSQL / drizzle / VAPID 的問題（全試過了）。改用 Edge Runtime 的原生 `Request.json()` 就 OK。
- **規則**：以後任何**新的 POST endpoint 要讀 body**，直接寫 `api/<name>.ts` + `vercel.json` rewrite，**不要**加進 `src/api/app.ts`。
- `vercel.json` 的 rewrite 順序：`/api/ask`、`/api/push-subscribe`、`/api/save` 必須排在 `/api/:path* → /api/index` **前面**，不然會被 catch-all 吃掉送進 Hono。
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
- 當天有文章：通知標題 = `displayedItems[0].title`（lead story），副標 = active section labels（`Hard Tech AI／Signals`）。當天無文章：標題 = `AI Morning Brief {date}`、副標 = `今日無重大 AI 新聞`。

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
