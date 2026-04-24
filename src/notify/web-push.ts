import webpush from 'web-push'
import { db } from '../db/client.js'
import { pushSubscriptions } from '../db/schema.js'

function isConfigured(): boolean {
  return !!(process.env['VAPID_SUBJECT'] && process.env['VAPID_PUBLIC_KEY'] && process.env['VAPID_PRIVATE_KEY'])
}

export async function sendWebPush(title: string, body: string): Promise<void> {
  if (!isConfigured()) {
    console.log('[web-push] VAPID keys not configured, skipping')
    return
  }

  webpush.setVapidDetails(
    process.env['VAPID_SUBJECT']!,
    process.env['VAPID_PUBLIC_KEY']!,
    process.env['VAPID_PRIVATE_KEY']!,
  )

  const subs = await db.select().from(pushSubscriptions)
  if (subs.length === 0) {
    console.log('[web-push] No subscriptions found, skipping')
    return
  }

  const payload = JSON.stringify({ title, body })
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    )
  )

  const ok = results.filter((r) => r.status === 'fulfilled').length
  const fail = results.filter((r) => r.status === 'rejected').length
  console.log(`[web-push] Sent ${ok}/${subs.length} subscriptions${fail > 0 ? ` (${fail} failed)` : ''}`)
}
