# AI Morning Brief V2 — Product & Engineering Design

> **Status**: F1–F4 + Feedback loop + Web Push 已上線（Vercel + GitHub Actions）。**ntfy 已淘汰（2026-04-25）**，唯一推播管道為 Web Push。F4 Notion 整合已 ship（`api/save.ts` Edge Runtime + raw fetch）。
>
> **2026-04-26 方向校準**：原本 F5 quiz 排第一，覆盤後發現 quiz 是高風險賭注（賭使用者願意主動測驗）。改由 **Library / 歷史頁** 取代 F5 成為下一個優先項目，quiz 降為 Library 上的 retention layer。詳見 [PRODUCT_REVIEW_2026-04-26.md](./PRODUCT_REVIEW_2026-04-26.md)。
>
> **Baseline**: [PROPOSAL.md](./PROPOSAL.md) (V1, 已被 V2 取代)。

---

## 1. 為什麼要 V2

V1 (ntfy 推播) 完成了「每天送內容到你眼前」,但沒解決兩個真實問題:

1. **讀完就忘** — 被動閱讀一週後記憶保留率僅 34%(研究數據)。ntfy 是通知介面,不是消費介面,大腦沒進入「瀏覽模式」。
2. **沒有 compounding** — 每天看完就結束,產品不會變得更懂你,你的知識也沒累積成資產。

V2 的目標不是「更漂亮的 ntfy」,而是**重新定義消費模式**:從「收推播」變成「打開一個越用越懂我的技術學習 feed」。

> **2026-04-25 更新**：V2 完成度足以淘汰 ntfy。現在通知改走 Web Push（VAPID + iOS standalone PWA），標題 = lead story headline，點擊直接落到 PWA 卡片介面，沒有 ntfy 的中間層。Infra 錯誤由 GitHub Actions failure + log 診斷，不送到使用者 Web Push。

---

## 2. 產品哲學

### 核心定位
> **後端工程師的個人學習 OS**。好玩的定義綁在「每讀一天,技術實力多一點」。

### 設計支柱

| 支柱 | 研究依據 | 對應設計 |
|---|---|---|
| **Hooked Model** (Nir Eyal) 的 Investment 環節 | 用戶投入資料 → 產品越來越懂你 → 遷移成本上升 | 👍👎 / 🔖 / 💬 追問,全部回饋進 classifier |
| **Active Recall + Spaced Repetition** | 主動回想一週後保留率 80% vs 被動閱讀 34% | 晨間 recall quiz(3/7/14 天前的卡片) |
| **自動結構化捕捉** | 「手動整理 Notion」是已知失敗模式,19 個 database 從不更新 | 🔖 按鈕直接寫入 Notion,使用者零維護 |
| **Variable Reward** | 不確定性是心理鉤子 | 💬 追問回答不可預期、quiz 題目不可預期、內容本身每天變化 |

### 明確不追求的東西
- 多用戶 / 社交功能(你是唯一用戶)
- 美到炸的視覺設計(夠用就好,時間花在 retention)
- 即時性(每天一次就夠,不需要 real-time)

---

## 3. 功能清單 (Feature List)

> **2026-04-26 重排**：F5 quiz 從第一順位降為 Library 上的 retention layer；新增 F8 Library 為下一優先項目。原 F1–F4 已 ship 不動。

### F1 — PWA 卡片介面 + Web Push（已替代 ntfy）✅
- 每張卡一篇文章,swipe 切換
- View Transitions API 提供 native 感切換
- Home screen icon 一鍵開啟(iOS Shortcuts + PWA)
- **Web Push (VAPID)**：早上 07:30 自動推播到 iPhone 鎖定畫面，標題 = lead story headline，點擊開啟 PWA

### F2 — 👍👎 反饋 → Classifier 學習
- 每張卡兩顆鈕:`👍 要更多這種` / `👎 不要這種`
- 反饋寫入 SQLite,次日 classifier prompt 帶入最近 N 筆偏好
- **這是 Investment 環節的核心** — 「我的反饋真的改變明天的 brief」是黏著的主要來源

### F3 — 💬 追問 (Active Recall 引擎)
- 每張卡開 Claude 對話(SSE streaming)
- 預設 Haiku 4.5(成本低),深度模式可切 Sonnet 4.6
- Claude 主動拋 3 個後端工程師視角的追問:
  - 「這個協定跟你熟的 X 比有什麼 trade-off?」
  - 「production 導入,第一個要擔心什麼?」
  - 「這個 API 設計解決了什麼原本 REST 做不到的事?」
- 把「讀」變成「想」

### F4 — 🔖 → Notion 自動存檔
- 點收藏 → Notion API 自動建頁,結構化填:
  - Summary / 你的 1-line note / 原文連結 / Claude 追問對話 / related articles
- 使用者**零手動整理**。Notion 變成 cold storage + search,PWA 負責 hot consumption
- 解決「想做筆記最後沒做」的痛點

### F5 — 晨間 Recall Quiz
- 每天打開 app,新 brief 之前先跳 1-2 張**3/7/14 天前**讀過的卡
- 遮掉重點問「還記得這個做什麼嗎?」→ 點看答案 + 標「記得 / 忘了」
- Quiz 題目由 Haiku 在收藏/分類時順便生成(cache 起來)
- 直擊「讀完就忘」核心痛點

### F6 — Skill-tag 雙軸分類
- 現有的 `#model-release` 這類內容 tag 保留
- **新增工程技能 tag**:`#rust #go #grpc #kafka #distributed-systems #postgres #observability #wasm`
- Classifier 吃進用戶歷史反饋 → 自動加權你常點的 tag
- 側欄 tag filter = 個人技術 feed

### F7 — 週報 (Investment Payoff)
- 週日 22:00 cron 生成
- 內容:本週讀了 N 篇、最常出現的技術、哪些 tag 你點最多、tag 共現矩陣
- 自動寫入 Notion 週報頁,累積成長軌跡

### F8 — Library / 歷史頁（2026-04-26 新增，**現為下一優先項目**）
- 解決使用者親口說的痛點：「滑過沒收藏的找不回 + LLM 內容隔天就丟」
- `/library` route，按日期 group 顯示所有歷史文章
- 每筆 row 點擊展開全部 LLM 生的內容（summary / context / engineeringImpact / reason）+ 補做 reaction（👍👎🔖）
- Filter：category chip / 反應 chip / fuzzy 搜尋
- 兩個 tab：所有歷史 / 我的收藏（後者顯示 Notion sync 狀態）
- **次要入口**：日報主畫面右上加圖示，不上 tab bar（避免取代日報「滑完就走」UX）
- 詳細設計提案見 [LIBRARY_PROPOSAL.md](./LIBRARY_PROPOSAL.md)
- F5 quiz 改成蓋在 F8 上的功能（從 Library 選 N 天前的卡出題），不再獨立。配退場條件：「2 週連續 7 天沒答 quiz 就砍掉」。

### 明確不做 (Rejected)
| 功能 | 理由 |
|---|---|
| DALL-E / Gemini Cover image | Variable reward 已由 F3/F5/F7 滿足,純裝飾、redundant |
| iOS Native Widget | 3-7 天開發成本,Swift 跟後端技能樹零交集,PWA + Shortcuts 已達 90% 效果 |
| Knowledge graph | embedding + vector search + graph render,深坑,3 週起跳,回報率低 |
| Bun runtime | 生態相容性風險 > 學習報酬 |
| Cloudflare Workers + D1 | 單人 app 不需要 edge,D1 的 SQL 限制反而綁手綁腳 |
| Go 後端 | 你已熟 Go = 零學習報酬;LLM SDK 生態 TS 先行;現有 code 全是 TS |
| Provider alternation v2（exploration slot, 時間衰減）| 連 baseline 都還沒量過就在規劃 v2，過早優化（[PRODUCT_REVIEW](./PRODUCT_REVIEW_2026-04-26.md) §「先量再優化」） |
| Quiz 作為獨立 product line | 賭使用者願意主動測驗，假設不成立。改成 Library 上的 retention layer，視 Library 有用再做 |

---

## 4. 技術堆疊 (Decided)

| 層 | 選擇 | 理由 |
|---|---|---|
| Language | TypeScript (strict) | 沿用 V1,LLM 官方 SDK 最完整 |
| Runtime | Node.js 20+ | 穩、Vercel 原生支援 |
| Backend framework | **Hono** | 新學、輕量、TS-native、edge-ready |
| Frontend | **React + Vite + PWA** | 已會、快、iOS 加到主畫面就是 app |
| Styling | Tailwind + View Transitions API | 卡片切換原生感 |
| DB | **Turso (libSQL)** free tier | 9GB + 10 億讀/月免費,SQLite 語意,零運維 |
| ORM | **Drizzle** | type-safe、零 abstraction、對 Go 背景的人友善 |
| Streaming | **SSE** (Server-Sent Events) | 追問即時感,比 WebSocket 輕 |
| LLM | GPT-4o / Sonnet 4.6（Classifier + Brief 輪替）<br>Haiku 4.5（Ask 追問專用） | 官方 SDK、prompt caching |
| 外部整合 | Notion API | 免費、個人用無限 |
| Cron | **GitHub Actions** (沿用 V1) | 免費、已運作 |
| Deploy | **Vercel** free tier (PWA + API) | 零成本、CI 整合 |

**總月費:$0 infra + ~$3 LLM ≈ 90 TWD/月**（實測，見下方 §8）

---

## 5. 架構圖

```
┌─────────────────────────────────┐
│ GitHub Actions cron (每日 07:30)│
│   scraper → classifier → brief  │ ──┐
│   → persist → web-push          │   │
└─────────────────────────────────┘   │
                                      ▼
                            ┌─────────────────────┐
                            │ Turso (libSQL)      │
                            │  articles           │
                            │  feedback           │
                            │  saves              │
                            │  conversations      │
                            │  quizzes            │
                            │  push_subscriptions │
                            └─────────────────────┘
                                      ▲
                          ┌───────────┴──────────────────┐
                          │                              │
┌──────────────┐   REST   │  ┌────────────────────────┐  │
│ PWA (React)  │◄────────►│  │ Hono API               │  │
│              │          │  │ (api/index.ts, Node)   │  │
│ - Card swipe │          │  │ - GET /api/feed        │  │
│ - 👍👎      │          │  │ - POST /api/feedback   │  │
│ - 🔖 save    │          │  └────────────────────────┘  │
│ - Quiz       │          │  ┌────────────────────────┐  │
│ - SW push    │   SSE    │  │ Edge Functions         │  │
│   handler    │◄────────►│  │ - POST /api/ask        │  │
│              │   POST   │  │ - POST /api/push-      │  │
│              │◄────────►│  │   subscribe            │  │
│              │          │  │ - POST /api/save       │  │
└──────────────┘          │  └────────────────────────┘  │
       ▲                  │    Vercel                    │
       │ Web Push (VAPID) │                              │
       └──────────────────┴ from GitHub Actions runner ──┘
```

---

## 6. DB Schema (Draft)

```typescript
// Drizzle schema (illustrative)
articles = {
  id: string (pk)
  url: string (unique)
  title: string
  summary: string
  context: string
  engineeringImpact: string
  categoryTag: string
  skillTags: string[]          // NEW: #go #grpc etc
  renderLevel: 'FULL' | 'LIGHT' | 'OMIT'
  classifiedAt: timestamp
  briefDate: date              // which day's brief it belongs to
}

feedback = {
  id: pk
  articleId: fk
  signal: 'up' | 'down'
  createdAt: timestamp
}

saves = {
  id: pk
  articleId: fk
  userNote: string | null
  notionPageId: string | null  // after Notion write
  createdAt: timestamp
}

conversations = {
  id: pk
  articleId: fk
  messages: json               // [{role, content, ts}]
  model: 'haiku' | 'sonnet'
  createdAt: timestamp
}

quizzes = {
  id: pk
  articleId: fk
  question: string
  answer: string
  createdAt: timestamp
  lastShownAt: timestamp | null
  userRecall: 'remembered' | 'forgot' | null
}
```

---

## 7. Phased Rollout

### Week 1 — Foundation ✅
- [x] Hono + Vite + PWA 骨架
- [x] Turso 建立 + Drizzle schema migrate
- [x] Port V1 scraper/classifier/brief gen → 寫入 Turso（V1 ntfy 推播鏈路已於 Week 2 退役，改走 Web Push）
- [x] PWA shell:卡片 swipe UI
- **Result**: 手機打開能看到今天 3 張卡，Vercel 上線

### Week 2 — Core Interaction ✅
- [x] 👍👎 寫回 DB
- [x] Classifier 吃進 feedback prompt（近 30 天 / 20 筆 / 門檻 10）
- [x] 💬 追問：SSE streaming，Haiku 4.5（`api/ask.ts` Edge Function，非 Hono）
- [x] **Web Push 全鏈路上線**：VAPID 生成、`api/push-subscribe.ts` Edge Function 寫 `push_subscriptions`、pipeline 先 persist 再 `notify/web-push.ts` 推送到所有訂閱者、ntfy 退役（2026-04-25）
- [ ] Skill-tag 加到 classifier 輸出（待做）
- **Result**: 滑卡、追問、feedback loop、Web Push 全部上線

### Week 3 — Investment Layer ✅
- [x] **Notion API 整合（F4）**：`🔖` → 自動建 page（2026-04-25 上線；`api/save.ts` Edge Runtime + raw fetch，Notion 失敗不阻斷收藏）
- [x] **`/api/feedback` Edge migration**（2026-04-26）：原本在 Hono，觀察到 504 timeout 後搬到 Edge Runtime（`api/feedback.ts`）
- [x] **通知文案重做**（2026-04-26）：拿掉「from Sift」冗餘行、`／` → `·`、釋出空間放 lead 文章的 `engineeringImpact` 當 teaser
- **Demo goal achieved**: 每收藏一篇，Notion 就長一篇，完全不用手動整理

### Week 3.5 — 方向校準（2026-04-26）
- 觸發：F4 ship 後做了一次刻意的產品覆盤
- 結論：Library / 歷史頁取代 quiz 成為下一優先項目（quiz 是賭注、Library 是已表達需求）
- 產出：[PRODUCT_REVIEW_2026-04-26.md](./PRODUCT_REVIEW_2026-04-26.md)（覆盤紀錄 + 工作原則）+ [LIBRARY_PROPOSAL.md](./LIBRARY_PROPOSAL.md)（設計提案）

### Week 4 — Library Layer（取代原 Retention Engine 計畫）
- [ ] **F8 Library PR-A**（純讀）：`/library` 頁面 + 按日期分組列表 + 點擊展開全部 LLM 內容。先沒搜尋／filter
- [ ] 觀察期：1-2 週看自己有沒有真的回去翻
- [ ] 若 PR-A 證明有用 → PR-B（filter + 搜尋） → PR-C（補做 reaction）
- **Demo goal**: 能找到「我昨天看到一篇 X 但沒收藏」的文章，不用開 DB console

### Week 5+ — Retention Engine（前提：Library 證明有用）
- [ ] 晨間 recall quiz flow（從 Library 選 3/7/14 天前的卡，遮答案）— 配退場條件
- [ ] 週報 cron（週日 22:00，Sonnet 生成，同步 Notion）
- **Demo goal**: 每天「先答 quiz → 再看新 brief」變成日常

### Phase 2 (Optional,視黏著度決定)
- [ ] TTS audio version(local [Piper](https://github.com/rhasspy/piper),$0)
- [ ] 深度追問 toggle(Sonnet)
- [ ] 自訂 skill tag 管理

---

## 8. 成本試算（實際）

| 項目 | Model | 每日用量 | 估計年費 |
|---|---|---|---|
| Classifier | GPT-4o / Sonnet 4.6（輪替） | top 12 篇各送一次 LLM | ~$32 |
| Brief generator | GPT-4o / Sonnet 4.6（輪替） | 1 call / 天 | ~$4 |
| 💬 追問 | Haiku 4.5 | ~4 turns / 使用日（SSE） | ~$1 |
| Notion API | — | 無限 | $0 |
| Turso | — | free tier | $0 |
| Vercel | — | free tier | $0 |
| GitHub Actions | — | free | $0 |
| **Total** | | | **~$35–40/年 ≈ 90 TWD/月** |

Prompt caching 已啟用（Anthropic `cache_control`、OpenAI 自動），Classifier system prompt 跨 12 次 call 只寫一次 cache，大幅壓低輸入成本。調整 `CLASSIFIER_CAP`（預設 12）可線性控制主要成本。

---

## 9. Working Rules (延續 V1)

沿用 `CLAUDE.md` 規範:
- 修改檔案後必須跑 `npm run build`
- 超過 10 輪對話,編輯檔案前重新讀
- 大任務拆獨立模組
- Graceful degradation 限於 LLM 內容生成：classifier 單篇失敗與 brief generator 失敗可 fallback；DB persist / Web Push 發送失敗必須讓 cron fail，避免通知點開後沒有內容。

**新增規則 (V2 專屬):**
- DB migration 用 Drizzle Kit,每個 schema 改動都要有 migration file
- Notion API 呼叫獨立成 `src/notion/` 模組,失敗 retry + log,但不阻斷 core flow
- SSE endpoint 超時上限 30s,超過強制關閉 connection
- Quiz 題目生成失敗不影響收藏功能(獨立 try/catch)

---

## 10. Open Questions (待討論,不 blocking)

1. **反饋衰減** — ✅ 已實作：近 30 天窗 + 最多 20 筆 + 門檻 10 筆才注入 + 👎 per-category 至少 2 次才算負訊號。時間衰減權重留 Phase 2 視實際資料決定。
2. **Quiz 排程演算法** — 3/7/14 是固定間隔還是 SM-2 algorithm (Anki)?MVP 用固定間隔,Phase 2 考慮 SM-2。
3. **Skill tag 詞彙表** — 開放任意 tag 還是 controlled vocabulary?先 controlled(預定義 ~20 個),避免 classifier 亂生。
4. **Notion page template** — 要不要讓使用者自訂?MVP 硬編碼,之後再抽成設定。

---

## 11. Success Metrics (給自己看的)

- **Daily open rate**: 目標連續 30 天每天開 app(streak ≥ 30)
- **Quiz 答題率**: 收到 quiz 的那些早上,有多少比例實際答題(目標 > 80%)
- **追問深度**: 平均每次互動追問幾輪(目標 ≥ 2)
- **Notion 累積**: 一個月內 vault 累積 ≥ 30 篇、且自己回頭搜尋過 ≥ 3 次(證明 vault 真的有用)
- **開發本身**: 四週內 ship 完 Week 1-4 全部項目(證明計畫可執行)

如果一個月後上述指標 < 50%,就回頭檢視:是內容品質問題、還是 retention 設計沒戳到點。
