import 'dotenv/config'
import { db } from '../src/db/client.js'
import { getTaipeiDateString } from '../src/date.js'
import { articles } from '../src/db/schema.js'
import { createHash } from 'crypto'

const today = getTaipeiDateString()

const fakeArticles = [
  {
    url: 'https://example.com/article-1',
    title: 'Anthropic 發布 Claude 4 Opus：推理能力大幅提升',
    summary: 'Claude 4 Opus 在 AIME 2024 達到 90%，coding benchmark 超越 GPT-4o',
    context: 'Anthropic 本次升級聚焦在 extended thinking 深度，支援長達 100k token 的推理鏈。對需要複雜規劃的 agent 任務影響最大。',
    engineeringImpact: 'tool-use 的成功率提升 ~30%，agent loop 需要更新 retry budget',
    reason: '直接影響你的 LLM pipeline 成本結構',
    shortJudgment: null,
    categoryTag: '#model-release',
    skillTags: '["#agent"]',
    renderLevel: 'FULL' as const,
    recommendation: 'READ_NOW' as const,
    score: 92,
    source: 'TechCrunch',
  },
  {
    url: 'https://example.com/article-2',
    title: 'Cloudflare 推出 AI Gateway v2：支援 streaming cache',
    summary: 'AI Gateway 新增 semantic caching，對相似 prompt 的 cache hit rate 可達 60%',
    context: '原理是對 prompt 做 embedding，相似度超過閾值就直接回 cached response。latency P99 下降約 200ms。',
    engineeringImpact: '若 API cost 是瓶頸，semantic cache 是目前最低阻力的優化手段',
    reason: '你的 morning brief classifier 有大量重複結構的 prompt，命中率應該不低',
    shortJudgment: '[工具]：semantic cache now GA',
    categoryTag: '#infra',
    skillTags: '["#grpc", "#observability"]',
    renderLevel: 'LIGHT' as const,
    recommendation: 'SKIM' as const,
    score: 78,
    source: 'The New Stack',
  },
  {
    url: 'https://example.com/article-3',
    title: 'OpenAI 調整 API Rate Limits：免費 tier 大幅縮水',
    summary: 'GPT-4o mini 免費 tier 從 1M TPM 降至 200k TPM，生效日 2026-05-01',
    context: '官方說法是控制濫用，但社群反應激烈。paid tier 不受影響。',
    engineeringImpact: '如果你有 free tier 依賴，5/1 前要切到 paid 或換 Anthropic',
    reason: '有 deadline，5/1 前要決定',
    shortJudgment: '[政策]：免費 tier 砍 80%',
    categoryTag: '#api-platform',
    skillTags: '[]',
    renderLevel: 'LIGHT' as const,
    recommendation: 'SKIM' as const,
    score: 71,
    source: 'Hacker News',
  },
]

const rows = fakeArticles.map((a) => ({
  ...a,
  id: createHash('sha256').update(a.url).digest('hex').slice(0, 16),
  briefDate: today,
  classifiedAt: new Date(),
}))

await db.insert(articles).values(rows).onConflictDoUpdate({
  target: articles.url,
  set: { briefDate: today, classifiedAt: new Date() },
})
console.log(`Seeded ${rows.length} fake articles for ${today}`)
