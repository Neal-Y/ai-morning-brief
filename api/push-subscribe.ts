export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
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
          { type: 'execute', stmt: { sql: 'INSERT INTO push_subscriptions (endpoint, p256dh, auth, updated_at) VALUES (?, ?, ?, ?)', args: [{ type: 'text', value: endpoint }, { type: 'text', value: keys.p256dh }, { type: 'text', value: keys.auth }, { type: 'integer', value: String(Date.now()) }] } },
          { type: 'close' },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[push-subscribe] Turso error:', res.status, body)
      return new Response(JSON.stringify({ ok: false, error: `turso ${res.status}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('[push-subscribe] OK')
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[push-subscribe] Failed:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
