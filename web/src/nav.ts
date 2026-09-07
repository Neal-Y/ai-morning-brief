import { createContext, useContext } from 'react'

/** Height of the tappable nav row, excluding the bottom safe-area inset. */
export const NAV_ROW_H = 54

export type TabId = 'quiz' | 'feed' | 'library' | 'activity'

export interface TabDef {
  id: TabId
  path: string
  label: string
}

// Order mirrors the Sift app's bottom tabs. `/` stays Feed: it is the PWA
// start_url and where a push notification lands, and "今日簡報" is what that
// notification is about.
export const TABS: TabDef[] = [
  { id: 'quiz', path: '/quiz', label: '題目' },
  { id: 'feed', path: '/', label: '簡報' },
  { id: 'library', path: '/library', label: 'Library' },
  { id: 'activity', path: '/activity', label: '紀錄' },
]

export function tabForPath(path: string): TabId {
  return TABS.find(t => t.path === path)?.id ?? 'feed'
}

/**
 * Measured height of the bottom nav (row + bottom safe-area inset), published
 * by Shell. Pages use it to reserve space so content never hides under the nav.
 *
 * It is measured rather than computed because `env(safe-area-inset-bottom)`
 * is not readable as a number from JS, and `ArticleCard` needs a real px value
 * to decide whether the card body actually needs the reserve.
 */
export const NavInsetContext = createContext(0)

export function useNavInset(): number {
  return useContext(NavInsetContext)
}
