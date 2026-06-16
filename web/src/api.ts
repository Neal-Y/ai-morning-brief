import { getDeviceId } from './device'

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('X-Device-Id', getDeviceId())
  return fetch(url, { ...init, headers })
}
