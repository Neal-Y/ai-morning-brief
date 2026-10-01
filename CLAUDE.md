# AI Morning Brief（產品名「Sift」）

雙軌內容系統：(1) RSS → LLM 分析 → 每日技術簡報（V1 遺留，穩定） (2) LLM 出題 → backend/infra 判斷力 quiz（遊戲化學習）。兩條 pipeline 各自獨立產生，共用同一顆 Turso DB + 同一個 client 殼（Web PWA 為主力，React Native App「Sift」暫時擱置）。

## 回話風格（節省 token）

簡單、扼要、結論有力。不要客套、不要為了銜接寫過場廢話、不要重述我剛說過的話、不要做完一件小事就長篇報告。
直接給結論與理由；要我決定時給選項+推薦，不要鋪陳。程式碼/設計的取捨該講還是要講（mentor 原則不變），但用最少的字講完。

## TL;DR（新 session 先看這段）

- 整條 pipeline 已上線：GitHub Actions 每天 07:07 台北時間跑 → 寫 Turso DB → **Web Push** 推播。
- Vercel 部署完成：`ai-morning-brief-chi.vercel.app`（React PWA + Edge Runtime functions；2026-10-01 起沒有 Node/Hono 後端）。
- **ntfy 已淘汰**（2026-04-25），現在唯一推播管道是 Web Push（VAPID + iOS standalone PWA）。
- 前端已過 5 輪 iPhone standalone PWA 穩定化（細節看 `docs/FRONTEND_FIX_LOG.md`，不要在這裡重複翻修）。第 5 輪拔掉了 `vite-plugin-pwa`；現在 SW (`web/public/sw.js`) 是真正的 push handler（`push` + `notificationclick` events，無 fetch cache）。
- **iPhone standalone PWA footer gap 已收斂（2026-04-28）**：最終解是延伸 root height 到 `100dvh + safe-area-inset-bottom`，再把 bottom dock 作為 extended root 內的 absolute layer。不要回到 fixed footer / negative safe-area offset；細節見 `docs/FRONTEND_FIX_LOG.md` Issue 6。
- Classifier 已吃進 feedback（V2 Investment 環節核心），近 30 天 / 20 筆 / 門檻 10 筆。Anthropic cache 有拆 prefix（穩定部分跨天保留）。
- **F4 Notion 整合（2026-04-25，dedupe 修正 2026-08-05）**：🔖 → `api/save.ts` Edge Runtime → Notion REST API（raw fetch，無 SDK）建 page，DB 端 `(saves.articleId, deviceId)` unique。Notion 失敗仍寫 saves（`notion_page_id = NULL`），下次再點會 retry。dedupe 靠兩層：DB 有 `notion_page_id` 就直接 reuse；沒有就直接查 Notion `Article ID` property（`findSavePageByArticleId`）。`/api/unsave` 是**硬刪除**（`DELETE FROM saves`）——2026-08-05 從「soft-hide 靠 `deleted_at`」改過來，因為那個欄位從沒真的 migrate 進 DB，且硬刪除一樣安全（Notion dedupe 查的是 Notion 本身，不靠這個 row）。
- **追問歷史（2026-05-06）**：每篇文章一條 `conversations` row（`messages` JSON + `message_count`），`api/ask-history.ts` Edge Runtime 提供 GET/POST upsert。AskSheet 開啟時 hydrate 過往對話、每完成一個 user→assistant turn 就保存；Library 顯示 low-key ask message count，點開可帶歷史回到 AskSheet。`/api/library` JOIN 時只取 `message_count`，**不**載 messages JSON。
- **產品方向重新校準（2026-04-26）**：原本 V2 設計把 quiz (F5) 排第一，當時覆盤後降級成「Library 上的 retention layer」，退場條件是「沒回頭翻 library 就不做 quiz」。詳見 [docs/decisions/2026-04-26-product-review.md](./docs/decisions/2026-04-26-product-review.md)（**背景文件，決策已被後續開發蓋過，見下一條**）。
- **Library 頁面已 ship（2026-04-26，commit `0a61bad` / `ee694bb`）**：原 roadmap PR-A/B/C 一發併出。細節見系統架構 + 功能狀態 + Conventions。
- **⚠️ 2026-04-26 的「Library 決策 gate」已作廢**：Quiz 實際上照做了，且已經是主力產品（app 改名「Sift」、四分頁、封測中）。不用再回頭驗證 gate 有沒有通過，這條規則不再生效，純留作歷史紀錄。
- **現況（2026-09-30 更新）**：Quiz pipeline 的 `quiz_sync.yml` cron **2026-09-29 重新打開，每天 05:47 出題**（使用者決定保持開著；之前 2026-08 起手動關閉）。`/api/quiz` 的 recycle 邏輯（優先出沒答過的，答完就循環）保證題庫不會用完，不會退回 `app/src/data.ts` 的 3 題硬編碼 fallback（那只在 API 整個打不到時才觸發）。app「Sift」在 Expo Go 封測中，狀況穩定、**程式碼保留、可繼續跑**，但 EAS Build → TestFlight 要花錢、現階段用量不到值得投資的門檻，**暫時擱置**（非凍結、非廢棄）——等用量提高再撿回來。
- **Notion 整合維持現狀、不主動投資**：使用者不會回頭看 Notion saves，但整合已經串好、成本是 sunk，先放著不拆，也不再加功能。舊的「Notion 30 天回看」檢查點作廢。
- **Quiz / Activity 搬上 Web PWA（2026-09-07，commit `ebf73c6`）**：因為 `app/` 的 EAS Build/TestFlight 延後，把 RN app 的 Quiz + Activity 分頁整套搬進 `web/`，PWA 現在也是四分頁：Quiz `/quiz` / Feed `/` / Library `/library` / Activity `/activity`，變成主力 client。刻意不動的部分：`/` 仍是 Feed（PWA `start_url` + push 通知落地頁）、`web/public/sw.js` 沒改、manifest + `<title>` 品牌名當時維持「Morning Brief」（**2026-09-30 已統一成「Sift」**：manifest name/short_name、`<title>` + `apple-mobile-web-app-title`、Feed header 與啟動畫面的 SiftMark 字標、推播預設標題；已安裝的主畫面標籤與圖示要刪掉重加才會變，而 iOS 刪 PWA 會清掉 `mb_device_id`，所以刻意沒要求重裝）、`theme_color`/`background_color`/`<meta name="theme-color">` 三處當時仍是 `#14110D`（2026-09-29 Signal 改版後是 `#0B121A`）。細節見系統架構、功能狀態、Project Structure、Key Design Decisions #8。
- **Quiz 追問歷史其實從沒存活過（2026-09-07 發現）**：舊文件寫的「quiz 用合成 `articleId=quiz-${id}` 掛進 `conversations` table」從沒真的動起來——`api/ask-history.ts` 的 `isArticleId` 只收 16 位 hex，`quiz-6` 一律 400；就算放寬 regex，`conversations.article_id` 對 `articles.id` 的 FK 是真的有 enforce，塞不存在的文章 id 會 500。`app/` 的 `saveAskHistory` 把這個 400 吞進空 `catch {}`，所以整個 Expo Go 封測期間 quiz 追問歷史都靜默沒存到；`/api/ask` streaming 本身不吃 `articleId`，問答當下沒事，只有歷史沒存。web/ 這次改用 `web/src/askHistory.ts`：quiz 對話存 localStorage，文章對話不變，**沒有動任何後端檔案**。**2026-09-29 `app/` 也修了**：同一招，quiz 對話改存 AsyncStorage（`sift_quiz_ask_quiz-<id>`），文章對話的 save 失敗改成 `console.warn` 不再空 catch。見 Key Design Decision #8 修正版。
- **Web 視覺改版「Signal」（2026-09-29）**：配色從暖棕＋餘燼橘換成 app icon 的深墨藍（`#0B121A`）＋琥珀（`#F5A524`）；材質改成圓角內縮卡片、無框 tonal 按鈕、毛玻璃 bottom nav 與 feedback dock（`backdrop-filter`）；🔥⚡ emoji 換成 SVG（`web/src/components/icons.tsx`）；全域關掉 tap highlight / 長按選字。字體與版面模型（Issue 6 的 extended root + absolute nav/dock）都沒動。`app/` 擱置中，**沒有**跟著改——`app/src/theme.ts` 現在仍是舊暖棕，撿回 app 時要先同步。細節見 `docs/FRONTEND_FIX_LOG.md` Issue 18
- **早晨流程（2026-09-29）**：簡報讀完的結束頁有「去答今天的判斷題」直達 `/quiz`；滑錯可按「上一篇」回去，並用 `POST /api/feedback { signal: 'clear' }` 撤回該篇 👍👎（不讓誤滑污染 classifier 偏好）；streak 統一見 Key Design Decision #5
- **device_id 不跨 client 同步**：web 用 localStorage `mb_device_id`，app 用 AsyncStorage `sift_device_id`，這次 web port 沒有做身分遷移——Activity 等個人化歷史在 web 上從零開始算，是刻意決定，不是漏做。

---

## 系統架構

> 這裡是摘要。演算法細節（classifier bucket/renderLevel 規則、rank+select 算法、quiz 驗證規則）、完整 DB schema、完整 API contract 見 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**（living spec，改邏輯務必同步更新）。

```
GitHub Actions cron — 兩條獨立 pipeline，錯開時間互不影響
  ├─ daily_sync.yml（07:07 台北）→ src/index.ts             # 文章 pipeline
  │    ├─ rss/feed.ts                 # RSS ingestion + 24h filter + 關鍵字打分
  │    ├─ db/client.getRecentFeedback # 讀近 30 天 feedback 作為偏好 context
  │    ├─ ai/classifier.ts            # per-article LLM 分類（concurrency=3）
  │    ├─ ai/brief.ts                 # brief generator（一次 LLM call）
  │    ├─ notify/db-writer.ts         # upsert 文章到 Turso（成功後才推播）
  │    └─ notify/web-push.ts          # 對 push_subscriptions 全表發 Web Push
  ├─ quiz_sync.yml（05:47 台北）→ src/quiz-pipeline.ts       # quiz pipeline（不依賴文章）
       ├─ db/client.getRecentQuizPrompts # 讀近期已出過的題目 prompt，防重複
       ├─ quiz/generate.ts             # LLM 出題（single_choice / ordering / matching / fill_blank 混出）
       └─ db/quiz-writer.ts            # 寫入 quizzes table
  └─ reminder_sync.yml（15:53 台北）→ src/reminder.ts          # 下午提醒：只推給今天還沒讀/答題的裝置，帶 streak，點了開 /quiz

API：全部是 Vercel Edge functions（root `api/*.ts`，raw Turso HTTP，無 Node 冷啟動）。2026-10-01 最後兩支 quiz / activity 搬完後，Hono/Node 後端整個刪除 — 詳見 Conventions
  ├─ GET      /api/quiz          # api/quiz.ts — 今日題組（排除被回報題 → 到期的答錯重出 ≤2 → 沒答過的新題 → 不夠就 recycle），兩次 Turso pipeline
  ├─ GET      /api/activity      # api/activity.ts — 學習紀錄：heatmap / streak / 正確率等統計（device_id 範圍），一次 Turso pipeline
  ├─ GET      /api/library       # api/library.ts — 全歷史 + feedback / saved / notionSynced + ask message_count（一次 Turso pipeline，不撈 messages JSON）；`?days=N` 給首屏用（2026-10-01 從 Hono 搬來）
  ├─ GET      /api/feed          # api/feed.ts — 當日文章（2026-09-29 從 Hono 搬來 Edge：每天第一個請求，Node 冷啟動是載入慢的主因）
  ├─ POST     /api/ask           # api/ask.ts — Haiku 4.5 SSE streaming 追問（文章與 quiz 共用；quiz 用合成 articleId=`quiz-${id}`）
  ├─ GET/POST /api/ask-history   # api/ask-history.ts — per-(article, device) conversations 讀 / upsert messages JSON
  ├─ POST     /api/push-subscribe# api/push-subscribe.ts — 寫 push_subscriptions
  ├─ POST     /api/save          # api/save.ts — 查 article + Notion dedupe（Article ID lookup + DB sync lock）+ upsert saves
  ├─ POST     /api/feedback      # api/feedback.ts — up/down（delete-then-insert，同 articleId 只留最新）
  ├─ POST     /api/unsave        # api/unsave.ts — 硬刪除 saves row（DELETE；不動 articles、不動 Notion page）
  ├─ POST     /api/quiz-attempt  # api/quiz-attempt.ts — 寫入 quiz_attempts（quizId / deviceId / correct）
  ├─ POST     /api/quiz-report   # api/quiz-report.ts — 回報爛題（quiz_reports，表由此處 CREATE TABLE IF NOT EXISTS 自建）
  └─ GET      /api/weekly        # api/weekly.ts — 本週回顧（一次 Turso pipeline，紀錄頁用）

React PWA (web/) — 主力 client（2026-09-07 起，四分頁），仍是 Web Push 入口
  ├─ Shell.tsx + BottomNav.tsx  # 常駐 bottom nav：extended root 內的 absolute layer，nav.ts 量測高度供 useNavInset()
  ├─ /          滑卡 / 👍👎 / 💬 追問 / 🔖 收藏 / Celebration（PWA start_url + push 通知落地頁，不可換掉）
  ├─ /quiz      Quiz.tsx：今日 quiz 題組（single_choice / ordering / matching / fill_blank）；真實 streak（讀 /api/activity）；無硬編碼 fallback 題庫，失敗給明確錯誤 + retry
  ├─ /library   全歷史頁：所有歷史 tab（filter + 日期分組 + 展開 LLM 四段） / 收藏 tab（Notion sync stats）
  ├─ /activity  Activity.tsx：本週回顧（/api/weekly）+ 年度 heatmap / streak / 正確率 / 最近幾天（/api/activity）
  ├─ pathname routing：web/src/main.tsx 監聽 popstate，web/src/router.ts navigate() helper（仍非 react-router）
  └─ Splash gate：iOS standalone 第一次開啟 → 請求 notification permission → 寫 subscription

React Native App「Sift」(app/) — 暫時擱置（非凍結，程式碼保留、Expo Go 仍可跑）
  ├─ 四分頁（bottom tab）：Quiz（今日題目）/ Feed（簡報）/ Library / Activity（學習紀錄）
  ├─ QuizScreen   — 每日 quiz 題組（single_choice / ordering / matching / fill_blank）；XP：對 +20 / 錯 +5
  ├─ QuizFrame    — 四種題型共用 chrome（進度條 / streak / XP / 分類 pill）+ 💬 AskSheet（追問這題）
  ├─ FeedScreen   — 滑卡瀏覽今日文章；swipe right=有用 / left=略過；💬 AskSheet / 🔖 save
  ├─ LibraryScreen — 全歷史 + 收藏 tab（呼叫 /api/library）
  ├─ ActivityScreen — 學習紀錄：年度 heatmap（DotGrid）/ 週 pie / streak / 正確率（呼叫 /api/activity）
  ├─ src/api.ts   — 自動偵測 Metro host（dev LAN）或 fallback 到 prod；quiz-attempt / ask SSE（expo/fetch）
  ├─ src/theme.ts — T / FONT / RADIUS / XP 設計 token（原本鏡像 web/ dark theme；web 2026-09-29 改版 Signal 後尚未同步）
  └─ src/device.ts — AsyncStorage device UUID（`sift_device_id`，X-Device-Id header，多使用者隔離用）
```

---

## 功能狀態

| 功能 | 狀態 | 備註 |
|---|---|---|
| RSS → 分類 → 寫 Turso | ✅ | V1 遺留，穩定 |
| Web Push 推播 | ✅ | 標題 = lead story title，body = lead 的 engineeringImpact + `今日 N 篇 · 還有 K 題判斷題等你` |
| Turso DB 寫入 | ✅ | article id = SHA-256(url).slice(0,16)；client 用 `https://` 而非 `libsql://`（serverless friendly） |
| Vercel 部署 | ✅ | 全部 API 都是 Edge function（`api/*.ts`）；2026-10-01 起沒有 Node/Hono 後端 |
| PWA 卡片 UI | ✅ | iPhone standalone 已穩定，細節見 `docs/FRONTEND_FIX_LOG.md` |
| 👍👎 → DB | ✅ | delete-then-insert 防誤按；Edge Runtime（2026-04-26 從 Hono 搬出，原本 504 timeout） |
| 💬 追問（Haiku SSE） | ✅ | `api/ask.ts` Edge Runtime raw fetch。2026-09-30：quiz 送 `quiz` context（作答前不給解說、prompt 禁止爆雷；作答後帶你的答案 + 正確答案）；建議問題 quiz 依作答狀態、文章由 `mode: 'suggest'` 針對該篇生成並存 localStorage；鍵盤開啟時 AskSheet 貼齊 visualViewport（只限 sheet，不動 shell）。見 FRONTEND_FIX_LOG Issue 21 |
| 💬 追問歷史 | ✅ | `api/ask-history.ts` Edge：GET hydrate / POST upsert；`conversations` 一篇一 row；AskSheet 開啟還原、turn 完成保存；Library 顯示 ask message count |
| Classifier 吃 feedback | ✅ | 近 30 天 / 20 筆 / 門檻 10；偏好附 system prompt 尾端 |
| 🔖 Notion 整合 | ✅ | Edge Runtime + raw fetch；失敗 graceful；dedupe 靠 DB `notion_page_id` 快取 + Notion `Article ID` 直查兩層。`/api/unsave` 是硬刪除（2026-08-05 修正，原本設計的 soft-hide 因欄位從未 migrate 進 DB 而一直是壞的，詳見 [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)） |
| Library 頁面 | ✅ | `/library` route + `GET /api/library` + `POST /api/unsave`（皆 Edge）。2026-10-01 提速：先畫 localStorage 快取（`mb_cache_library`，只在完整歷史載完後寫入）；沒快取時先抓 `?days=14` 畫首屏，再換成完整歷史（搜尋 / filter 是 client 端，需要全部） |
| Web PWA 四分頁（Quiz/Feed/Library/Activity）| ✅ | 2026-09-07（commit `ebf73c6`）把 app/ 的 Quiz + Activity 分頁整套搬進 web/，PWA 現在是主力 client。`/` 仍是 Feed（start_url + push 落地頁），SW / manifest / theme_color 全部沒動 |
| React Native App「Sift」| ⏸️ 暫時擱置 | Expo SDK 54，Expo Go 開發，程式碼保留可運作；EAS Build → TestFlight 因用量不到值得投資的門檻而延後，非凍結、非廢棄 |
| Quiz 生成 | ✅ | `src/quiz-pipeline.ts` 獨立於文章 pipeline；`quiz_sync.yml`（05:47 台北）2026-09-29 重新啟用，每天出題。現有題庫透過 `/api/quiz` recycle 邏輯持續供應，不會變空 |
| Quiz 答錯重出 | ✅ | 2026-09-30：`src/quiz/review.ts` 從 `quiz_attempts` 推算，答錯的題 1 → 3 → 7 天後重出（連對 3 次畢業、再錯歸零），每組最多 2 題，web 顯示「複習 · 之前答錯」。答錯時四種題型都會就地標出正確答案 |
| Quiz 作答紀錄 | ✅ | `POST /api/quiz-attempt` → `quiz_attempts`；XP：答對 +20 / 答錯 +5（web `web/src/components/quiz/tokens.ts` 與 app `app/src/theme.ts` 各自的 XP 常數，web 版衍生自 `theme.ts`） |
| 學習紀錄 / Activity | ✅ | `GET /api/activity`：年度 heatmap、本週答題、streak、正確率，皆以 device_id 為範圍。2026-09-29 起 streak / heatmap 同時計入閱讀（feedback）與答題；週統計與 recent 仍只算答題。web `Activity.tsx` 與 app `ActivityScreen.tsx` 吃同一支 API |
| 多使用者支援 | ✅ | `device_id` 貫穿 feedback / saves / conversations / push_subscriptions / quiz_attempts；web 用 localStorage `mb_device_id`，app 用 AsyncStorage `sift_device_id`，**兩邊不共用、沒有遷移**，每次 fetch 帶 `X-Device-Id` |
| Quiz 追問 | ✅ 問答 + 歷史（存本機） | `/api/ask` streaming 正常（不吃 articleId）；「用合成 `articleId=quiz-${id}` 掛進 conversations」從沒真的動起來——`ask-history.ts` 的 hex regex + FK 會擋掉。所以 quiz 對話歷史改存 client 本機、不進 DB：web/ 2026-09-07 用 localStorage，app/ 2026-09-29 用 AsyncStorage（之前 app/ 端把 400 吞掉，封測期間歷史都沒存到）。見 Key Design Decision #8 |
| 下午提醒推播 | ✅ | 2026-09-30：`reminder_sync.yml` 15:53 台北跑 `src/reminder.ts`，只推給「今天沒有 feedback 也沒有 quiz_attempts」的訂閱裝置；streak ≥ 2 時文案帶連續天數；payload 帶 `url: '/quiz'`，`sw.js` 點擊後開題目頁（已開著就 postMessage 讓 app 內 navigate）。全部推失敗 → exit(1) |
| 回報爛題 | ✅ | 2026-09-30：題目頁「回報」→ `POST /api/quiz-report`（答案有誤 / 題意不清 / 太簡單 / 其他）；被回報的題 `/api/quiz` 對所有人排除，出題 prompt 尾端加「AVOID THESE MISTAKES」。回報後可「跳過這題」（不記 attempt，results 存 null） |
| Skill-tag 雙軸 | ⏳ 未做 | schema 已有 `skillTags`，classifier 沒產 |
| 每週回顧 | ✅ | 2026-09-30：紀錄頁「本週回顧」卡（活躍天數 / 讀幾篇 / 答幾題 / 正確率對上週 / 最常卡住分類 / 這週答錯的題 / 這週收藏），資料來自 Edge `GET /api/weekly`；紀錄頁、題目頁 streak 走 localStorage 快取先顯示再背景更新（`mb_cache_*`）；讀完簡報會背景預抓今日題組（`web/src/quiz/session.ts`） |

---

## 下一步（2026-09 現況重排）

> 舊版（2026-08）把「Sift → TestFlight」列為唯一 active 任務。實際發展：EAS Build / TestFlight 要花錢，現階段用量不到值得投資的門檻，這步延後（不是取消）。已經 ship 的是把 app/ 的 Quiz + Activity 分頁整套搬上 web PWA（2026-09-07，commit `ebf73c6`），web/ 現在是四分頁主力 client。以下是延後 TestFlight 後真正的優先序。

1. **內容品質一輪**（文章 pipeline）：
   - RSS 源擴充：Anthropic news / OpenAI blog / Cloudflare blog / AWS ML blog。上線前要 `curl` 驗證 URL 仍有效
   - Skill-tag 產出（`skillTags` classifier 還沒產）：Library filter chip 第三維度
   - 不要做：AWS What's New（firehose）、Google AI Blog（行銷腔）、各家 changelog feeds（太細粒度）
2. ~~晨間 Recall Quiz~~：2026-09-30 做成下午 4 點提醒推播（見功能狀態）
3. **Notion 整合**：維持現狀，不主動投資、不拆——已串好且 sunk cost，使用者不會回頭看，優先度最低
4. **Classifier 偏好 v2**（feedback 累積夠久再評估，不要提早優化）
5. **Sift → EAS Build / TestFlight**：延後，不是取消。等 web PWA 用量提高、或有明確理由需要原生 app（push 可靠度、離線）再撿回來

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
- [x] web PWA 四分頁 Playwright 驗證（2026-09-07，模擬 iPhone 13 viewport + 34px safe-area）：四分頁切換 + 瀏覽器 Back 無整頁重載、四種 quiz 題型作答 + XP 正確（+20/+5）、五次 `POST /api/quiz-attempt` 皆 200、Activity 數字與 `/api/activity` 逐欄位比對一致、nav 在 0px 與 34px inset 下都完全在 home indicator 之上、standalone push permission gate 正常
- [x] **真實 iPhone 安裝的 PWA 驗證**（2026-09-29，使用者實機確認 OK）：`docs/FRONTEND_FIX_LOG.md` Issue 6 的驗收基準是「從主畫面捷徑開啟的真實 standalone PWA」，四分頁 port 已過這關
- [x] **Signal 改版真實 iPhone PWA 驗證**（2026-09-29，使用者實機確認 OK）：bottom nav / 毛玻璃 dock 位置正常
- EAS Build → TestFlight：延後（見下一步 #5），不是待辦項目，等用量提高再排
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
  ai/select-provider.ts # provider 選擇 + fallbackProvider()（文章 + quiz pipeline 共用）
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
api/quiz.ts              # Edge Runtime GET → 今日題組（import src/quiz/review.ts 的 dueReviewIds）
api/activity.ts          # Edge Runtime GET → 學習紀錄（import src/streak.ts 的 computeStreak）
api/library.ts           # Edge Runtime GET → Library 全歷史 + 個人狀態 join（`?days=N` 首屏分段）
api/feed.ts              # Edge Runtime GET → Turso HTTP API（當日文章：camelCase、score 數字、classifiedAt ISO）
api/ask.ts               # Edge Runtime SSE for /api/ask（文章與 quiz 共用，quiz 用合成 articleId）
api/ask-history.ts       # Edge Runtime GET/POST → Turso HTTP API（per-(article, device) conversations upsert / fetch）
api/push-subscribe.ts    # Edge Runtime POST → Turso HTTP API（寫 push_subscriptions）
api/save.ts              # Edge Runtime POST → Notion dedupe (DB notion_page_id 快取 + Article ID 直查) + Turso HTTP API（upsert saves）
api/feedback.ts          # Edge Runtime POST → Turso HTTP API（delete-then-insert feedback）
api/unsave.ts            # Edge Runtime POST → Turso HTTP API（硬刪除 saves row；不動 articles、不動 Notion page）
api/quiz-attempt.ts      # Edge Runtime POST → Turso HTTP API（寫 quiz_attempts，device_id 必填）
api/quiz-report.ts       # Edge Runtime POST → 回報爛題（lazy CREATE TABLE quiz_reports + upsert）
api/weekly.ts            # Edge Runtime GET → 本週回顧（一次 Turso pipeline 三條 SQL）
src/reminder.ts          # 下午提醒推播入口（reminder_sync.yml）
src/streak.ts            # computeStreak()，/api/activity 與 reminder 共用
vercel.json
web/
  index.html
  public/manifest.json · apple-touch-icon.png · icon-512.svg
  public/sw.js          # push handler SW（push + notificationclick events，這次 quiz/activity port 沒動這支）
  src/main.tsx          # 四分頁 pathname routing：/quiz、/（Feed）、/library、/activity，包在 Shell 裡；仍非 react-router
  src/router.ts         # navigate(path) helper（pushState + popstate dispatch）
  src/Shell.tsx          # app shell：extended root 上的 absolute layer + 常駐 bottom nav；path 由 main.tsx 傳入，Shell 自己不讀 window.location
  src/nav.ts             # NAV_ROW_H=54 / NAV_GESTURE_GAP=10（tab 列與 home bar 之間的不可點底座，防滑回主畫面誤觸）/ TABS / tabForPath() / NavInsetContext・useNavInset()；nav 高度用量測值發布，因為 env(safe-area-inset-bottom) 在 JS 讀不到 px 數字
  src/feedLoader.ts     # 開 App 時今日文章的來源順序：localStorage 快取 → 推播時 SW 預存的 Cache Storage → index.html 提早發的請求 → 一般 fetch
  src/App.tsx           # Feed 主畫面（仍是 `/`，PWA start_url + push 落地頁不可換）：swipe 物理 + streak + push permission gate；feedback dock 抬高到 nav 之上，TopChrome 拿掉重複的 Library 按鈕
  src/Library.tsx       # /library 頁面：filter / 日期分組 / 展開 LLM / saves tab；root height 改 100%（填滿 Shell layer），AskSheet z-index 提到 60
  src/Quiz.tsx           # /quiz 頁面：讀 /api/activity 真實 streak，失敗給明確錯誤 + retry，**無**硬編碼 fallback 題庫
  src/Activity.tsx       # /activity 頁面：本週回顧（/api/weekly）+ 年度 heatmap / streak / 正確率 / 最近幾天（/api/activity）
  src/askHistory.ts     # quiz 對話走 localStorage（`mb_quiz_ask_quiz-<id>`），文章對話走 /api/ask-history；原本設計的 conversations 掛法對 quiz 從沒真的動起來，見 Key Design Decision #8
  src/quiz/types.ts     # Quiz union、各題型 payload validator、shuffleWithOrigin（從 app/src/data.ts 搬過來）
  src/api.ts             # apiFetch + 新增型別化層：fetchQuizzes / submitQuizAttempt / fetchActivity / fetchAskHistory / saveAskHistory
  src/push.ts           # isPushSupported / isStandalone / completeSubscription
  src/components/
    Card.tsx · Chrome.tsx · AskSheet.tsx（history 改走 askHistory.ts，z-index 30→60） · Celebration.tsx
    icons.tsx           # IconFlame / IconBolt / IconSparkle / StatChip（取代 🔥⚡ emoji，吃主題色）
    BottomNav.tsx       # 四分頁 nav：absolute at bottom:0、padding-bottom: env(safe-area-inset-bottom)、z-index 50、inline SVG icon；沿用 FRONTEND_FIX_LOG Issue 6 手法，不要改回 fixed footer
    quiz/               # QuizFrame・QuizCard・SingleChoiceCard・OptionRow・OrderingCard・MatchingCard（SVG bezier connector，無新依賴）・FillBlankCard・CompletionCard・tokens.ts（quiz-only 色票 Q + XP 常數，衍生自 theme.ts）
    activity/           # Heatmap・WeekPie・StatCard
  src/{date,theme,types}.ts · index.css   # theme.ts 是唯一真理（Signal：`bg`/`card`/`raised`/`accent`/`glass` 等 token + `GLASS_BLUR` + `TAG_COLORS`），app/ 的 theme 應鏡像它（目前落後，見 TL;DR）
  vite.config.ts        # `/api` 全部 proxy 到 prod Vercel（沒有本地 API server）—— 代表本地 dev 的寫入操作會真的寫進 prod Turso DB
app/                     # React Native app「Sift」（Expo SDK 54，暫時擱置——非凍結，Expo Go 仍可跑；EAS Build/TestFlight 因用量不到門檻延後）
  App.tsx                # 根元件：字型載入 + bottom tab navigator（Quiz/Feed/Library/Activity）
  app.json                # expo name/slug = "Sift"
  package.json           # expo ^54, react-native 0.81, @expo-google-fonts/*
  src/
    api.ts               # fetch wrapper（Metro host 自動偵測 dev / prod fallback）；fetchActivity() / submitQuizAttempt()
    theme.ts             # T / FONT / RADIUS / XP 設計 token（仍是 web 改版前的暖棕，web 2026-09-29 換 Signal 後未同步）
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

# Web
cd web && npm run dev  # Vite dev (port 5173，/api proxy → prod Vercel)

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
AI_PROVIDER           # "openai" | "anthropic" | "alternate" — 2026-10-01 起 prod 設 anthropic（Claude 主力，GPT 備援）
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
- **沒有 filler（2026-09-30 拿掉）**：HARD_TECH + SIGNALS 不足 3 篇就少於 3 篇，0 篇就發「今日無重大 AI 新聞」且不寫 DB。以前會拿 DROP 的文章改標 Signals 補滿，是「怎麼會出現這篇」的主因，不要加回來
- 送進 classifier 前：跨來源去重（同 URL 或標題高度重疊，留 tier 高的）→ 每個來源保底 2 篇 → 其餘依關鍵字分數補到 `CLASSIFIER_CAP=24`。來源分三層 `primary`（OpenAI / DeepMind / Cloudflare / AWS ML 一手部落格）> `technical` > `broad`；The Verge 已移除
- 調整選文邏輯後先用試跑驗證：Actions → AI Morning Brief → Run workflow → 勾 `dry_run`（只分類＋印出會選哪幾篇，不寫 DB、不推播）
- Pipeline 順序固定是 brief → DB persist → Web Push。Web Push 是 PWA 入口，不可在 DB 寫入成功前送出。
- Infra 錯誤不送 Web Push：RSS 全掛、config/provider 錯誤、DB 寫入失敗、Web Push 全部發送失敗都要 `exit(1)`，讓 GitHub Actions failed；Actions log 是錯誤診斷 source of truth。
- DB upsert 一律用 `onConflictDoUpdate`（用 `onConflictDoNothing` 會讓 count log 誤報）
- db-writer 的 conflict target 是 `articles.url`
- `saves.articleId` + `deviceId` 是 unique（一裝置一篇一筆）；`/api/save` handler 自己做 upsert 邏輯（存在的 row 就 UPDATE，不存在就 INSERT），不依賴 Drizzle upsert（Edge Runtime 用 raw Turso HTTP API）
- Notion sync 失敗不阻斷收藏：寫 `saves` row 但 `notion_page_id = NULL`，回 `{ ok: true, notionSynced: false }`，下次同篇再點會 retry
- **Notion dedupe 是兩層，不是三層（2026-08-05 修正）**：舊文件曾寫「`notion_syncing_at` 10 分鐘 sync lock」是第二層防線，但那個欄位從沒 migrate 進 DB、`save.ts` 也從沒真的用它當鎖——這層從來不存在，是文件寫得比實作多。實際運作是：(a) 既有 `saves.notion_page_id` 不為 NULL → 直接 reuse，不打 Notion；(b) 沒有才呼叫 `findSavePageByArticleId(articleId)` 直接查 Notion 上是否已有同 `Article ID`，有就 reuse、沒有才 `createSavePage`。**(b) 是真正防重複的關鍵**——它查的是 Notion 本身，不依賴本地 DB row 存不存在。
- `/api/unsave` 是**真正的硬刪除**（`DELETE FROM saves WHERE ...`，2026-08-05 從原本設計的 soft-hide 改過來）：unsave 代表「不想存了」，跟文章本身（`articles` table）無關，砍掉 save row 沒有風險——因為上面 (b) 的 Notion 查詢是直接查 Notion，不靠這個 row 殘留，re-save 一樣會找回同一張 Notion page。soft-hide 設計曾經想靠 `deleted_at` 欄位做，但那個欄位從沒真的存在於 live DB（`saves` 實際欄位只有 `id/article_id/device_id/user_note/notion_page_id/created_at`），導致 `/api/unsave` 一直在 500；改成硬刪除後不需要任何 migration，問題直接消失。詳見 [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)。
- `conversations` 是「一個 articleId 一 row」：`messages` JSON、`message_count`、`model`、`created_at`、`updated_at`。`/api/ask-history` POST 是整段覆寫（不 append diff），AskSheet 在每個 user→assistant turn 完成後送一次。`/api/library` JOIN 時只 select `message_count`，**不要**載入 messages JSON（library payload 別變大）；要看完整對話走 `/api/ask-history?articleId=` GET。

**Classifier 偏好：**
- Preference context **必須附加在 system prompt 尾端**（保 cache prefix，不要插中間／開頭）
- `classifyArticles` 透過 `string[]` 形式呼叫 provider — `[CLASSIFIER_SYSTEM, preferenceContext]`，AnthropicProvider 只在第一個 block 打 cache_control，穩定 prefix 跨天不會被變動的偏好 invalidate
- Cold-start 門檻 10 筆，低於門檻一律不注入（防過擬合）
- 👎 per-category 要 ≥ 2 次才算負訊號（單一 👎 可能只是當天心情，別當真）

**Edge Runtime endpoints（2026-10-01 起所有 API 都是 Edge，沒有 Node/Hono 後端）：**
- `/api/ask` → `api/ask.ts`（SSE streaming；文章與 quiz 共用，quiz 用合成 `articleId=quiz-${id}`）
- `/api/ask-history` → `api/ask-history.ts`（GET 讀 / POST upsert per-(article, device) conversations row）
- `/api/push-subscribe` → `api/push-subscribe.ts`（寫 Turso）
- `/api/save` → `api/save.ts`（查 article、Notion dedupe lookup、upsert saves，sync lock 防併發 double-create）
- `/api/unsave` → `api/unsave.ts`（硬刪除 saves row；不動 articles、不動 Notion page）
- `/api/feedback` → `api/feedback.ts`（delete-then-insert feedback）
- `/api/quiz-attempt` → `api/quiz-attempt.ts`（寫 `quiz_attempts`；`X-Device-Id` header 必填，缺就 400）
- **背景**：Hono `c.req.json()` / `c.req.text()` 在 `hono/vercel` Node.js adapter 上會 hang 到 300s timeout（GET 沒事，body 大小不是 trigger）。Edge Runtime 原生 `Request.json()` 沒這問題。診斷過 DB / libSQL / drizzle / VAPID 都不是病灶 — 結論是 Hono adapter 自己。所有 POST 已遷完（含 feedback 2026-04-26 復發後）。
- **GET 也全搬了**：`/api/feed`（2026-09-29）、`/api/library`、`/api/quiz`、`/api/activity`（2026-10-01）都改成 Edge + raw Turso SQL，因為 Node function 的冷啟動就是使用者感受到的「開 App 卡一下」。quiz / activity 搬遷時用同一顆 seeded SQLite 逐 byte 比對新舊輸出（60 組 case 全一致）。搬完後 `src/api/app.ts`、`api/index.ts`、`src/api/server.ts`、`hono` / `@hono/node-server` 依賴全部刪除。
- **規則**：新 endpoint 一律寫 `api/<name>.ts`（`export const config = { runtime: 'edge' }`，Turso 用 `/v2/pipeline` raw fetch，照抄 `api/weekly.ts` 的 `query()` helper）+ `vercel.json` rewrite。**不要**把 Hono / Node function 加回來。Edge function 可以 import `src/` 底下**純邏輯、無 Node 依賴**的模組（`api/quiz.ts` 用 `src/quiz/review.ts`、`api/activity.ts` 用 `src/streak.ts`、`api/save.ts` 用 `src/notion/client.ts`）；不要 import `src/db/client.ts`（drizzle + libSQL Node client）。
- `vercel.json`：每支 API 一條 rewrite，最後的 SPA fallback 是 `/((?!api/).*)` → `/index.html`，所以打錯的 `/api/xxx` 會是 404 而不是回一頁 HTML。
- 本地沒有 API server：`web/` 的 vite dev 把 `/api` 全部 proxy 到 prod；要測未上線的後端改動請 push 到 Vercel preview（或直接上 prod，看改動風險）。

**Quiz pipeline / 多使用者：**
- Quiz 出題完全獨立於文章 pipeline：不同 cron 檔（`quiz_sync.yml` 05:47 台北 vs `daily_sync.yml` 07:07 台北）、不同 entry（`quiz-pipeline.ts` vs `index.ts`）、不共用 selection 邏輯；共用的只有 `ai/select-provider.ts`（provider 選擇 + fallback）和同一顆 Turso DB
- Quiz dedup 用同一招：`getRecentQuizPrompts()` 撈近期已出過的題目 prompt，附加在 `QUIZ_SYSTEM` **尾端**（"AVOID REPEATING" 區塊），保 cache prefix 穩定 — 跟 classifier 的 `buildPreferenceContext()` 手法一致，不要重新發明
- `device_id` 是目前唯一的多使用者隔離機制（沒有帳號系統）：`feedback` / `saves` / `conversations` / `push_subscriptions` / `quiz_attempts` 都有 `device_id` 欄位，app 端由 `src/device.ts` 生成 UUID 存 AsyncStorage，每次 fetch 帶 `X-Device-Id` header。新增任何寫入型 endpoint 若涉及個人化資料，記得比照加 `device_id` 欄位 + header 檢查
- web 跟 app 的 device_id **不共用**：web 用 localStorage `mb_device_id`，app 用 AsyncStorage `sift_device_id`。2026-09-07 web port 沒有做身分遷移，是刻意決定——Activity 等個人化歷史在 web 上從零開始算，不要當成 bug 去「修」

**Web 前端 nav / Quiz+Activity port（2026-09-07）：**
- 新頁面一律用 `useNavInset()`（`web/src/nav.ts`）拿 nav 高度，不要用 `env(safe-area-inset-bottom)` 猜——那個值在 JS 讀不到 px 數字，nav 高度是 `Shell.tsx` 量測後用 `NavInsetContext` 發佈的
- bottom-docked 控制項要蓋過 nav 就疊 z-index，不要用 fixed footer 或 negative safe-area offset——這是 `docs/FRONTEND_FIX_LOG.md` Issue 6 的教訓，nav 本身也遵守同一條規則
- `vite.config.ts` 把 `/api` 全部 proxy 到 prod Vercel（2026-10-01 起沒有本地 API server）。**這代表本地 dev 的寫入操作（👍/🔖/quiz attempt）會真的寫進 prod Turso DB**，測試時要注意會留下真實資料
- Quiz port 沒加新 npm dependency：matching 題型的連接線是手刻 SVG bezier，不是新圖形庫
- `web/src/theme.ts` 是唯一真理（authoritative）；quiz-only palette 放在 `web/src/components/quiz/tokens.ts`，從 `theme.ts` 衍生；改色從 `theme.ts` 改起，不要在元件裡寫死色碼——`app/src/theme.ts` 才是鏡像 web/ 的那一邊，方向不能反過來

**PWA / Service Worker：**
- **不要**重新加 `vite-plugin-pwa` 或其他 SW 產生器。app 是「每天開一次抓新資料」，沒有 offline 需求，SW 只會製造 cache 地獄（見 FRONTEND_FIX_LOG Issue 14）。
- Manifest 用靜態 `web/public/manifest.json`（index.html 單一 `<link rel="manifest">`）。
- `theme_color` / `background_color` / `<meta name="theme-color">` 三處（加上 `index.css` 的 html/body 背景）必須全部對齊 `T.bg = #0B121A`，不然 iOS standalone 會出現 status bar 色差「框框」。
- `web/public/sw.js` 現在是 **真正的 push handler**（`push` + `notificationclick` events），**沒有** fetch event handler。2026-10-01 起早上那則推播（url 為 `/`）在 `showNotification` 之後會順手 `fetch` 當天 `/api/feed` 存進 Cache Storage `sift-feed-v1`（只留當天一筆），讓點通知進來不用等網路；頁面由 `web/src/feedLoader.ts` 主動讀，SW 不會攔截任何請求。如果以後加 fetch handler 一定要小心 cache 地獄重演。

**Web Push / iOS PWA：**
- iOS Web Push **只在 standalone 模式下支援**（首頁捷徑開啟，不是 Safari 直接開網址）。所以 `App.tsx` 的 splash gate `permissionResolved` 初始判定要先過 `isStandalone()`。
- `Notification.requestPermission()` 必須由 user gesture 觸發（按鈕 onClick），不能在 `useEffect` 內自動呼叫。
- `Notification.permission` 已是 `granted` 時，App startup useEffect 會自動 call `completeSubscription()` 補寫 `push_subscriptions`（fire-and-forget，使用者無感）。
- 當天有文章：通知標題 = `displayedItems[0].title`（lead story），body 兩行：第 1 行 = lead 文章的 `engineeringImpact`（讓 LLM 生的判斷上鎖屏，不只是頭條），第 2 行 = `今日 N 篇 · 還有 K 題判斷題等你`（K = min(5, 題庫數)，查題庫失敗就只留篇數，不影響推播；2026-09-29 從 section labels「Hard Tech AI · Signals · +2 篇」改掉，那行對要不要點開沒資訊）。當天無文章：標題 = `Sift · {date}`（2026-09-30 品牌統一前是 `AI Morning Brief {date}`）、body = `今日無重大 AI 新聞`。
- 通知格式 2026-04-26 重做過一次：拿掉「from Sift」（icon 已表示來源）、`／` 改 `·`、釋出空間放 lead 的 `engineeringImpact`。看 `src/index.ts` Stage 6 的 comment，不要回退。

---

## React Native App「Sift」(app/)

- **產品形態**：新聞（Feed，讀當日 AI brief）+ 遊戲化 quiz（Quiz，backend/infra 工程判斷力題目）雙軌，共用 Library / Activity / Ask 基礎設施。兩條內容各自獨立 pipeline 產生（見系統架構），app 端是統一的殼
- **Expo SDK 54**，以 Expo Go 開發封測中；**暫時擱置**（非凍結、非廢棄，程式碼保留、可繼續跑）——EAS Build/TestFlight 要花錢，現階段用量不到值得投資的門檻，先延後，web PWA（見系統架構）接手當主力 client，等用量提高再撿回來
- **四分頁 bottom tab**：Quiz（✦ 今日題目）/ Feed（◎ 簡報）/ Library（⊟）/ Activity（紀錄 — 學習儀表板）
- **字型**：NotoSansTC 400/500/700/900 + JetBrains Mono 400/500/700，由 `@expo-google-fonts` 載入；App.tsx 等字型就緒才渲染
- **主題**：`src/theme.ts` 匯出 `T`（色彩）/ `FONT`（字型 key）/ `RADIUS` / `XP`（答對/答錯經驗值）；原本刻意鏡像 web/ dark theme；web 2026-09-29 改版 Signal 後 app/ 沒跟上，撿回來時先同步
- **API**：`src/api.ts` 一律打 `https://ai-morning-brief-chi.vercel.app`，`EXPO_PUBLIC_API_BASE_URL`（`app/.env`，gitignored）有設就用它（例如指向 Vercel preview 測後端改動）。2026-10-01 前會用 `Constants.expoConfig.hostUri` 自動猜本地 `:3001` dev server；Hono 刪掉後那條路不存在了，所以拿掉
- **SSE 追問**：`streamAsk()` 改用 `expo/fetch`（RN 原生 fetch 無法讀 streaming body）；所有 API 都只存在於 Vercel，開發時直接打 prod。Quiz 題目追問重用同一套 AskSheet + `/api/ask`，用合成 `articleId = quiz-${id}`；追問**歷史**不進 `conversations`（`ask-history.ts` 的 hex regex + FK 會擋）——2026-09-29 起 `src/api.ts` 的 `fetchAskHistory` / `saveAskHistory` 把 `quiz-` 開頭的 thread 改存 AsyncStorage（`sift_quiz_ask_quiz-<id>`），跟 web/ 的 localStorage 同一招；在那之前 400 被空 `catch {}` 吞掉、歷史一直沒存到。見 Key Design Decision #8
- **Device ID**：`src/device.ts` 用 AsyncStorage 生成 UUID（key: `sift_device_id`），每次 fetch 帶 `X-Device-Id` header；貫穿 feedback / saves / conversations / push_subscriptions / quiz_attempts 五個 table，是多使用者隔離的唯一依據（無帳號系統）
- **Quiz 互動類型**：`single_choice` / `ordering` / `matching` / `fill_blank`（`api/quiz-attempt.ts` 記錄作答結果，寫入 `quiz_attempts`）；出題交由獨立 `quiz_sync.yml` cron，非即時生成
- **Activity（學習紀錄）**：`GET /api/activity`（Edge，`api/activity.ts`）回傳 heatmap / streak / 正確率，皆用 `X-Device-Id` 圈定範圍
- **不要**在 app/ 加 SW、manifest、VAPID 相關邏輯 — push 仍由 web/ PWA 負責
- **已知問題**：Quiz 分頁寫死 streak、Feed 分頁收藏純前端 local state 兩項已於 2026-08-04 修掉（`QuizScreen.tsx` 改叫 `fetchActivity().streak`，`FeedScreen.tsx` 改由 `fetchLibrary()` 灌初始收藏狀態）。Quiz 追問歷史沒存到的問題已於 2026-09-29 修掉（改存 AsyncStorage，見上一條 + Key Design Decision #8）。完整清單見 [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)

---

## Key Design Decisions

1. **Provider：Claude 主力、GPT 備援（2026-10-01）**：prod 的 `AI_PROVIDER=anthropic`。之前是 `alternate`（GPT / Claude 按台北 day-of-year 奇偶輪替），改掉的理由：兩家分類尺度不同，選文品質會隔天跳動、feedback 偏好學習也被兩套標準稀釋。`alternate` 模式程式仍保留。**fallback**：主力 provider 整批失敗（例：OpenAI 額度用完，24 篇分類全 429）時，文章分類與 quiz 出題會自動改用另一家（`fallbackProvider()`），兩家都掛才 `exit(1)`。在這之前全部分類失敗會被當成「全是 DROP」，送出假的「今日無重大 AI 新聞」推播
2. **Rendering levels**：FULL / LIGHT / OMIT by brief generator
3. **Category tags**：#model-release #api-platform #infra-inference #tooling-open-source #benchmark-eval #agent-systems #policy-regulation #company-market #social-opinion #event-promo #research-adjacent
4. **Web design**：2026-09-29 起是「Signal」——icon 的深墨藍＋琥珀、圓角卡片、tonal 按鈕、毛玻璃 nav/dock，偏 iOS 原生感；字體沿用 Source Serif 4（標題）＋ Inter ＋ JetBrains Mono（標籤）。之前是報紙 / FT editorial 暖棕風格
5. **Streak**（2026-09-29 統一）：全 app 只有一個 streak，由 `/api/activity` 後端算——某天有「讀」（任一 feedback row，滑卡/LESS/MORE 都會寫）**或**「答題」（quiz_attempts）就算一天。舊的 localStorage `mb_streak` 已廢除（它讀完就 +1、不看日期、不歸零，跟題目頁數字互相矛盾）。`/api/activity` 另回 `activeToday`，讀完簡報的結束頁用它決定要不要當場 +1 顯示
6. **Deploy**：Vercel free tier（[decisions/2026-04-26-v2-design.md](./docs/decisions/2026-04-26-v2-design.md) §4 決策）
7. **雙內容 pipeline 解耦**：Quiz 不依賴文章資料，獨立 cron / entry / dedup，只共用 provider 選擇邏輯和 DB。理由：兩條內容各自有自己的更新節奏和失敗模式，耦合在一起會讓文章 pipeline 的錯誤處理複雜化，也讓 quiz 沒辦法獨立重跑
8. **Quiz 追問重用文章 Ask 基礎設施 — streaming 對，persistence 錯（2026-09-07 修正）**：`/api/ask` SSE streaming 本身跟 `articleId` 無關（只吃 `articleTitle`/`articleSummary`/`articleContext`），quiz 用合成 `articleId = quiz-${id}` 去問是通的。但「歷史掛進 `conversations` table」這件事**從沒真的動起來**：`api/ask-history.ts` 的 `isArticleId` 是 `/^[a-f0-9]{16}$/`，`quiz-6` 直接 400；就算放寬 regex，`conversations.article_id` 對 `articles.id` 的 FK 是真的有 enforce，塞一個不存在的文章 id 會 500（拿掉 FK 得整張表 rebuild，不是加個 migration 就好）。`app/` 的 `saveAskHistory` 把這個 400 吞進空 `catch {}`，所以整個 Expo Go 封測期間 quiz 追問歷史都靜默沒存到。web/（`web/src/askHistory.ts`）這次改成 quiz 對話直接存 localStorage（`mb_quiz_ask_quiz-<id>`），不碰後端——沒有帳號系統，`device_id` 本身也只是 localStorage/AsyncStorage UUID，reach 其實等價。app/ 2026-09-29 跟進同一招（`app/src/api.ts`，AsyncStorage `sift_quiz_ask_quiz-<id>`）。跟 `saves.deleted_at` / `notion_syncing_at` 是同一種病：文件寫的比實作做的多，見 docs/KNOWN_ISSUES.md
9. **多使用者靠 device_id，不做帳號系統**：AsyncStorage 生成 UUID 當身分依據，貫穿五張表。輕量但有已知限制：換裝置 = 換身分，資料不會跟著人走
10. **device_id 不跨 client migrate**：web 用 localStorage `mb_device_id`，app 用 AsyncStorage `sift_device_id`，2026-09-07 web port 沒有做身分遷移——Activity 歷史在 web 上從零開始算。刻意決定，不是漏做（沒有帳號系統，兩邊本來就是不同身分）

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
- No Hono / Node API functions; every endpoint is a root `api/<name>.ts` Edge function.
