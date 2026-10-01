import webpush from 'web-push'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { pushSubscriptions } from '../db/schema.js'

function isConfigured(): boolean {
  return !!(process.env['VAPID_SUBJECT'] && process.env['VAPID_PUBLIC_KEY'] && process.env['VAPID_PRIVATE_KEY'])
}

/**
 * Send a Web Push notification.
 *
 * When deviceId is provided, only push subscriptions belonging to that device
 * are targeted (per-user mode). If no subscriptions exist for the device,
 * the call returns silently — the user may have revoked permission.
 *
 * Without deviceId, all subscriptions are targeted (global / fallback mode).
 * Throws if no subscriptions exist or all sends fail.
 */
export async function sendWebPush(
  title: string,
  body: string,
  deviceId?: string,
  /** Path the notification opens (sw.js notificationclick). Defaults to '/'. */
  url?: string,
): Promise<void> {
  if (!isConfigured()) {
    throw new Error('VAPID keys not configured')
  }

  webpush.setVapidDetails(
    process.env['VAPID_SUBJECT']!,
    process.env['VAPID_PUBLIC_KEY']!,
    process.env['VAPID_PRIVATE_KEY']!,
  )

  const subs = deviceId
    ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.deviceId, deviceId))
    : await db.select().from(pushSubscriptions)

  if (subs.length === 0) {
    if (deviceId) {
      console.log(`[web-push] No active subscription for device ${deviceId.slice(0, 8)}…, skipping`)
      return
    }
    throw new Error('No push subscriptions found')
  }

  const payload = JSON.stringify(url ? { title, body, url } : { title, body })
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    )
  )

  // 404/410 from the push service = the subscription is gone for good
  // (permission revoked, PWA removed, browser rotated the endpoint). Delete
  // those rows so they stop showing up as a failure on every run; anything
  // else (5xx, network) may be transient and is kept.
  const gone = subs.filter((_, i) => {
    const r = results[i]
    if (r?.status !== 'rejected') return false
    const code = (r.reason as { statusCode?: number } | undefined)?.statusCode
    return code === 404 || code === 410
  })
  if (gone.length > 0) {
    try {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone.map((s) => s.endpoint)))
      console.log(`[web-push] Removed ${gone.length} expired subscription(s)`)
    } catch (err) {
      console.warn('[web-push] Failed to remove expired subscriptions:', err instanceof Error ? err.message : err)
    }
  }

  const ok = results.filter((r) => r.status === 'fulfilled').length
  const fail = results.filter((r) => r.status === 'rejected').length
  const deviceTag = deviceId ? ` [device ${deviceId.slice(0, 8)}…]` : ''
  console.log(`[web-push]${deviceTag} Sent ${ok}/${subs.length} subscriptions${fail > 0 ? ` (${fail} failed)` : ''}`)

  if (ok === 0) {
    const firstFailure = results.find((r) => r.status === 'rejected')
    const reason = firstFailure?.status === 'rejected' ? firstFailure.reason : 'unknown error'
    throw new Error(`All push notifications failed${deviceTag}: ${reason instanceof Error ? reason.message : String(reason)}`)
  }
}
