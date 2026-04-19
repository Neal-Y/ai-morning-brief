// Sample data mirrors the V1/V2 classifier output shape
// 3 cards + quiz + recall cards (3 days ago)

const TODAY_CARDS = [
  {
    id: 'c1',
    index: 1,
    renderLevel: 'FULL',
    categoryTag: '#model-release',
    skillTags: ['#anthropic', '#reasoning', '#agent'],
    source: 'TechCrunch',
    sourceTier: 'broad',
    publishedAgo: '3h',
    title: 'Anthropic 發布 Claude 4 Opus：推理能力大幅提升',
    summary: 'Claude 4 Opus 在 AIME 2024 達到 90%，coding benchmark 超越 GPT-4o。',
    context:
      'Anthropic 本次升級聚焦在 extended thinking 深度，支援長達 100k token 的推理鏈，針對複雜規劃類的 agent 任務影響最大。',
    engineeringImpact:
      'tool-use 的成功率提升 ~30%，agent loop 需要更新 retry budget；長推理鏈代表 context window 成本顯著拉高，要重估 pricing 模型。',
    reason: '直接影響你的 LLM pipeline 成本結構',
    url: 'https://techcrunch.com/...',
    shortJudgment: null,
    score: 94,
  },
  {
    id: 'c2',
    index: 2,
    renderLevel: 'FULL',
    categoryTag: '#infra',
    skillTags: ['#grpc', '#distributed-systems', '#observability'],
    source: 'The New Stack',
    sourceTier: 'technical',
    publishedAgo: '6h',
    title: 'gRPC-Web 正式支援 server-side streaming：前端可直收事件流',
    summary: 'Envoy 1.31 加入原生支援，從瀏覽器直接 consume gRPC streaming 不再需要代理層。',
    context:
      '過去 gRPC-Web 只能單向 request/response。新版允許 server push，配合 protobuf schema 天然 type-safe，是 SSE 之外的另一條路。',
    engineeringImpact:
      '可以把現有 SSE 端點改 gRPC-Web streaming，保留型別安全；但 Envoy 要升版且 CORS policy 要重設，現有 fallback 得保留 ≥ 6 個月。',
    reason: '你 V2 的 SSE 端點可直接受影響',
    url: 'https://thenewstack.io/...',
    shortJudgment: null,
    score: 82,
  },
  {
    id: 'c3',
    index: 3,
    renderLevel: 'LIGHT',
    categoryTag: '#market',
    skillTags: ['#funding'],
    source: 'The Verge',
    sourceTier: 'broad',
    publishedAgo: '11h',
    title: 'OpenAI 完成 $40B 融資，估值達 $300B',
    summary: '本輪由 SoftBank 領投，資金主要投入 Stargate 算力建設。',
    context:
      '這輪投資加速了北美 AI infra 競賽，短期內 inference pricing 不會鬆動，但長期供給增加有機會壓低 API 成本。',
    engineeringImpact:
      '短期 API pricing 不變；但 Anthropic / Google 為了競爭可能加快 caching / batching 優惠，值得年底重新議價。',
    reason: '供應鏈信號，影響明年預算',
    shortJudgment: '市場信號：$40B 入場',
    url: 'https://theverge.com/...',
    score: 68,
  },
];

// Quiz card (shown before today's feed, 3 days ago's article)
const RECALL_QUIZ = {
  id: 'q1',
  articleTitle: 'PostgreSQL 17 推出 incremental backup',
  daysAgo: 3,
  question: 'PG 17 的 incremental backup 相比 pg_basebackup 最大的差異是什麼？',
  options: [
    { id: 'a', text: '只備份自上次 backup 以來變動的 WAL segments', correct: true },
    { id: 'b', text: '備份速度提升 10 倍但需要額外 plugin' },
    { id: 'c', text: '不再需要 archive_mode = on' },
    { id: 'd', text: '自動壓縮備份檔案體積減少 70%' },
  ],
  explanation:
    'incremental backup 依賴 WAL summarizer track 變動的 block，重啟 base backup 只需要少量磁碟 I/O。',
};

const STREAK_DATA = {
  current: 14,
  best: 23,
  lastReadAgo: '17h',
  readMinutesToday: 0, // updated after read
  savedToday: 0,
  weeklyArticles: 18,
  topTagsThisWeek: [
    { tag: '#infra', count: 7 },
    { tag: '#model-release', count: 5 },
    { tag: '#agent', count: 3 },
  ],
};

Object.assign(window, { TODAY_CARDS, RECALL_QUIZ, STREAK_DATA });
