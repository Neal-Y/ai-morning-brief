export const config = { runtime: 'edge' }

interface AskMessage {
  role: 'user' | 'assistant'
  content: string
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let body: {
    mode?: 'suggest'
    articleTitle: string
    articleSummary: string
    articleContext: string
    quiz?: QuizContext
    messages: AskMessage[]
  }
  try {
    body = await req.json()
  } catch {
    return jsonError('invalid_json', 400)
  }

  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) return jsonError('missing_device_id', 400)

  const { articleTitle, articleSummary, articleContext, messages } = body
  const suggestMode = body.mode === 'suggest'

  if ((!suggestMode && !Array.isArray(messages)) || typeof articleTitle !== 'string' || typeof articleSummary !== 'string') {
    return jsonError('invalid_input', 400)
  }
  const conversation = suggestMode ? [] : sanitizeMessages(messages)
  if (!suggestMode && conversation.length === 0) return jsonError('invalid_messages', 400)
  const quiz = parseQuiz(body.quiz)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return jsonError('ANTHROPIC_API_KEY not configured', 500)

  if (suggestMode) return suggest(apiKey, articleTitle, articleSummary, articleContext)

  const systemPrompt = `${quiz ? quizPreamble(quiz) : `你是一位後端工程師的技術顧問，正在協助用戶深入閱讀一篇技術文章。

文章：「${clip(articleTitle, 300)}」
摘要：${clip(articleSummary)}${articleContext ? `\n脈絡：${clip(articleContext)}` : ''}`}

請用繁體中文回答，聚焦工程實務視角，簡潔有力（150字以內）。
輸出要適合手機 bottom sheet 閱讀：
- 可以使用簡短 Markdown 小標題、粗體與條列。
- 不要使用 Markdown table、程式碼區塊或過長段落。
- 若比較多個方案，改用分段條列，不要用表格。`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      stream: true,
      system: systemPrompt,
      messages: conversation,
    }),
  })

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text()
    return new Response(JSON.stringify({ error: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ''
  // Only a stream that reaches message_stop is a complete answer. An error
  // event (overloaded, etc.) or a dropped connection ends with [ERROR], so the
  // client never saves half an answer as if it were the whole one.
  let stopped = false
  let failed = false

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          const event = JSON.parse(raw)
          if (event.type === 'message_stop') stopped = true
          if (event.type === 'error') {
            failed = true
            console.error('[ask] Upstream stream error:', JSON.stringify(event.error ?? event).slice(0, 300))
          }
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta' &&
            event.delta.text
          ) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.delta.text)}\n\n`))
          }
        } catch { /* skip */ }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode(stopped && !failed ? 'data: [DONE]\n\n' : 'data: [ERROR]\n\n'))
    },
  })

  return new Response(anthropicRes.body.pipeThrough(transform), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

interface QuizContext {
  prompt: string
  material: string
  answered: boolean
  correct?: boolean
  yourAnswer?: string
  correctAnswer?: string
  explanation?: string
}

const CORS = { 'Access-Control-Allow-Origin': '*' }

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// Bound the conversation sent upstream (input tokens are the cost driver): the
// most recent turns only, each clipped, valid roles only, starting with a user
// turn and ending on the question being asked.
export const MAX_ASK_MESSAGES = 20
const MAX_ASK_CONTENT = 4000

export function sanitizeMessages(raw: unknown): AskMessage[] {
  if (!Array.isArray(raw)) return []
  const valid = raw.flatMap((m): AskMessage[] => {
    if (!m || typeof m !== 'object') return []
    const { role, content } = m as Record<string, unknown>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return []
    return [{ role, content: content.slice(0, MAX_ASK_CONTENT) }]
  })
  const recent = valid.slice(-MAX_ASK_MESSAGES)
  while (recent.length > 0 && recent[0]!.role !== 'user') recent.shift()
  return recent.length > 0 && recent[recent.length - 1]!.role === 'user' ? recent : []
}

// Bound every client-supplied field: they all end up in the system prompt.
const clip = (v: unknown, max = 2000): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined

function parseQuiz(raw: unknown): QuizContext | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  const prompt = clip(q['prompt'])
  if (!prompt) return null
  return {
    prompt,
    material: clip(q['material']) ?? '',
    answered: q['answered'] === true,
    correct: q['correct'] === true,
    yourAnswer: clip(q['yourAnswer']),
    correctAnswer: clip(q['correctAnswer']),
    explanation: clip(q['explanation']),
  }
}

// Quiz follow-ups: before the user answers, the model only sees the question
// and answer-free material, and is told not to give the answer away.
function quizPreamble(q: QuizContext): string {
  const head = `你是後端 / infra 工程判斷力的家教，正在陪用戶討論一題練習題。

題目：${q.prompt}${q.material ? `\n${q.material}` : ''}`
  if (!q.answered) {
    return `${head}

用戶還沒作答。不要說出或暗示正確答案（包括排除法式地點名錯誤選項）；可以給提示、釐清題目在考的觀念、引導用戶自己推理。如果用戶直接要答案，請他先作答。`
  }
  return `${head}

用戶已作答，${q.correct ? '答對了' : '答錯了'}。
用戶的答案：
${q.yourAnswer ?? '（未提供）'}
正確答案：
${q.correctAnswer ?? '（未提供）'}${q.explanation ? `\n官方解說：${q.explanation}` : ''}

${q.correct ? '幫用戶把觀念延伸到實務與邊界情況。' : '先精準指出用戶的答案錯在哪個觀念，再說明正確答案為什麼對。'}`
}

// Three follow-up questions tailored to one article, for the Ask sheet's
// suggestion chips. Non-streaming and small; the client caches the result per
// article, so this runs at most once per article per device.
async function suggest(apiKey: string, title: string, summary: string, context: string | undefined): Promise<Response> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `你幫一位後端工程師想「讀完這篇文章後最值得追問的問題」。
要求：
- 3 個問題，繁體中文，每個 30 字以內，用第一人稱問（例如「這對我的 API gateway 有什麼影響？」）。
- 必須針對這篇文章的具體內容，不要問放諸四海皆準的通用問題；只有文章真的在比較方案時才問 trade-off。
- 只輸出 JSON 字串陣列，例如 ["問題一","問題二","問題三"]，不要任何其他文字。`,
      messages: [{
        role: 'user',
        content: `文章：「${clip(title, 300)}」\n摘要：${clip(summary, 1200) ?? ''}${context ? `\n脈絡：${clip(context, 1200)}` : ''}`,
      }],
    }),
  })
  if (!res.ok) return jsonError('upstream_error', 502)

  const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find((b) => b.type === 'text')?.text ?? ''
  let suggestions: string[] = []
  try {
    const parsed: unknown = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))
    if (Array.isArray(parsed)) {
      suggestions = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 3)
    }
  } catch {
    // fall through to the empty-list error below
  }
  if (suggestions.length === 0) return jsonError('no_suggestions', 502)

  return new Response(JSON.stringify({ suggestions }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
