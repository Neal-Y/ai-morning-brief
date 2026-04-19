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
  publishedAgo: string
}

export interface RawArticle extends Omit<Article, 'skillTags' | 'publishedAgo'> {
  skillTags: string
  classifiedAt: number | string | null
}

export interface FeedResponse {
  date: string
  articles: RawArticle[]
}
