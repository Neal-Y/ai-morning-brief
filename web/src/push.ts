function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0))) as Uint8Array<ArrayBuffer>
}

export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
}

/** Completes the push subscription assuming permission is already granted.
 *  Returns null on success, or an error string for debugging. */
export async function completeSubscription(): Promise<string | null> {
  if (!isPushSupported()) return 'push not supported'
  if (Notification.permission !== 'granted') return `permission: ${Notification.permission}`

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) return 'VAPID key missing'

  const t = <T>(p: Promise<T>, label: string): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), 10_000))])

  try {
    const reg = await t(navigator.serviceWorker.ready, 'sw.ready')
    const existing = await t(reg.pushManager.getSubscription(), 'getSubscription')
    const sub = existing ?? await t(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }),
      'subscribe'
    )
    const res = await t(
      fetch('/api/push-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) }),
      'fetch'
    )
    if (!res.ok) return `server ${res.status}`
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
