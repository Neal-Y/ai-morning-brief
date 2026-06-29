export const config = { runtime: 'edge' }

interface TursoPipelineItemResult {
  type: 'ok' | 'error'
  error?: { message: string }
}

interface TursoPipelineResponse {
  results: TursoPipelineItemResult[]
}

function tursoEnv(): { url: string; token: string } {
  const url = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
  const token = process.env['TURSO_AUTH_TOKEN'] ?? ''
  return { url, token }
}

async function tursoPipeline(requests: unknown[]): Promise<TursoPipelineResponse> {
  const { url, token } = tursoEnv()
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Turso pipeline HTTP ${res.status}: ${body}`)
  }
  const json = (await res.json()) as TursoPipelineResponse
  for (const item of json.results) {
    if (item.type === 'error') {
      throw new Error(`Turso pipeline item error: ${item.error?.message ?? 'unknown'}`)
    }
  }
  return json
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) return jsonResponse({ ok: false, error: 'missing_device_id' }, 400)

  let quizId: number
  let correct: boolean
  try {
    const body = (await req.json()) as { quizId?: unknown; correct?: unknown }
    if (typeof body.quizId !== 'number' || !Number.isInteger(body.quizId)) {
      return jsonResponse({ ok: false, error: 'invalid_quiz_id' }, 400)
    }
    if (typeof body.correct !== 'boolean') {
      return jsonResponse({ ok: false, error: 'invalid_correct' }, 400)
    }
    quizId = body.quizId
    correct = body.correct
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400)
  }

  try {
    const now = String(Math.floor(Date.now() / 1000))
    await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql: 'INSERT INTO quiz_attempts (quiz_id, device_id, correct, answered_at) VALUES (?, ?, ?, ?)',
          args: [
            { type: 'integer', value: String(quizId) },
            { type: 'text', value: deviceId },
            { type: 'integer', value: correct ? '1' : '0' },
            { type: 'integer', value: now },
          ],
        },
      },
    ])
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[quiz-attempt] Failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
