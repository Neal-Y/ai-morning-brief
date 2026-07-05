export const CATEGORY_LABELS: Record<string, string> = {
  'model-release': 'MODEL RELEASE',
  'api-platform': 'API · PLATFORM',
  'infra-inference': 'INFRA · INFERENCE',
  'tooling-open-source': 'TOOLING',
  'benchmark-eval': 'BENCHMARK',
  'agent-systems': 'AGENT SYSTEMS',
  'policy-regulation': 'POLICY · REGULATION',
  'company-market': 'COMPANY · MARKET',
  'research-adjacent': 'RESEARCH',
}

export interface Article {
  id: string
  url: string
  title: string
  summary: string
  context: string
  engineeringImpact: string
  reason: string
  shortJudgment: string | null
  categoryTag: string
  skillTags: string[]
  renderLevel: 'FULL' | 'LIGHT' | 'OMIT'
  recommendation: 'READ_NOW' | 'SKIM' | 'SKIP'
  score: number
  source: string | null
  briefDate: string
}

export interface RawArticle extends Omit<Article, 'skillTags'> {
  skillTags: string
  classifiedAt: number | string | null
}

export interface FeedResponse {
  date: string
  articles: RawArticle[]
}
