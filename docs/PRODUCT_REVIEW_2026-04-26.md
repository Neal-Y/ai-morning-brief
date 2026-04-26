# 產品覆盤 — 2026-04-26

> 一次刻意停下來的反思：在 F4 Notion 整合 ship 之後、F5 quiz 開工之前，先回頭問「**這產品到底要幹嘛、哪些功能其實是工程師自嗨**」。
>
> 寫這份文件是因為這次討論本身比結論更值錢。下次再覺得自己「幹勁滿滿一直 ship」的時候，先回來讀一次。

---

## 觸發點

當天下午剛把兩個 bug 修完（Notion DB ID、`/api/feedback` Edge migration）。下意識想直接接 F5 quiz。停下來先問了一句「Notion 真的有用嗎？這產品到底要解決什麼？」結論是：roadmap 排序錯了。

---

## 核心觀察

### 1. 產品在拉扯兩個不同的願景

| 願景 | 在做什麼 | 成功指標 | 對應 |
|---|---|---|---|
| **A. 每日 AI 新聞替代品** | 取代早上滑 Twitter/HN 的時間 | 開啟率、滑完率 | V1 已 ship |
| **B. AI 學習系統** | 把新聞變成記得住的知識（Anki for AI） | 留存率、quiz 答對率 | V2 規劃中 |

這是兩個不同產品。一個是 Substack。一個是 Anki。**我沒在心裡決定哪個是主軸**，所以 roadmap 兩邊都在蓋，最後可能哪個都沒在用。

### 2. 功能價值分級

**真正養家活口（核心）：**
- 每日推播 + top 3 brief — 沒這個產品就不存在
- Classifier 評分篩選 — 「選對」是跟 RSS reader 的差別
- 👍👎 個人化 — 載荷重，**但今天才真正開始寫進 DB**（feedback 504 才修好），實際對 brief 品質的影響還沒被驗證

**Saves / 收藏 — 必要：**
- 滑過想記得的東西總要有地方放

**Nice-to-have（拿掉產品還能跑）：**
- Streak 連續天數 — 純遊戲化
- Celebration 動畫 — 純體驗點綴
- 追問 (Ask SSE streaming) — 不確定使用者多常真的用，是「習慣養成」feature
- Skill tags（規劃中）— 沒有對應 UI／使用情境，是「先存著等以後用」的資料 infra
- Quiz / morning recall — **未驗證的賭注**。預設使用者願意主動測驗自己，這是高風險假設

**純技術自嗨（誠實說）：**
- Provider alternation（GPT/Claude 奇偶日輪替）— 沒人在乎，挑最好的一家就好
- 「所有 POST 都搬 Edge」絕對戒律 — 被一個 bug 嚇到後過度推廣的規則
- Web Push 從零自幹（VAPID + iOS standalone gymnastics）— 5 輪 debug，FRONTEND_FIX_LOG 很長
- 偏好 v2 規劃（exploration slot、時間衰減權重）— 連基本指標都還沒量過就在想 v2，**典型過早優化**
- Prompt cache prefix engineering — 絕對省的錢很少，認知負擔很大

### 3. Notion 整合的真實理由

審視 Notion 帶來的「**獨家**價值」：

| 是否替代不了 | 原因 |
|---|---|
| ❌ app 外可瀏覽／搜尋 saves | PWA 自己加 saves 頁就解決 |
| ❌ 加長文筆記 | DB 加 `user_note` + textarea 也行 |
| ✅ **接你既有的 Notion PKM 工作流** | 不可替代 — 因為 Notion 已經是個人知識中心 |

Notion 的真實價值是 **#3**：把 saves 接到既有的 PKM，不是再建一個孤島。

**警訊：** 如果接下來 30 天都沒去 Notion 翻過 Sift Saves 一次，那它就是 nice-to-have 中的 nice-to-have，蓋好擺著沒人看。設一個觀察期。

### 4. Quiz 是賭注，不是顯然的下一步

V2_DESIGN.md 的「F5 收藏時生成 quiz」原本是按優先序的下一個。但這建立在一個未驗證的假設上：

> 使用者願意每天打開 app 先答 1-2 題遮答案的卡。

研究數據有 80% retention 沒錯，**但前提是使用者真的去答題**。Anki user 都知道：大部分人試一週就放棄。在還沒有證據顯示自己會堅持的情況下，先蓋 quiz infrastructure 是高風險投資。

---

## 真正的「第三格」答案

V1 + saves（含 Notion）已經是兩格穩固支柱。**第三格**最應該是什麼？

當天討論導出的新答案：**Library / 歷史頁面**。

理由比 quiz 紮實：

| 比較點 | Quiz | Library |
|---|---|---|
| 需求是否已存在 | 假設使用者會主動答題 | 使用者**已經**問過「我看過沒存的怎麼回得去」 |
| LLM 投資回收 | 間接（產生 QA pair） | 直接（每日生的 summary/context/engineeringImpact 變成可瀏覽資產） |
| 退場成本 | 蓋了沒人答就是廢功能 | 蓋了當下就有用，volume 越大越值錢 |
| 是否前置其他功能 | 獨立功能 | **是 quiz 的前置** — 沒 history，quiz 就是孤島 |

新的三大支柱：

1. **每日推播 + 篩選**（V1 核心，已 ship）
2. **Library**：history + saves 統一介面（同一頁兩個 tab／filter）— Notion 是 Library 的 cold storage extension
3. **Retention layer**（quiz / recall）— 蓋在 Library 上的再訪機制，不是獨立功能

Quiz 仍然會做，但作為 Library 的一個 view，不是獨立 product line。

---

## 該被記下來的工作原則

提取這次討論可以反覆使用的原則，下次手癢想 ship 之前回來看一眼：

### 1. 「這功能解決什麼痛點？」是必答題

不是修辭，是真的回答。如果答案是「使用者**可能**會喜歡」、「以後可能用得到」、「資料先存著」— **暫停**。

具體痛點長這樣：「我看過沒存的文章找不回，DB console 不方便」。
不具體痛點長這樣：「使用者讀完就忘」（這是研究結論，不是這位使用者今天的痛）。

### 2. 區分「使用者已表達的需求」 vs 「研究文獻說的需求」

V2_DESIGN.md 寫了「Hooked Model」「Active Recall」「Spaced Repetition」這些詞，聽起來很對。但這些是研究結論，不是這位使用者今天親口說過的痛。**用研究背書 product 是行銷手段，不是設計決策依據**。

當下的使用者自己說的話，比一百篇論文重要。

### 3. 「Volume 6 個月後會怎樣」要先想

Library 6 個月 = 5400 篇。沒搜尋／filter 就是廢頁。
Saves 6 個月 = 大概 200-300 篇。Notion search 救得起來。
Quiz 6 個月 = 如果使用者真的答 = 上千題，schedule algorithm 變成必要。

**任何「累積資料」的功能在 MVP 就要決定怎麼瀏覽**，否則就是延遲爆炸的炸彈。

### 4. 「先量再優化」不是口號

Classifier preference v2、provider alternation、prompt cache 細節 — 這些「優化」都在還沒量過 baseline 的情況下被規劃。

**規則**：在量到「目前基線是 X」之前，不准規劃「優化到 Y」。

### 5. 退場條件是 ship 的一部分

Quiz 還是要做，但配條退場條件：「2 週後若連續 7 天沒答，砍掉。」
Notion 已經 ship，配個觀察期：「30 天若沒回 Notion 翻過一次 Sift Saves，重新評估是不是該存留。」

沒退場條件的功能會永遠在 codebase 裡長草。

### 6. 「沒做」也是設計決策

V2_DESIGN.md 的 Rejected 表（DALL-E cover image / iOS native widget / knowledge graph）是當時做得對的事。今天的覆盤應該擴充這個表，不是抹掉。

---

## 給未來自己的話

> 你下次又想 ship 什麼之前，先打開這份文件，問自己：
>
> 1. 這個功能解決哪個**今天的我**已經抱怨過的痛？
> 2. 還是只是**未來的我可能會用**？
> 3. 還是只是**這個技術很有趣**？
>
> 答案是 (1) 才繼續寫 code。(2) 寫進 backlog 等真的痛起來再做。(3) 開個 side branch 玩一晚就好，不要進主 roadmap。

---

## 連帶決策（這次討論衍生）

- ✅ 通知文案重設計（移除 "from Sift" 冗餘行、`/` → `·`、用釋出空間放 lead 文章的 `engineeringImpact`）→ 已實作，見當日 commit
- ✅ Library 頁面設計提案 → 見 [LIBRARY_PROPOSAL.md](./LIBRARY_PROPOSAL.md)
- ✅ V2_DESIGN.md 重新排序：Library 升為第三支柱、Quiz 降為 Retention layer
- ⏳ Notion 觀察期：2026-05-26 回看是否有真的回去翻 Sift Saves
