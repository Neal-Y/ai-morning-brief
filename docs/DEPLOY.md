# Deploy & Local Setup

操作手冊，不是給外部讀者看的工程判斷文件——那些在 [README.md](../README.md)。

---

## Quick Start

```bash
# Backend pipeline + API
nvm use 20
npm install
cp .env.example .env   # 填入 keys
npm run dev:api        # Hono API (port 3001)

# Frontend (web PWA)
cd web && npm install
npm run dev            # Vite dev (port 5173, proxy → 3001)
```

手動跑一次文章 pipeline（會真的寫 DB + 推 Web Push）：

```bash
npm run dev:pipeline
```

手動跑一次 quiz pipeline（會真的寫 DB，出 5 題）：

```bash
npm run dev:quiz
```

產生 VAPID keys（Web Push 需要）：

```bash
npx web-push generate-vapid-keys
```

React Native app（Expo Go 開發）：

```bash
cd app && npx expo start
cd app && npx expo start --ios   # iOS Simulator
```

---

## Deploy

### GitHub Actions（兩條獨立 pipeline）

1. Push 到 GitHub
2. Settings → Secrets → Actions，新增以下 secrets：
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   - `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
   - `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
3. 兩個 workflow 各自排程，互不影響：
   - `daily_sync.yml`：每天台灣時間 07:30，文章 pipeline
   - `quiz_sync.yml`：每天台灣時間 06:00，quiz pipeline

手動觸發：Actions → 對應 workflow → Run workflow

### Vercel（Web + API）

```bash
vercel deploy
```

`api/index.ts`（Hono read-only：`/api/feed`、`/api/library`、`/api/quiz`、`/api/activity`）+ `api/ask.ts` + `api/ask-history.ts` + `api/push-subscribe.ts` + `api/save.ts` + `api/unsave.ts` + `api/feedback.ts` + `api/quiz-attempt.ts`（皆 Edge Runtime）分別部署為 Vercel Functions。`web/` 為靜態 React PWA。

`vercel.json` 的 rewrite 順序：所有 Edge endpoint 必須排在 `/api/:path* → /api/index` catch-all **前面**，否則會被吞進 Hono。

---

## Environment Variables

### Pipeline + Server (GitHub Actions secrets / Vercel env)

| Variable              | Required               | Description                          |
| --------------------- | ----------------------- | ------------------------------------ |
| `TURSO_DATABASE_URL`  | ✅                     | libsql://xxx.turso.io（client 內部換成 https://）|
| `TURSO_AUTH_TOKEN`    | ✅                     | Turso JWT token                      |
| `AI_PROVIDER`         | ✅                     | `openai` / `anthropic` / `alternate`（文章與 quiz pipeline 共用同一個選擇邏輯） |
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
