/**
 * "Signal" palette (2026-09-29): the app icon's ink navy + amber, carried into
 * the whole UI. Materials: raised tonal surfaces, rounded cards, frosted-glass
 * chrome (bottom nav + feedback dock). This file is the single source of truth;
 * `components/quiz/tokens.ts` and `app/src/theme.ts` derive from it.
 *
 * `bg` must stay in sync with `theme-color` in index.html and
 * `theme_color` / `background_color` in public/manifest.json and the
 * html/body background in index.css (FRONTEND_FIX_LOG Issue 14).
 */
export interface Theme {
  bg: string; bgDeep: string; card: string; raised: string
  ink: string; inkMuted: string; inkFaint: string
  rule: string; ruleSoft: string
  accent: string; accentSoft: string; onAccent: string
  positive: string; positiveSoft: string; negative: string; negativeSoft: string
  glass: string; glassEdge: string; highlight: string
  serif: string; sans: string; mono: string
}

export const THEME_DARK: Theme = {
  bg:          '#0B121A',
  bgDeep:      '#070C12',
  card:        '#131C26',
  raised:      '#1A2531',
  ink:         '#EAF0F6',
  inkMuted:    '#9AA8B8',
  inkFaint:    '#7C8CA0',
  rule:        'rgba(160,190,220,0.22)',
  ruleSoft:    'rgba(160,190,220,0.12)',
  accent:      '#F5A524',
  accentSoft:  '#2C271B',   // accent at ~14% over bg, opaque so it never bleeds
  onAccent:    '#1B1203',
  positive:    '#3DD68C',
  positiveSoft:'#193634',
  negative:    '#FF6B6B',
  negativeSoft:'#342730',
  // Frosted chrome: translucent fill + backdrop blur, 1px light edge, and an
  // inset top highlight that gives tonal buttons their "raised" read.
  glass:       'rgba(14,22,31,0.74)',
  glassEdge:   'rgba(255,255,255,0.08)',
  highlight:   'inset 0 1px 0 rgba(255,255,255,0.06)',
  serif: '"Source Serif 4", "Noto Serif TC", "PT Serif", Georgia, serif',
  sans:  '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono:  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
}

/** Backdrop filter for glass surfaces (spread with -webkit- prefix for iOS). */
export const GLASS_BLUR = 'blur(24px) saturate(160%)'

/** Category hue per tag: `fg` is the dot / active-chip text, `bg` its tint. */
export const TAG_COLORS: Record<string, { fg: string; bg: string }> = {
  '#model-release': { fg: '#B794F6', bg: 'rgba(183,148,246,0.16)' },
  '#api-platform':  { fg: '#63B3ED', bg: 'rgba(99,179,237,0.16)' },
  '#infra':         { fg: '#4FD1C5', bg: 'rgba(79,209,197,0.16)' },
  '#tooling':       { fg: '#F6AD55', bg: 'rgba(246,173,85,0.16)' },
  '#eval':          { fg: '#F687B3', bg: 'rgba(246,135,179,0.16)' },
  '#agent':         { fg: '#7F9CF5', bg: 'rgba(127,156,245,0.16)' },
  '#policy':        { fg: '#FC8181', bg: 'rgba(252,129,129,0.16)' },
  '#market':        { fg: '#A0AEC0', bg: 'rgba(160,174,192,0.16)' },
  '#opinion':       { fg: '#C6D57E', bg: 'rgba(198,213,126,0.16)' },
  '#research':      { fg: '#76E4F7', bg: 'rgba(118,228,247,0.16)' },
  '#event-promo':   { fg: '#ED8936', bg: 'rgba(237,137,54,0.16)' },
}
