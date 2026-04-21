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

Hono API server (src/api/server.ts)
  ├─ GET  /api/feed?date=   # 從 Turso 讀當日文章
  ├─ POST /api/feedback     # 記錄 up/down
  └─ POST /api/save         # 儲存文章

React PWA (web/)
  └─ 每日讀取 /api/feed 顯示卡片
```

## 最重要的待辦：Vercel 部署

**目前狀態**：整條 pipeline 本地跑通（RSS → LLM → ntfy → Turso DB ✅）。
Web + API 只跑在 localhost，iPhone 連不到。

**要做的事**：部署到 Vercel（V2_DESIGN.md 已決策），讓 iPhone 可以加主畫面使用。

### Vercel 部署步驟
1. Hono server 改成 Vercel serverless 入口（`api/index.ts` + `@hono/vercel` adapter）
2. 根目錄加 `vercel.json`（routing：`/api/*` → serverless，`/` → web static）
3. `vercel.json` 設定 build：web 用 Vite，api 用 tsc
4. Vercel dashboard 設定 env vars（同 `.env`：TURSO_*, OPENAI_API_KEY, ANTHROPIC_API_KEY, NTFY_TOPIC）
5. Push → 自動部署

### 其次：AskSheet 真實 API（Week 2）
- 目前 AskSheet SEND 回假字串
- 需要 `POST /api/ask` endpoint（Hono + Anthropic Haiku 4.5 SSE streaming）
- AskSheet.tsx 改成真的打 `/api/ask`，顯示 streaming 回應

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
  api/server.ts       # Hono API server（port 3001，本地開發用）
web/
  public/
    manifest.json     # PWA manifest（name: Morning Brief）
    apple-touch-icon.png  # 180x180 dark+gold sift icon
    icon-512.svg      # SVG version
  src/App.tsx         # 主 app：swipe 物理、streak、tweaks
  src/components/
    Card.tsx          # 文章卡片（editorial 設計）
    Chrome.tsx        # TopChrome header + FeedbackBar
    AskSheet.tsx      # ASK 底部 sheet（⚠️ 目前是 stub，回假字串）
    Celebration.tsx   # 讀完畫面
  src/theme.ts        # 顏色 tokens + ACCENT_PRESETS
  src/types.ts        # Article, FeedResponse types
  src/index.css       # keyframe 動畫
scripts/
  seed.ts             # 本地開發用假資料（3 篇）
docs/
  PROPOSAL.md         # V1 完整 spec
  V2_DESIGN.md        # V2 產品設計（部署、功能藍圖）
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
