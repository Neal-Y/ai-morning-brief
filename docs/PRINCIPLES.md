# Working Principles

> **Status: Living doc.** Extracted from [decisions/2026-04-26-product-review.md](./decisions/2026-04-26-product-review.md) §「該被記下來的工作原則」 because these are reusable methodology, not a point-in-time product conclusion — the memo's own headline conclusion (quiz as a high-risk bet) was later overridden by events, but these 6 principles weren't part of that conclusion and still hold. Add to this list when a future retro produces another durable principle; don't bury it in a dated memo again.

---

## 1. 「這功能解決什麼痛點？」是必答題

不是修辭，是真的回答。如果答案是「使用者**可能**會喜歡」、「以後可能用得到」、「資料先存著」— **暫停**。

具體痛點長這樣：「我看過沒存的文章找不回，DB console 不方便」。
不具體痛點長這樣：「使用者讀完就忘」（這是研究結論，不是這位使用者今天的痛）。

## 2. 區分「使用者已表達的需求」 vs 「研究文獻說的需求」

「Hooked Model」「Active Recall」「Spaced Repetition」這些詞聽起來很對，但這些是研究結論，不是使用者今天親口說過的痛。**用研究背書 product 是行銷手段，不是設計決策依據**。

當下的使用者自己說的話，比一百篇論文重要。

## 3. 「Volume 6 個月後會怎樣」要先想

任何「累積資料」的功能在 MVP 就要決定怎麼瀏覽，否則就是延遲爆炸的炸彈。例：Library 6 個月 = 數千篇，沒搜尋／filter 就是廢頁；Quiz 若使用者真的持續答，題庫上千題後 schedule algorithm 會變成必要，不是 nice-to-have。

## 4. 「先量再優化」不是口號

**規則**：在量到「目前基線是 X」之前，不准規劃「優化到 Y」。Classifier preference v2、provider alternation 細節、prompt cache 微調——這些都屬於「還沒量過 baseline 就在規劃優化」的陷阱，遇到就先停。

## 5. 退場條件是 ship 的一部分

沒退場條件的功能會永遠在 codebase 裡長草。Ship 一個有風險/未驗證的功能時，同時寫下「什麼情況下會判定它沒用，然後怎麼處理」——即使後來實際發展沒照這個腳本走（見 Quiz 案例），寫下退場條件這個動作本身仍然是對的紀律。

## 6. 「沒做」也是設計決策

拒絕清單（Rejected features）跟做過的功能一樣值得記錄。下次覆盤時擴充這張表，不要抹掉——它記錄的是「為什麼不做」的判斷力，跟「做了什麼」一樣是這個專案的技術決策史。
