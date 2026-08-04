# Library 設計 v1 Review

> **Status: Decision record, frozen 2026-04-28. Do not edit for new facts.**
>
> Library 已 ship（2026-04-26）。本文件為設計 review 當下紀錄——UI 細節層級的 mockup 評注，現況以 [../../CLAUDE.md](../../CLAUDE.md) + `web/src/Library.tsx` 為準。
>
> 對 claude-design 第一版 Library 頁面 mockup 的檢視紀錄 + 給設計師的回饋 prompt。
>
> **Date:** 2026-04-26
> **設計提案來源：** [2026-04-26-library-proposal.md](./2026-04-26-library-proposal.md)
> **下一版要補：** Mobile viewport / Expanded row / Empty / Loading state（已隨 ship 完成，此檔未回填最終結果）

---

## 1. DB 可行性核對

對照 `src/db/schema.ts` 確認所有 filter / 顯示欄位都可實現：

| 設計需求 | 對應 schema | 可行 |
|---|---|---|
| 👍 喜歡 filter | `feedback.signal = 'up'` JOIN | ✅ |
| 👎 不喜歡 filter | `feedback.signal = 'down'` JOIN | ✅ |
| 🔖 已收藏 filter | `saves.articleId` 存在 JOIN | ✅ |
| Category chip filter | `articles.categoryTag` | ✅ |
| 標題搜尋 | `articles.title LIKE` | ✅ |
| 摘要搜尋 | `articles.summary LIKE` | ✅ |
| 日期分組 + range | `articles.briefDate` | ✅ |
| 列表 metadata（title / category / source / score） | `articles.{title, categoryTag, source, score}` | ✅ |
| Reaction icon 顯示 | `feedback` + `saves` JOIN | ✅ |
| 展開 LLM 內容（summary/context/engineeringImpact/reason） | 全 `articles` 欄位 | ✅ |
| 收藏 tab Notion 同步狀態 | `saves.notionPageId IS NULL/NOT NULL` | ✅ |
| 收藏 tab stats（4 / 3 / 1） | COUNT 查詢 | ✅ |

### 已知資料層差異（實作時要處理）

- 設計顯示 source 為 `THENEWSTACK.IO`（大寫 domain），但 `articles.source` 實存 `The New Stack`（friendly name）。Domain 要從 `articles.url` client-side derive：`new URL(article.url).hostname.toUpperCase()`
- Skill tags filter **不在這版範圍** — schema 有 `skillTags` 欄位但 classifier 還沒產，等 F6 ship 後再加

### 11 個 Category（全部要能放進 chip filter）

```
#model-release · #api-platform · #infra · #tooling · #eval · #agent
· #policy · #market · #opinion · #event-promo · #research
```

設計目前顯示 7 個（其餘藏在橫向 scroll），這 OK，但要保證 11 個都能跑出來。

---

## 2. 給 claude-design 的回饋 prompt

下面這段是 self-contained，可直接複製貼到 claude-design 開新對話。

---

### 主題：Library 頁面 v1 review — 通關項目 + 待補洞

你上次給的 Library 設計（深底 + Source Serif 4 + 報紙 editorial 風 + 列表分日期 group）整體方向對。我跟工程師核對 schema 後，所有 filter 都可實現。下面是 review 結果：

### A. 通關，請保留不要動

- 「< 今日」back link + italic「Library」標題 — 對齊既有 editorial 風
- Tab 用「所有歷史 9 / 收藏 4」配 count badge — 直覺
- 日期 header「4 月 26 日 週日 · 4 篇」格式 — 報紙感
- Category chip 微 tint 配色（不同 category 不同底色但都低飽和）— 不刺眼有辨識
- Reaction icon（👍/👎/🔖）放在 metadata 行右側 — 一眼看「過去自己什麼反應」
- 收藏 tab 上方 stats 列（4 已收藏 / 3 Notion 已同步 / 1 待同步）— 加得很好，原 spec 沒有
- List 模式（不是日報的 card 模式）密度對了
- Filter chip bar 橫向 scroll 是有意設計，**不要改成折疊**

### B. 要修的（按優先序）

**B1. Filter chip bar 兩種語意要視覺分隔（中優先）**

目前「👍 喜歡 / 👎 不喜歡 / 🔖 已收藏 / #TOOLING / #INFRA / ...」無分隔混在一起。
反應 filter（👍👎🔖）跟 category filter（#xxx）是不同 dimension，combined 邏輯是 AND。
請加一個視覺 divider（垂直細線、或更大 gap、或 reactions 群組外加微框）讓使用者知道「這兩組是不同維度」。

**B2. 收藏 tab 同步狀態視覺權重不一致（中優先）**

目前已同步顯示「📋 Notion ✓」（小 icon），未同步顯示「📋 未同步」（純文字）。
請統一為「dot + label」結構：

- 已同步：`● Notion`（綠色實心圓點 + 字）
- 待同步：`○ 待同步`（空心圓點 + 字）

兩者用同一視覺語法、靠顏色 / fill 區分狀態。

**B3. Stats 列大數字風格略違和（低優先）**

`4 / 3 / 1` 的字體權重比頁面其他元素都重，dashboard 風跟 editorial 風打架。
請保留資訊但收斂視覺重量 — 數字 size 降到跟 list 內 score 同級即可，不要跟「Library」標題競爭視覺重點。

### C. 缺哪些 state 還沒設計，請補

**C1. Article row「展開」狀態**

點擊 chevron `>` 後，row in-place 展開要顯示：

- summary（一句具體描述）
- context（1–5 句背景）
- engineeringImpact（一句具體工程影響，最重要）
- reason（一句為何值得讀）
- 三顆 action button：`🔖 收藏 / 已收藏` ｜ `💬 追問` ｜ `開原文 ↗`

請設計 collapsed → expanded 的視覺過渡（chevron 旋轉 90°、內容區用 fade-in 或 slide-down）。內容區要明顯比 collapsed row 更厚、有自己的內邊距，讓使用者知道「我進入閱讀模式了」。

**C2. Empty / 搜尋無結果 / Filter 無結果 state**

- 第一次完全沒資料：報紙風 illustration（簡筆 line art） + 「累積中：明天再回來」
- 搜尋無結果：「找不到符合的文章。試試其他關鍵字？」
- Filter 組合無結果：「這個 filter 組合沒文章。」+ 一鍵清除 filter 的按鈕

**C3. Loading state**

不要 spinner。請用 skeleton row（list 結構的灰色 placeholder），保持密度感。

**C4. Mobile viewport（iPhone standalone PWA）**

目前兩張截圖看起來是 desktop 寬度（~1500px）。我的主要使用裝置是 iPhone 14 Pro（390pt 寬）standalone PWA（要避開 notch + home indicator safe area）。
請補一張 390pt 寬的 mobile 版本，重點看：

- Tab bar / Filter chip bar 在窄寬下的橫向 scroll 體驗
- 日期 header 是否要 sticky（建議要：往下滾很多筆時保持知道現在在哪一天）
- Article row 的 metadata 行是否會折行（category chip + source + score + reaction，4 個元素在 390pt 下可能擠）

### D. 工程實作補充說明

設計師你不用動，但實作時要知道：

- 列表的 source 顯示 `THENEWSTACK.IO`（大寫 domain 風）— 資料庫存的是 `The New Stack`（friendly name）。Domain 要從 article URL client-side derive，這個工程處理就好
- 11 個 category 全部要能放進 chip filter（設計現在顯示 7 個，剩 4 個藏在橫向 scroll）：`#model-release / #api-platform / #infra / #tooling / #eval / #agent / #policy / #market / #opinion / #event-promo / #research`
- 反應 icon 顯示邏輯：每篇 row 最多顯示 1 個 icon（優先序：🔖 收藏 > 👍 喜歡 > 👎 不喜歡 > 無）
- Score 是 0-100，不要顯示 `★` 或其他符號，純數字即可

### E. 給的版本要求

請給：

1. 「所有歷史」tab 的 mobile（390pt） + desktop 兩個寬度
2. 「收藏」tab 同上兩寬度（套用 B2/B3 修改後）
3. Article row 的 collapsed → expanded 兩個狀態
4. 三個 empty state（首次進入 / 搜尋無結 / filter 無結）
5. Loading skeleton state

格式跟上次一樣：React + Tailwind + 我提供的 theme variable（`#14110D` 主背景、Source Serif 4 內文、JetBrains Mono metadata）。

---

## 3. 設計演進追溯

| 版本 | 日期 | 狀態 | 備註 |
|---|---|---|---|
| v1 | 2026-04-26 | Reviewed | 列表 / 分組 / filter 通關；缺 mobile / expanded / empty / loading |
| v2 | TBD | Pending | 套用 B1–B3 修改 + 補 C1–C4 缺漏 state |
