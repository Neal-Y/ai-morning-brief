# AI Morning Brief — Full Specification

## 1. 專案願景

建構一個每日自動執行的技術情報系統。固定從權威科技媒體 (RSS) 抓取 AI 相關新聞，篩選過去 24 小時內最值得看的 2-3 篇，交給 LLM 以「資深後端架構師」視角做分析，最後透過 ntfy 推播到手機。

核心價值不是轉貼新聞，而是回答：

- 這則新聞對後端系統設計有沒有影響
- 對分散式架構、併發模型、資料庫設計有沒有啟發
- 對 Golang 生態、infra 選型、服務拆分有沒有實際意義
- 值不值得今天花時間深入讀原文

---

## 2. 技術堆疊

| Layer        | Choice                          | Reason                         |
| ------------ | ------------------------------- | ------------------------------ |
| Language     | TypeScript (strict)             | 型別安全 + GitHub Actions 原生 |
| Runtime      | Node.js 20+                     | LTS + Actions 預裝             |
| RSS Parser   | `rss-parser`                    | 穩定、零依賴                   |
| Notification | ntfy (HTTP POST)                | 零成本、Markdown、Actions      |
| AI Engine    | Provider Pattern (見 §4)       | 免費額度切換                   |
| CI/CD        | GitHub Actions cron             | 免費、免 infra                 |

---

## 3. Execution Flow

```
┌─────────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────┐
│  RSS Ingest │ ──▶ │  Filter  │ ──▶ │ LLM Analyze │ ──▶ │   ntfy   │
│ (3 sources) │     │ (24h+rank)│     │ (architect) │     │  (push)  │
└─────────────┘     └──────────┘     └─────────────┘     └──────────┘
```

### 3.1 Ingestion

RSS 來源（固定三個，未來可擴充）：

1. **TechCrunch AI** — `https://techcrunch.com/category/artificial-intelligence/feed/`
2. **The Verge AI** — `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml`
3. **MIT Technology Review** — `https://www.technologyreview.com/feed/`

要求：
- 每個來源獨立 try/catch，一個掛掉不影響其他。
- 解析出 title、link、pubDate、contentSnippet。

### 3.2 Filter

1. 過濾條件：`pubDate` 在過去 24 小時內。
2. 排序邏輯：簡單 keyword scoring（權重：AI, LLM, GPU, infrastructure, database, distributed, cloud > 一般關鍵字）。
3. 取 top 2-3 篇。
4. 若 24h 內無文章，推播「今日無重大 AI 新聞」並正常結束。

### 3.3 LLM Analysis

#### Provider Interface

```typescript
interface AIProvider {
  name: string;
  generateInsight(articles: ArticleSummary[]): Promise<AnalysisResult>;
}

interface ArticleSummary {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

interface AnalysisResult {
  briefings: ArticleBriefing[];
}

interface ArticleBriefing {
  title: string;
  link: string;
  summary: string;        // ≤30 字極簡摘要
  insight: string;         // 技術洞察（分散式/Go/infra 角度）
  worthReading: boolean;   // 值不值得花時間讀原文
  relevanceTag: string;    // e.g. "分散式架構", "LLM Infra", "Golang"
}
```

#### System Prompt（所有 Provider 共用）

```
你是一位有 10 年經驗的後端架構師，專精分散式系統、Golang、資料庫設計。
你的任務是幫另一位後端工程師做每日技術情報摘要。

對於每篇文章，請提供：
1. 極簡摘要（30字以內，用繁體中文）
2. 技術洞察（這對後端/分散式/Go生態有什麼影響？具體一點。若無直接關聯，說明為何工程師仍該關注）
3. 是否值得花時間讀原文（true/false + 一句話理由）
4. 關聯標籤（分散式架構 / LLM Infra / Golang / 資料庫 / DevOps / 通用）

輸出格式：JSON，符合 AnalysisResult schema。不要輸出 markdown code fence。
```

#### Provider 優先級

1. **Gemini** (`gemini-2.0-flash`) — 預設，免費層級足夠日用量。
2. **OpenAI** (`gpt-4o-mini`) — 備選。
3. **Anthropic** (`claude-sonnet-4-20250514`) — 備選。

透過 `AI_PROVIDER` env var 切換。

### 3.4 Delivery (ntfy)

HTTP POST to `https://ntfy.sh/{NTFY_TOPIC}`

Headers:
```
Title: 🤖 AI 晨報 — {date}
Tags: robot,brain
Markdown: yes
Click: {first_article_link}
```

Body 格式（Markdown）：

```markdown
## 📰 AI 晨報 {YYYY-MM-DD}

---

### 1. {article_title}
📌 {summary}
🔍 **洞察**: {insight}
📖 值得讀: {worthReading ? "✅ 值得" : "⏭️ 跳過"} — {reason}
🏷️ #{relevanceTag}
🔗 [原文]({link})

---

### 2. ...

---

> 🛠️ Powered by AI Morning Brief | Provider: {provider_name}
```

---

## 4. 程式碼結構

```
ai-morning-brief/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── docs/
│   └── PROPOSAL.md          ← this file
├── src/
│   ├── index.ts              # main orchestrator
│   ├── config.ts             # env loading, RSS sources, constants
│   ├── rss/
│   │   └── feed.ts           # fetch + parse + 24h filter
│   ├── ai/
│   │   ├── provider.ts       # AIProvider interface + types
│   │   ├── gemini.ts         # Gemini implementation
│   │   ├── openai.ts         # OpenAI implementation
│   │   └── anthropic.ts      # Anthropic implementation
│   └── notify/
│       └── ntfy.ts           # format message + POST
└── .github/
    └── workflows/
        └── daily_sync.yml    # cron: 台灣 07:30 = UTC 23:30 前一天
```

---

## 5. GitHub Actions Workflow

```yaml
name: AI Morning Brief

on:
  schedule:
    # 台灣時間 07:30 = UTC 23:30 (前一天)
    - cron: '30 23 * * *'
  workflow_dispatch: # 手動觸發用於測試

jobs:
  brief:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run start
        env:
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
          AI_PROVIDER: ${{ secrets.AI_PROVIDER }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## 6. Error Handling 規範

| Scenario                  | Behavior                                     |
| ------------------------- | -------------------------------------------- |
| 單一 RSS 來源 timeout     | log warning, 繼續處理其他來源               |
| 全部 RSS 來源失敗         | 推播錯誤通知到 ntfy，exit 0（不讓 Actions 紅）|
| AI API rate limit / error | retry 1 次 (delay 5s)，仍失敗則推播原始摘要 |
| ntfy 推播失敗             | log error, exit 1（這是最終輸出，需要被注意）|
| 24h 內無文章              | 推播「今日無重大 AI 新聞」，exit 0          |

---

## 7. Future Enhancements（不在 MVP 範圍）

- [ ] 增加 RSS 來源（Hacker News, ArXiv, InfoQ）
- [ ] 歷史記錄存 GitHub Gist 或 SQLite
- [ ] 使用者偏好設定（關注領域權重）
- [ ] 多語言支援
- [ ] Web dashboard 查看歷史晨報
