import webpush from 'web-push'
import { db } from '../db/client.js'
import { pushSubscriptions } from '../db/schema.js'

function isConfigured(): boolean {
  return !!(process.env['VAPID_SUBJECT'] && process.env['VAPID_PUBLIC_KEY'] && process.env['VAPID_PRIVATE_KEY'])
}

export async function sendWebPush(title: string, body: string): Promise<void> {
  if (!isConfigured()) {
    throw new Error('VAPID keys not configured')
  }

  webpush.setVapidDetails(
    process.env['VAPID_SUBJECT']!,
    process.env['VAPID_PUBLIC_KEY']!,
    process.env['VAPID_PRIVATE_KEY']!,
  )

  const subs = await db.select().from(pushSubscriptions)
  if (subs.length === 0) {
    throw new Error('No push subscriptions found')
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

  if (ok === 0) {
    const firstFailure = results.find((r) => r.status === 'rejected')
    const reason = firstFailure?.status === 'rejected' ? firstFailure.reason : 'unknown error'
    throw new Error(`All push notifications failed: ${reason instanceof Error ? reason.message : String(reason)}`)
  }
}
