import { describe, expect, it } from 'vitest'
import { applyFeedbackBoost } from './feedback-boost.js'
import type { ClassifiedArticle } from './ai/provider.js'
import type { FeedbackRow } from './db/client.js'

const article = (id: string, category: ClassifiedArticle['classification']['category'], score: number): ClassifiedArticle => ({
  title: id, link: id, pubDate: '', contentSnippet: '', source: 's', sourceTier: 'technical', score: 0,
  classification: { category, bucket: 'HARD_TECH_AI', renderLevel: 'FULL', recommendation: 'READ_NOW', score, summary: '', engineeringImpact: '', reason: '' },
})
const vote = (categoryTag: string, signal: 'up' | 'down'): FeedbackRow => ({ articleId: 'x', title: 'x', categoryTag, signal })

describe('applyFeedbackBoost', () => {
  it('matches stored display tags against classifier categories', () => {
    const [infra, policy] = applyFeedbackBoost(
      [article('a', 'infra-inference', 80), article('b', 'policy-regulation', 80)],
      [vote('#infra', 'up'), vote('#infra', 'up'), vote('#policy', 'down')],
    )
    expect(infra!.classification.score).toBe(81)
    expect(policy!.classification.score).toBe(79.5)
  })

  it('counts legacy #infra-inference rows from degraded briefs as #infra', () => {
    const [infra] = applyFeedbackBoost([article('a', 'infra-inference', 80)], [vote('#infra-inference', 'up')])
    expect(infra!.classification.score).toBe(80.5)
  })

  it('can reorder close candidates', () => {
    const boosted = applyFeedbackBoost(
      [article('tooling', 'tooling-open-source', 82), article('infra', 'infra-inference', 79)],
      Array.from({ length: 8 }, () => vote('#infra', 'up')),
    ).sort((x, y) => y.classification.score - x.classification.score)
    expect(boosted.map((a) => a.title)).toEqual(['infra', 'tooling'])
  })
})
