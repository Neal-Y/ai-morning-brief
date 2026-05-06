// Raw fetch wrapper around Notion REST API.
// Edge Runtime safe — no SDK, no Node-only deps.
// Notion-Version pinned to 2022-06-28 (long-term stable).

const NOTION_VERSION = '2022-06-28'
const NOTION_API_BASE = 'https://api.notion.com/v1'

// Notion rich_text content cap is 2000 chars per element. We chunk at 1900 to
// leave headroom for trailing punctuation / multi-byte safety.
const TEXT_CHUNK_LIMIT = 1900

export interface NotionArticleInput {
  id: string
  url: string
  title: string
  source: string | null
  categoryTag: string
  score: number
  briefDate: string
  summary: string
  context: string
  reason: string
  engineeringImpact: string
  shortJudgment: string | null
}

export interface CreateSavePageInput {
  article: NotionArticleInput
  userNote?: string | null
}

export interface CreateSavePageResult {
  pageId: string
}

export interface FindSavePageResult {
  pageId: string | null
}

function envOrThrow(): { apiKey: string; databaseId: string } {
  const apiKey = process.env['NOTION_API_KEY']
  const databaseId = process.env['NOTION_DATABASE_ID']
  if (!apiKey || !databaseId) {
    throw new Error('Notion env vars missing: NOTION_API_KEY and NOTION_DATABASE_ID required')
  }
  return { apiKey, databaseId }
}

function chunkText(text: string, limit = TEXT_CHUNK_LIMIT): string[] {
  if (!text) return []
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit))
  }
  return chunks
}

function paragraphBlocks(text: string): unknown[] {
  return chunkText(text).map(chunk => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: chunk } }],
    },
  }))
}

function headingBlock(text: string): unknown {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  }
}

function bookmarkBlock(url: string): unknown | null {
  if (!/^https?:\/\//i.test(url)) return null
  return {
    object: 'block',
    type: 'bookmark',
    bookmark: { url },
  }
}

function buildChildren(article: NotionArticleInput, userNote?: string | null): unknown[] {
  const children: unknown[] = []

  const sections: Array<[string, string | null | undefined]> = [
    ['Summary', article.summary],
    ['為什麼重要', article.reason],
    ['工程影響', article.engineeringImpact],
    ['Context', article.context],
    ['短評', article.shortJudgment],
    ['我的筆記', userNote],
  ]

  for (const [heading, body] of sections) {
    if (!body) continue
    children.push(headingBlock(heading))
    children.push(...paragraphBlocks(body))
  }

  const bookmark = bookmarkBlock(article.url)
  if (bookmark) children.push(bookmark)

  return children
}

function buildProperties(article: NotionArticleInput): Record<string, unknown> {
  // Notion rich_text with empty content is inconsistent — prefer empty array
  // when the source is missing, so the property reads as truly blank.
  const sourceRichText = article.source
    ? [{ type: 'text', text: { content: article.source } }]
    : []

  return {
    Title: {
      title: [{ type: 'text', text: { content: article.title } }],
    },
    URL: { url: article.url },
    Source: { rich_text: sourceRichText },
    Category: {
      select: { name: article.categoryTag },
    },
    Score: { number: article.score },
    'Brief Date': {
      date: { start: article.briefDate },
    },
    'Article ID': {
      rich_text: [{ type: 'text', text: { content: article.id } }],
    },
  }
}

export async function createSavePage(input: CreateSavePageInput): Promise<CreateSavePageResult> {
  const { apiKey, databaseId } = envOrThrow()
  const { article, userNote } = input

  const body = {
    parent: { database_id: databaseId },
    properties: buildProperties(article),
    children: buildChildren(article, userNote),
  }

  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Notion API error ${res.status}: ${text}`)
  }

  const json = (await res.json()) as { id?: string }
  if (!json.id) throw new Error('Notion API returned no page id')
  return { pageId: json.id }
}

export async function findSavePageByArticleId(articleId: string): Promise<FindSavePageResult> {
  const { apiKey, databaseId } = envOrThrow()

  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: 'Article ID',
        rich_text: { equals: articleId },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Notion query error ${res.status}: ${text}`)
  }

  const json = (await res.json()) as { results?: Array<{ id?: string }> }
  return { pageId: json.results?.[0]?.id ?? null }
}
