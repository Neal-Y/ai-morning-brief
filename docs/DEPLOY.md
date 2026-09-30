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
npm run dev            # Vite dev (port 5173)
```

`web/vite.config.ts` proxies two different targets depending on the route (2026-09-07):

- `/api/library`, `/api/quiz`, `/api/activity` → `http://localhost:3001` (local Hono dev server, read-only GET)
- `/api/feed`, `/api/ask`, `/api/ask-history`, `/api/save`, `/api/unsave`, `/api/feedback`, `/api/quiz-attempt`, `/api/push-subscribe` → `https://ai-morning-brief-chi.vercel.app` (these are Edge Runtime functions and only exist on Vercel; the local Hono server has no equivalent)

This means `cd web && npm run dev` alone (no `npm run dev:api` needed for POST routes) can exercise quiz answering, follow-ups, saving, and feedback. **Side effect on purpose: local 👍 / 🔖 / quiz attempts write to the production Turso DB.** This isn't new exposure — the local API server already reads/writes that same DB — but know that clicks during local dev are real rows, not sandboxed.

The proxy match for the Edge routes is an anchored regex ending in `(\?|$)` rather than `$`, because Vite tests proxy keys against the full `req.url` including the query string. It's listed before the catch-all `/api` key — first matching key wins, so order in `vite.config.ts` matters if you add routes.

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

React Native app（Expo Go 開發 — **暫時擱置，2026-09-07**：四分頁已原樣搬進 web PWA，`app/` 程式碼不動、Expo Go 下仍可跑，只是不再是主力 client；EAS Build → TestFlight 在目前使用量下先不投資，等用量提高再評估）：

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
3. 三個 workflow 各自排程，互不影響（都用上面同一組 secrets）：
   - `daily_sync.yml`：每天台灣時間 07:07，文章 pipeline
   - `quiz_sync.yml`：每天台灣時間 05:47，quiz pipeline
   - `reminder_sync.yml`：每天台灣時間 15:53（目標 16:00 前後），下午提醒推播。只需要 `TURSO_*` + `VAPID_*`，也有 `dry_run` 勾選框（只印會推給誰）

手動觸發：Actions → 對應 workflow → Run workflow

**試跑（dry run）**：AI Morning Brief 的 Run workflow 有 `dry_run` 勾選框。勾了就只抓文章 + 分類，在 log 印出每篇的分數、bucket、工程影響和「會選哪幾篇」，不寫 DB、不推播（仍會花一次 classifier 的 LLM 費用）。新增 RSS 來源後用它確認網址抓得到（抓不到會在 log 看到 `[rss] Failed to fetch <name>`）。

**同一天不會推兩次（2026-10-01）**：`src/index.ts` 開跑先查 `articles` 有沒有今天的 `brief_date`，有就直接結束（exit 0）。所以排程晚到、手動補跑、外部觸發同時存在也不會重複推播。真的要重跑就勾 `force`。起因：2026-10-01 07:31 排程還沒跑（同一天 05:47 的出題也晚了 1.5 小時以上，前一天晚了 3 小時）。

**為什麼是 07:07 / 05:47 而不是整點（2026-09-30）**：GitHub Actions 的 schedule 是 best-effort，整點和半點是最多人排的時段，塞車時會延後甚至跳過。原本 `30 23 * * *`（07:30）在 2026-08-22~26 大多只晚 10–15 分，但 08-27~29 晚了 5–7 小時（12:34 / 14:58 / 12:12 才跑）。改到非整點能降低延遲，但不保證準時；如果還是常晚，下一步是用外部排程（例如 cron-job.org）打 GitHub API 的 `workflow_dispatch`，代價是要把一組有 `actions:write` 權限的 token 放到第三方。

另外 2026-08-29 ~ 09-29 兩個 workflow 都被手動停用（使用者覺得選文篩選不夠好，想之後再處理），所以這段期間沒有簡報、也沒有推播——不是排程壞掉。Actions 頁面看到的空窗就是這個。

### Vercel（Web + API）

```bash
vercel deploy
```

`api/index.ts`（Hono read-only：`/api/library`、`/api/quiz`、`/api/activity`）+ `api/feed.ts` + `api/ask.ts` + `api/ask-history.ts` + `api/push-subscribe.ts` + `api/save.ts` + `api/unsave.ts` + `api/feedback.ts` + `api/quiz-attempt.ts`（皆 Edge Runtime）分別部署為 Vercel Functions。`web/` 為靜態 React PWA。

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

Notion sync 失敗不阻斷收藏：`saves` row 仍寫入（`notion_page_id = NULL`），下次點同一篇自動 retry。再次 save 前先用 Notion `Article ID` property 查重，有既有 page 直接 reuse，不建新頁。`/api/unsave` 是硬刪除 `saves` row（不刪 Notion page）——不需要保留 row，因為重存的查重是直接查 Notion，不靠本地 row。

`alternate` 模式：偶數天（年內第幾天）→ GPT-4o，奇數天 → Claude Sonnet 4.6。
