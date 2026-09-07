import { THEME_DARK } from '../../theme.ts'

/**
 * Quiz-only surfaces, derived from the PWA dark theme.
 *
 * These live here rather than in theme.ts on purpose: `web/src/theme.ts` is the
 * authoritative palette for the product, and the quiz must adopt it rather than
 * the other way round. Only neutral surfaces and one missing tint are added —
 * accent / positive / negative come straight from the theme.
 */
export const Q = {
  correct: THEME_DARK.positive,
  correctTint: THEME_DARK.positiveSoft,
  wrong: THEME_DARK.negative,
  wrongTint: '#3A2020',      // theme has `negative` but no soft counterpart
  track: '#2A2520',          // unfilled progress dash
  letterBg: '#262119',       // A/B/C/D and slot badges
  letterText: THEME_DARK.inkMuted,
  lift: '#2C2620',           // "picked up" surface for a selected row
  onSolid: '#FFFFFF',
} as const

/** XP per outcome — same economy as the Sift app. */
export const XP = { correct: 20, wrong: 5 } as const

export const RADIUS = { pill: 999, card: 14, option: 12, button: 12 } as const
