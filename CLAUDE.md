# AI Morning Brief

每日自動化技術情報系統：RSS → LLM 分析 → Turso DB → Web PWA。

## TL;DR（新 session 先看這段）

- 整條 pipeline 已上線：GitHub Actions 每天 07:30 台北時間跑 → ntfy 推播 + 寫 Turso DB。
- Vercel 部署完成：`ai-morning-brief.vercel.app`（Hono API + React PWA）。
- 前端已過 5 輪 iPhone standalone PWA 穩定化（細節看 `docs/FRONTEND_FIX_LOG.md`，不要在這裡重複翻修）。第 5 輪拔掉了 `vite-plugin-pwa`，PWA 是靜態 manifest + kill-switch SW，**沒有** service worker cache。
- Classifier 已吃進 feedback（V2 Investment 環節核心），近 30 天 / 20 筆 / 門檻 10 筆。Anthropic cache 有拆 prefix（穩定部分跨天保留）。
- **下一個大事**：Notion 整合（F4），🔖 → 自動建 page。

---

## 系統架構

```
GitHub Actions cron (daily 台北 07:30)
  └─ src/index.ts                     # pipeline 入口
       ├─ rss/feed.ts                 # RSS ingestion + 24h filter + 關鍵字打分
       ├─ db/client.getRecentFeedback # 讀近 30 天 feedback 作為偏好 context
       ├─ ai/classifier.ts            # per-article LLM 分類（concurrency=3）
       ├─ ai/brief.ts                 # brief generator（一次 LLM call）
       ├─ notify/ntfy.ts              # ntfy 推播
       └─ notify/db-writer.ts         # upsert 文章到 Turso

Hono API (src/api/app.ts → api/index.ts on Vercel)
  ├─ GET  /api/feed?date=   # 從 Turso 讀當日文章
  ├─ POST /api/feedback     # up/down（delete-then-insert，同 articleId 只留最新）
  └─ POST /api/save         # 儲存文章（Notion 整合未接）

Edge function (api/ask.ts — Vercel 獨立路由，不走 Hono)
  └─ POST /api/ask          # Haiku 4.5 SSE streaming 追問（raw fetch，multi-turn）

React PWA (web/)
  └─ 滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / Celebration
```

---

## 功能狀態

| 功能 | 狀態 | 備註 |
|---|---|---|
| RSS → 分類 → 推播 | ✅ | V1 遺留，穩定 |
| Turso DB 寫入 | ✅ | article id = SHA-256(url).slice(0,16) |
| Vercel 部署 | ✅ | `api/index.ts` + `vercel.json` |
| PWA 卡片 UI | ✅ | iPhone standalone 已穩定，細節見 FRONTEND_FIX_LOG |
| 👍👎 → DB | ✅ | delete-then-insert 防誤按 |
| 💬 追問（Haiku SSE） | ✅ | `api/ask.ts` Edge Runtime raw fetch（不在 Hono 裡） |
| Classifier 吃 feedback | ✅ | 近 30 天 / 20 筆 / 門檻 10；偏好附 system prompt 尾端 |
| 🔖 Notion 整合 | ⏳ 未做 | 下一項 |
| Quiz 生成 | ⏳ 未做 | `quizzes` table 已建 schema |
| 晨間 Recall Quiz | ⏳ 未做 | 需先有 quiz 資料 |
| Skill-tag 雙軸 | ⏳ 未做 | schema 已有 `skillTags`，classifier 沒產 |
| 週報 | ⏳ 未做 | |

---

## 下一步（按優先順序）

1. **Notion 整合 (F4)** — 🔖 → 自動建 Notion page；解決「想做筆記最後沒做」痛點。
2. **收藏時生成 quiz** — Haiku 順手產 QA pair，存 `quizzes` table。
3. **晨間 recall quiz** — 打開 app 先答 3/7/14 天前的卡。
4. **Skill-tag 產出** — classifier 加 `skillTags` 欄位。
5. **Classifier 偏好 v2**（跑一週後評估再動，**不要提早優化**）：
   - 明確 exploration slot（非 filler 副產品）
   - `selectionReason` / `wasFiller` 欄位
   - 前端 feedback undo
   - 時間衰減權重

---

## 待確認（真機 / 部署）

- [ ] `/api/feed?date=...` 在 Vercel 上正常回傳（500 就看 Functions log）
- [ ] GitHub Actions secrets 已設 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`

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
  notify/ntfy.ts
  notify/db-writer.ts # Turso upsert
  db/schema.ts        # articles / feedback / saves / conversations / quizzes
  db/client.ts        # libSQL client + getRecentFeedback()
  api/app.ts          # Hono app（/api/feed /api/feedback /api/save /api/ask）
  api/server.ts       # 本地 dev (port 3001)
api/index.ts          # Vercel entry (hono/vercel handle)
api/ask.ts            # Vercel Edge runtime SSE for /api/ask
vercel.json
web/
  index.html
  public/manifest.json · apple-touch-icon.png · icon-512.svg
  src/App.tsx         # swipe 物理 + streak
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
npm run dev:pipeline   # tsx src/index.ts（會真的推 ntfy + 寫 DB）
npm run dev:api        # Hono API server (port 3001)

# Web
cd web && npm run dev  # Vite dev (port 5173, proxy → 3001)

# DB
npm run db:seed        # 3 篇假文章（今日日期）
```

## Env Vars

```
TURSO_DATABASE_URL    # libsql://xxx.turso.io
TURSO_AUTH_TOKEN      # JWT
NTFY_TOPIC
AI_PROVIDER           # "openai" | "anthropic" | "alternate"
OPENAI_API_KEY
ANTHROPIC_API_KEY
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
- DB upsert 一律用 `onConflictDoUpdate`（用 `onConflictDoNothing` 會讓 count log 誤報）
- db-writer 的 conflict target 是 `articles.url`

**Classifier 偏好：**
- Preference context **必須附加在 system prompt 尾端**（保 cache prefix，不要插中間／開頭）
- `classifyArticles` 透過 `string[]` 形式呼叫 provider — `[CLASSIFIER_SYSTEM, preferenceContext]`，AnthropicProvider 只在第一個 block 打 cache_control，穩定 prefix 跨天不會被變動的偏好 invalidate
- Cold-start 門檻 10 筆，低於門檻一律不注入（防過擬合）
- 👎 per-category 要 ≥ 2 次才算負訊號（單一 👎 可能只是當天心情，別當真）

**Edge Runtime endpoints（POST 一律走這裡，不要進 Hono）：**
- `/api/ask` → `api/ask.ts`（SSE streaming）
- `/api/push-subscribe` → `api/push-subscribe.ts`（寫 Turso）
- **背景**：Hono 的 body parser 在 `hono/vercel` Node.js adapter 上會 hang —— `c.req.json()` / `c.req.text()` 對某些 POST 永遠不 resolve，function 撐到 300s timeout 才回 504。GET 沒事，不是 DB / libSQL / drizzle / VAPID 的問題（全試過了）。改用 Edge Runtime 的原生 `Request.json()` 就 OK。
- **規則**：以後任何**新的 POST endpoint 要讀 body**，直接寫 `api/<name>.ts` + `vercel.json` rewrite，**不要**加進 `src/api/app.ts`。
- `vercel.json` 的 rewrite 順序：`/api/ask` 和 `/api/push-subscribe` 必須排在 `/api/:path* → /api/index` **前面**，不然會被 catch-all 吃掉送進 Hono。
- 不要為了 local dev 方便在 Hono app 裡複製一份 — 會 prompt drift / 行為不一致。
- 結果：本地 `npm run dev:api` 無法測這些 endpoint，要測請 push 到 Vercel preview。

**PWA / Service Worker：**
- **不要**重新加 `vite-plugin-pwa` 或其他 SW 產生器。app 是「每天開一次抓新資料」，沒有 offline 需求，SW 只會製造 cache 地獄（見 FRONTEND_FIX_LOG Issue 14）。
- Manifest 用靜態 `web/public/manifest.json`（index.html 單一 `<link rel="manifest">`）。
- `theme_color` / `background_color` / `<meta name="theme-color">` 三處必須全部對齊 `T.bg = #14110D`，不然 iOS standalone 會出現 status bar 色差「框框」。
- `web/public/sw.js` 是 kill-switch（自動 unregister + 清 cache），不是正常 SW — 確定沒用戶卡在舊 PWA 版本前不要刪。

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
