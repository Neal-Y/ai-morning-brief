# AI Morning Brief

每日自動化技術情報系統：RSS → LLM 分析 → Turso DB → Web PWA。

## 系統架構（v2）

```
GitHub Actions cron (daily 台北 07:30)
  └─ src/index.ts          # pipeline 入口
       ├─ rss/feed.ts      # RSS ingestion & 24h filtering
       ├─ ai/classifier.ts # per-article LLM 分類（parallel, concurrency=3）
       ├─ ai/brief.ts      # brief generator（一次 LLM call）
       ├─ notify/ntfy.ts   # ntfy 推播
       └─ notify/db-writer.ts  # upsert 文章到 Turso DB ✅

Hono API server (src/api/app.ts → api/index.ts on Vercel)
  ├─ GET  /api/feed?date=   # 從 Turso 讀當日文章
  ├─ POST /api/feedback     # 記錄 up/down
  ├─ POST /api/save         # 儲存文章
  └─ POST /api/ask          # Haiku 4.5 SSE streaming 追問

React PWA (web/)
  └─ 每日讀取 /api/feed 顯示卡片
```

## 目前狀態

整條 pipeline 跑通（RSS → LLM → ntfy → Turso DB ✅）。
Vercel 部署成功上線 ✅（ai-morning-brief.vercel.app）。

### 已完成
- ✅ Vercel 部署：`api/index.ts`（hono/vercel handle）+ `vercel.json`
- ✅ `/api/ask` SSE streaming（Anthropic Haiku 4.5，multi-turn）
- ✅ AskSheet 真實串流（fetch + ReadableStream，不再是 stub）
- ✅ 前端穩定化第一輪（2026-04-22）
  - AskSheet 串流跳動已修正（rAF batching + stick-to-bottom scroll）
  - Ask close / article switch 會 abort in-flight request
  - Card 底部大空白已修正（Engineering Impact 貼底）
  - feed / seed / API 日期改為 Taipei date，不再用 UTC `toISOString().slice(0, 10)`
  - Celebration `READ` 不再寫死 `3`
  - App root 高度改吃 `visualViewport` / `innerHeight`，降低手機 viewport 抖動
  - 詳細交接看 `docs/FRONTEND_FIX_LOG.md`

### 待確認
- `/api/feed` 在 Vercel 上是否正常回傳（目前 App 卡 LOADING，可能是 DB 連線問題）
  - 直接開 `/api/feed?date=今日日期` 確認 JSON 回傳
  - 若 500 → 去 Vercel dashboard → Functions log 查原因
- GitHub Actions secrets 是否已有 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`（daily_sync.yml 需要）
- 真機 iPhone 上 Ask 輸入時是否仍有 keyboard / viewport 抖動
  - 若仍抖 → 做更深的 `visualViewport` + keyboard avoidance
  - 先看 `docs/FRONTEND_FIX_LOG.md` 的 Remaining Risk，再決定是否要追加修

### 下一步（按優先順序）
1. **Classifier 吃進 feedback**：feedback 已寫 DB，但 classifier prompt 還沒帶入最近 N 筆偏好（V2 Investment 環節核心）
   - `src/ai/classifier.ts` 在 prompt 加入 feedback 查詢
   - `src/db/client.ts` 加 `getRecentFeedback()` helper
2. **Notion 整合**（F4）：🔖 → 自動建 Notion page，zero 手動整理
3. **收藏時生成 quiz 題目**，存入 `quizzes` table
4. **晨間 recall quiz**（打開 app 先回答 3/7/14 天前的卡）

## Project Structure

```
src/
  index.ts            # pipeline 入口：fetch → classify → ntfy → db-write
  config.ts           # env loading, RSS sources, keyword weights, constants
  rss/feed.ts         # RSS ingestion & 24h filtering
  ai/provider.ts      # AIProvider interface + 所有共用 types
  ai/classifier.ts    # per-article LLM classifier
  ai/brief.ts         # brief generator + degraded fallback
  ai/retry.ts         # withRetry helper
  ai/openai.ts        # OpenAI implementation
  ai/anthropic.ts     # Anthropic implementation
  notify/ntfy.ts      # ntfy push delivery
  notify/db-writer.ts # Turso upsert（BriefResult + ClassifiedArticle[] → articles table）
  db/schema.ts        # Drizzle schema（articles, feedback, saves, conversations, quizzes）
  db/client.ts        # Turso libSQL client
  api/app.ts          # Hono app 定義（所有路由，含 /api/ask SSE）
  api/server.ts       # 本地開發用：import app + serve（port 3001）
  date.ts             # Taipei date helper（YYYY-MM-DD）
web/
  public/
    manifest.json     # PWA manifest（name: Morning Brief）
    apple-touch-icon.png  # 180x180 dark+gold sift icon
    icon-512.svg      # SVG version
  src/App.tsx         # 主 app：swipe 物理、streak、tweaks
  src/components/
    Card.tsx          # 文章卡片（editorial 設計）
    Chrome.tsx        # TopChrome header + FeedbackBar
    AskSheet.tsx      # ASK 底部 sheet（真實 SSE streaming，multi-turn）
    Celebration.tsx   # 讀完畫面
  src/date.ts         # brief date formatting + viewport height helper
  src/theme.ts        # 顏色 tokens + ACCENT_PRESETS
  src/types.ts        # Article, FeedResponse types
  src/index.css       # keyframe 動畫
scripts/
  seed.ts             # 本地開發用假資料（3 篇）
docs/
  PROPOSAL.md         # V1 完整 spec
  V2_DESIGN.md        # V2 產品設計（部署、功能藍圖）
  FRONTEND_FIX_LOG.md # 2026-04-22 前端修復交接紀錄（症狀/原因/修法/驗證）
.github/workflows/
  daily_sync.yml      # cron 07:30 台北，secrets 包含 TURSO_* ✅
```

## Commands

```bash
# Pipeline
npm run build          # tsc
npm run dev:pipeline   # tsx src/index.ts（需 .env，會真的推 ntfy + 寫 DB）
npm run dev:api        # Hono API server（port 3001）

# Web（需先 nvm use 20）
cd web && npm run dev  # Vite dev server（port 5173，proxy → 3001）

# DB
npm run db:seed        # 寫入 3 篇假文章（今日日期）
```

## Env Vars

```
TURSO_DATABASE_URL    # libsql://xxx.turso.io
TURSO_AUTH_TOKEN      # JWT token
NTFY_TOPIC            # ntfy topic name
AI_PROVIDER           # "openai" | "anthropic" | "alternate"
OPENAI_API_KEY
ANTHROPIC_API_KEY
```

## Conventions

- Node.js 20+（`nvm use 20`）— Vite 5 和 tsx --env-file 都需要。
- All env vars via `process.env` — never hardcode keys.
- Provider Pattern: every AI backend implements `AIProvider` interface.
- LLM output in Traditional Chinese.
- Classifier concurrency capped at 3（Anthropic free-tier TPM limit）.
- Selection caps: `HARD_TECH_MAX=2`, `SIGNALS_MAX=1`, `BRIEF_MAX=3`.
- Filler logic: if HARD_TECH + SIGNALS < 3，top-scoring DROP 文章填槽（renderLevel→LIGHT）。
- DB upsert 用 `onConflictDoUpdate`（不要用 `onConflictDoNothing`，count log 會誤報）。
- db-writer: article id = SHA-256(url).slice(0,16)，conflict target = articles.url。

## Key Design Decisions

1. **Provider alternation**: GPT/Claude 每日輪替，Taipei day-of-year parity。
2. **Rendering levels**: FULL / LIGHT / OMIT — brief generator 決定。
3. **Tag system**: #model-release #api-platform #infra #tooling #eval #agent #policy #market #research
4. **Web design**: 報紙/FT editorial 風格，Source Serif 4 + JetBrains Mono，方角（borderRadius: 2）。
5. **Streak**: 從 localStorage `mb_streak` 讀，讀完最後一篇 +1。
6. **Deploy target**: Vercel free tier（V2_DESIGN.md 決策）。

## Working Rules for Claude Code

- 修改檔案後必須跑 `npm run build`，不准跳過。
- 超過 10 輪對話後，編輯檔案前一律重新讀取該檔案。
- 大任務拆成獨立模組，不要一個 Agent 硬扛。
- nvm use 20 先跑，再跑任何 npm 指令。
- 遇到前端 / mobile UI 問題，先讀 `docs/FRONTEND_FIX_LOG.md` 再動手。
