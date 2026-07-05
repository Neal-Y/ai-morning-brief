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

  let body: { articleTitle: string; articleSummary: string; articleContext: string; messages: AskMessage[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_device_id' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const { articleTitle, articleSummary, articleContext, messages } = body

  if (!Array.isArray(messages) || typeof articleTitle !== 'string' || typeof articleSummary !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_input' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const systemPrompt = `你是一位後端工程師的技術顧問，正在協助用戶深入閱讀一篇技術文章。

文章：「${articleTitle}」
摘要：${articleSummary}${articleContext ? `\n脈絡：${articleContext}` : ''}

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
      messages,
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
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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
