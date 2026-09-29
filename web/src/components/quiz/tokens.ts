import { THEME_DARK } from '../../theme.ts'

/**
 * Quiz-only surfaces, derived from the PWA theme (`web/src/theme.ts` stays the
 * authoritative palette; the quiz adopts it, not the other way round).
 */
export const Q = {
  correct: THEME_DARK.positive,
  correctTint: THEME_DARK.positiveSoft,
  wrong: THEME_DARK.negative,
  wrongTint: THEME_DARK.negativeSoft,
  track: 'rgba(160,190,220,0.14)',  // unfilled progress dash
  letterBg: THEME_DARK.raised,        // A/B/C/D and slot badges
  letterText: THEME_DARK.inkMuted,
  lift: '#22303E',                    // "picked up" surface for a selected row
  // Text on a solid correct/wrong fill. Dark, not white: both semantic colours
  // are bright on this palette and white on them fails contrast.
  onSolid: THEME_DARK.bg,
} as const

/** XP per outcome — same economy as the Sift app. */
export const XP = { correct: 20, wrong: 5 } as const

export const RADIUS = { pill: 999, card: 18, option: 16, button: 18 } as const
