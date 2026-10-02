import { describe, expect, it, vi } from 'vitest'
import { alignBriefWithSources, buildDegradedBrief, generateBrief } from './brief.js'
import { displayTag } from './categories.js'
import type { AIProvider, ClassifiedArticle, BriefItem } from './provider.js'

vi.mock('../config.js', () => ({ RETRY_DELAY_MS: 0 }))

function article(n: number, category: ClassifiedArticle['classification']['category'], bucket: ClassifiedArticle['classification']['bucket'] = 'HARD_TECH_AI'): ClassifiedArticle {
  return {
    title: `Source title ${n} "quoted"`, link: `https://example.com/${n}`, pubDate: '', contentSnippet: 'snippet',
    source: 'Example', sourceTier: 'primary', score: 1,
    classification: {
      category, bucket, renderLevel: 'FULL', recommendation: 'READ_NOW', score: 80,
      summary: `摘要 ${n}`, engineeringImpact: `影響 ${n}`, reason: `理由 ${n}`,
    },
  }
}

function item(overrides: Partial<BriefItem>): BriefItem {
  return {
    index: 1, renderLevel: 'LIGHT', title: 'LLM title', summary: 's', context: 'c', engineeringImpact: 'e',
    recommendation: 'SKIM', reason: 'r', shortJudgment: null, categoryTag: '#whatever', url: '', ...overrides,
  }
}

describe('displayTag', () => {
  it('maps categories and legacy stored tags to one display tag', () => {
    expect(displayTag('infra-inference')).toBe('#infra')
    expect(displayTag('#infra-inference')).toBe('#infra')
    expect(displayTag('#infra')).toBe('#infra')
    expect(displayTag('event-promo')).toBe('#market')
    expect(displayTag('#something-new')).toBe('#something-new')
  })
})

describe('alignBriefWithSources', () => {
  const articles = [article(1, 'infra-inference'), article(2, 'policy-regulation', 'IMPORTANT_AI_SIGNALS')]

  it('takes url, title, tag and render level from the source article', () => {
    const brief = alignBriefWithSources({
      title: 't',
      sections: [{ name: 'Hard Tech AI', items: [item({ index: 1, url: 'https://example.com/1/' })] },
        { name: 'Important AI Signals', items: [item({ index: 2, url: 'https://example.com/2' })] }],
    }, articles, '2026-10-02')

    const [first] = brief.sections[0]!.items
    expect(first).toMatchObject({
      url: 'https://example.com/1', title: 'Source title 1 "quoted"', categoryTag: '#infra', renderLevel: 'FULL', summary: 's',
    })
    expect(brief.sections[1]!.items[0]).toMatchObject({ url: 'https://example.com/2', categoryTag: '#policy' })
  })

  it('drops items that match nothing and backfills skipped articles', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const brief = alignBriefWithSources({
      title: 't',
      sections: [{ name: 'Hard Tech AI', items: [
        item({ index: 1, url: 'https://example.com/1' }),
        item({ index: 9, url: 'https://elsewhere.example/x' }),
      ] }],
    }, articles, '2026-10-02')

    const urls = brief.sections.flatMap((s) => s.items.map((i) => i.url))
    expect(urls).toEqual(['https://example.com/1', 'https://example.com/2'])
    expect(brief.sections.find((s) => s.name === 'Important AI Signals')!.items[0]).toMatchObject({
      summary: '摘要 2', context: '', categoryTag: '#policy',
    })
    warn.mockRestore()
  })
})

describe('generateBrief', () => {
  it('survives an unescaped quote in the generator output', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const raw = '{"title":"AI Morning Brief","sections":[{"name":"Hard Tech AI","items":[{"index":1,"renderLevel":"FULL","summary":"Cloudflare 推出 "Auto Router"","context":"c","categoryTag":"#infra","engineeringImpact":"e","recommendation":"READ_NOW","reason":"r","shortJudgment":null,"url":"https://example.com/1"}]}]}'
    const provider: AIProvider = { name: 'fake', call: vi.fn().mockResolvedValue(raw), logUsageSummary: () => {} }
    const brief = await generateBrief(provider, [article(1, 'infra-inference')], '2026-10-02')

    expect(provider.call).toHaveBeenCalledOnce()
    expect(brief.sections[0]!.items[0]).toMatchObject({ summary: 'Cloudflare 推出 "Auto Router"', context: 'c' })
    warn.mockRestore()
  })

  it('logs the full unparseable output before giving up', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const provider: AIProvider = { name: 'fake', call: vi.fn().mockResolvedValue('{"sections": [oops'), logUsageSummary: () => {} }

    await expect(generateBrief(provider, [article(1, 'infra-inference')], '2026-10-02')).rejects.toThrow(/invalid JSON/)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('{"sections": [oops'))
    vi.restoreAllMocks()
  })
})

describe('buildDegradedBrief', () => {
  it('uses display tags like the normal brief', () => {
    const brief = buildDegradedBrief([article(1, 'tooling-open-source')], '2026-10-02')
    expect(brief.sections[0]!.items[0]!.categoryTag).toBe('#tooling')
  })
})
