# Library 頁面設計提案

> **Status (2026-04-28)**：已 ship（2026-04-26）。本文件為 ship 前的設計提案紀錄，現況以 [CLAUDE.md](../CLAUDE.md) TL;DR + `web/src/Library.tsx` 為準。
>
> 給設計用的 self-contained brief。讀完這份文件就能開始畫畫面，不需要再回去翻 codebase。
>
> 上下文背景：[PRODUCT_REVIEW_2026-04-26.md](./PRODUCT_REVIEW_2026-04-26.md) §「真正的第三格答案」。

---

## 1. 為什麼要這頁

### 痛點（使用者親口說的）

> 「我們每天都不一樣，那這樣會不會很浪費，我可能看過但是沒存的，我還要跑去 db console 查，如果有一個頁面可以顯示我的歷史也不要浪費掉之前花錢去請 LLM 生的介紹什麼的。」

具體三件事：
1. 過去某天滑過但沒收藏的文章 → 現在找不回
2. LLM 生的 summary / context / engineeringImpact / reason → 隔天卡片消失就等於丟掉
3. 沒有「個人 AI 知識庫」的累積感 — 每天都歸零

### 解決什麼

讓「**每天花錢生的 LLM 內容變成可以累積、可以回頭翻的個人資產**」。

---

## 2. 產品定位

Library **不是**首頁，也**不是**取代每日卡片流的。它是：

> 「**我有空回頭翻**」的入口。次要位置，不主動推銷。

對比：

| 主流 | Library |
|---|---|
| 早上滑卡 → 看完 top 3 → 走人（90% 使用情境） | 想找某篇看過的文章 / 隨便逛逛累積感（10% 使用情境）|
| 推播觸發、被動消費 | 主動進入、瀏覽模式 |
| 滿版卡片、editorial 風格 | 列表為主、密度高 |

### 不是什麼

- 不是 doomscroll feed（避免取代日報的「滑完就走」UX）
- 不是 search engine（搜尋功能要有，但不是核心定位）
- 不是 Notion 的取代品（Notion 還是 saves 的長期 PKM 出口；Library 是 app 內的「全部歷史」）

---

## 3. 現有設計語言（要遵守）

| 項目 | 值 |
|---|---|
| 風格基調 | 報紙 / FT editorial 風格 |
| 字體 | Source Serif 4（內文）、JetBrains Mono（metadata / tag） |
| 主背景色 | `#14110D`（深咖啡黑，`T.bg`） |
| 既有 component | 看 `web/src/components/Card.tsx`（日報卡片）、`Chrome.tsx`（外框）|
| 現有 routes | `/`（日報）、splash gate（首次開啟） |
| Status bar | iOS standalone PWA，theme-color 必須對齊 `T.bg` |

新頁面繼承這套語言。**不要**重新設計視覺體系。

---

## 4. 核心使用情境（User Stories）

### S1 — 「我昨天看到一篇 Lambda Calculus 什麼的，找一下」
- 使用者打開 Library
- 預設按日期分組，**昨天**那組在最上面
- 滑一下就看到該文章
- 點開展開 LLM 生的內容（summary / context / engineeringImpact / reason）
- **可選：點 🔖 加入收藏（如果當時沒收藏）→ 寫 saves + Notion**

### S2 — 「我這個月對 #infra 哪些東西特別有反應」
- 使用者點 filter → 選 `#infra`
- 按時間倒序看到所有 infra 文章
- 可看到旁邊有 👍 / 🔖 標記，回想當時反應

### S3 — 「Trump fires... 我記得我按過 👎，是哪天的事」
- 使用者點 filter → 「我 👎 過的」
- 按時間倒序看到所有 down-voted 文章

### S4 — 「我累積的 saves 有多少」
- 使用者切到 saves tab
- 看到全部已收藏 + Notion sync 狀態（已同步 / 未同步）
- 點開可以看 user_note（如果有寫）+ 跳轉 Notion

### S5 — 隨便逛逛
- 使用者沒有明確目的，就是想看「累積感」
- 滑列表，每篇看標題 + 一行 summary
- 點到有興趣的展開細節

---

## 5. 資訊架構

```
/library
  ├─ Tab: 所有歷史 (預設)
  │   ├─ Filter bar（折疊／sticky top）
  │   │   ├─ 搜尋框（標題 + summary fuzzy match）
  │   │   ├─ Category chip（多選）：#infra #model-release #policy ...
  │   │   ├─ 反應 chip：👍 我喜歡 / 👎 我不喜歡 / 🔖 已收藏
  │   │   └─ 日期區間（隱藏在「更多」後面）
  │   └─ 文章列表（按日期 group，新→舊）
  │       └─ 每天 group：
  │           日期 header（"4 月 26 日 (週日) · 3 篇"）
  │           ├─ 文章 row
  │           │   標題（serif，主）
  │           │   metadata 行（mono，次）：source · category · score · 反應 icon
  │           │   點擊展開 → summary / context / engineeringImpact / reason
  │           └─ 文章 row ...
  │
  └─ Tab: 我的收藏
      ├─ Filter：已同步 Notion / 未同步 / 全部
      └─ 列表：按收藏時間倒序
          每筆 row：標題 + user_note（若有）+ Notion 同步狀態 icon + 跳 Notion 按鈕
```

---

## 6. 入口設計

不在 tab bar 第一順位（避免取代日報）。建議：

- 日報主畫面右上角加一個 icon（書架／圖書館 metaphor，避開 list/search 這些太通用的）
- 點擊 → push 到 `/library`
- Library 內也要清楚的「← 回今日」按鈕

---

## 7. 卡片 row 設計（重要）

這是密度的關鍵 — list 模式不能用日報卡片那種厚重 editorial 排版。建議兩段：

### Collapsed（預設）
```
┌─────────────────────────────────────────────────┐
│ Jaeger adopts OpenTelemetry at its core         │  ← title (serif, 16px)
│ thenewstack.io · #tooling · 82  👍              │  ← meta (mono, 12px, dim)
└─────────────────────────────────────────────────┘
```

### Expanded（點擊後）
```
┌─────────────────────────────────────────────────┐
│ Jaeger adopts OpenTelemetry at its core         │
│ thenewstack.io · #tooling · 82  👍              │
│                                                 │
│ summary（一句話）                                │
│ context（1-5 句）                                │
│                                                 │
│ ⚙ engineeringImpact                              │
│ 一句具體工程影響                                  │
│                                                 │
│ ✓ 為什麼值得讀                                   │
│ reason（一句話）                                  │
│                                                 │
│ [ 🔖 收藏 ] [ 💬 追問 ] [ 開原文 ↗ ]             │
└─────────────────────────────────────────────────┘
```

注意：
- expanded 狀態保留**所有 LLM 生的內容**（這是「不浪費」的核心）
- 反應 icon（👍 / 👎 / 🔖）顯示**當時的狀態**，可以重新編輯
- 「💬 追問」進入 AskSheet（沿用既有 component）

---

## 8. Empty / Loading / Edge States

| 狀態 | 顯示 |
|---|---|
| 第一次進入 / 完全沒資料 | 報紙風 illustration + 「累積中：明天再回來」|
| 搜尋無結果 | 「找不到符合的文章。試試其他關鍵字？」 |
| Filter 沒結果 | 「這個 filter 組合沒文章。」 + 一鍵清除 filter 按鈕 |
| Loading | skeleton row（不是 spinner） |
| 離線 | 「需要網路才能載入歷史」（沒有 SW cache，PWA 有意設計如此）|

---

## 9. 必須避開的反模式

1. **不要無限往下滑然後當機**：volume 6 個月會到 5000+ 篇。要分頁／虛擬列表（建議：每次載 30 天，「載入更多」按鈕）。
2. **不要把 expanded 狀態做成 modal**：modal 會打斷瀏覽流。直接 in-place expand。
3. **不要再加一個 tab bar**：app 已經夠扁平，再加 tab navigation 會很擁擠。Library 內部的「所有歷史 / 收藏」用 segmented control（iOS 風）就好。
4. **不要主動推 Library**（沒有「你還沒看過 N 篇舊文章」這種催促）：這違反它「次要入口」的定位。
5. **搜尋不要是 server-side 才能用**：簡單 client-side fuzzy match 就好（資料量在客戶端可以負擔）。

---

## 10. 給設計師的關鍵 prompt 摘要

幫我設計一個 React PWA 的 `/library` 頁面，要求：

- 既有 app 是「報紙風」的 daily AI brief（深背景 `#14110D` + Source Serif 4 內文 + JetBrains Mono metadata）。Library 繼承同一套語言但**密度要高**（不是日報那種滿版 card）。
- 主結構：頂部有 segmented control 在「所有歷史 / 收藏」之間切。下方是 filter bar（搜尋 + category chips + 反應 chips），再下方是按日期 group 的文章 row 列表。
- 文章 row 預設 collapsed（標題 + metadata 一行），點擊 in-place 展開全部 LLM 內容（summary / context / engineeringImpact / reason）+ action buttons（🔖 收藏 / 💬 追問 / 開原文）。
- 入口：日報主畫面右上加圖示，不放 tab bar。
- Empty / loading state 沿襲 editorial 風格，不要 generic SaaS 風。
- 響應式：主要使用裝置是 iPhone（standalone PWA，notch 要避開）；桌機 viewport 直接同樣 layout（不要為 desktop 重排），最大寬度 ~720px 居中。

請給我 React + Tailwind + 既有 theme variable（從 `web/src/theme.ts` 抓）的 JSX 草稿，以及對 information density / typography hierarchy / interaction state 的設計思考。

---

## 11. 實作優先順序（給工程的，不是給設計的）

設計拿到後，實作分三個 PR：

1. **PR-A 純讀**：Library 頁面 + 列表 + 展開 + 既有資料完整顯示。**先沒搜尋、沒 filter**。驗證：能不能找到昨天的文章？
2. **PR-B Filter**：category chip + 反應 chip + 搜尋。驗證：能不能找到「我這個月對 #infra 哪些有反應」？
3. **PR-C 互動**：在 expanded 狀態下重新 👍/👎、追補 🔖。驗證：當時沒存的能不能補存？

先做 PR-A，跑 1-2 週看自己有沒有真的回去翻。**有用再做 PR-B**。這是覆盤裡學到的「設退場條件」原則。
