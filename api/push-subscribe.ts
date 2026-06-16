export const config = { runtime: 'edge' }

interface TursoPipelineItemResult {
  type: 'ok' | 'error'
  error?: { message: string }
}

interface TursoPipelineResponse {
  results: TursoPipelineItemResult[]
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

  try {
    const deviceId = req.headers.get('X-Device-Id')
    if (!deviceId) return jsonResponse({ ok: false }, 400)

    const { endpoint, keys } = (await req.json()) as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    const dbUrl = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
    const token = process.env['TURSO_AUTH_TOKEN'] ?? ''

    const res = await fetch(`${dbUrl}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [{ type: 'text', value: endpoint }] } },
          { type: 'execute', stmt: { sql: 'INSERT INTO push_subscriptions (endpoint, p256dh, auth, device_id, updated_at) VALUES (?, ?, ?, ?, ?)', args: [{ type: 'text', value: endpoint }, { type: 'text', value: keys.p256dh }, { type: 'text', value: keys.auth }, { type: 'text', value: deviceId }, { type: 'integer', value: String(Date.now()) }] } },
          { type: 'close' },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[push-subscribe] Turso error:', res.status, body)
      return jsonResponse({ ok: false }, 500)
    }

    const json = (await res.json()) as TursoPipelineResponse
    for (const item of json.results) {
      if (item.type === 'error') {
        throw new Error(`Turso pipeline item error: ${item.error?.message ?? 'unknown'}`)
      }
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[push-subscribe] Failed:', err)
    return jsonResponse({ ok: false }, 500)
  }
}
