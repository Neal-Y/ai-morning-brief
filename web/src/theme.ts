export interface Theme {
  bg: string; bgDeep: string; card: string; cardEdge: string
  ink: string; inkMuted: string; inkFaint: string
  rule: string; ruleSoft: string
  accent: string; accentSoft: string
  positive: string; positiveSoft: string; negative: string
  serif: string; sans: string; mono: string
}

export const THEME_DARK: Theme = {
  bg:          '#14110D',
  bgDeep:      '#0D0B08',
  card:        '#1F1B15',
  cardEdge:    '#F2EDE4',
  ink:         '#F2EDE4',
  inkMuted:    '#9E9587',
  inkFaint:    '#6B6358',
  rule:        '#F2EDE4',
  ruleSoft:    'rgba(242,237,228,0.18)',
  accent:      '#E8654F',
  accentSoft:  '#5A2318',
  positive:    '#7FB57F',
  positiveSoft:'#26402A',
  negative:    '#C54444',
  serif: '"Source Serif 4", "Noto Serif TC", "PT Serif", Georgia, serif',
  sans:  '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono:  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
}

export const THEME_LIGHT: Theme = {
  bg:          '#F2EDE4',
  bgDeep:      '#E8E2D5',
  card:        '#FBF7EE',
  cardEdge:    '#1A1612',
  ink:         '#1A1612',
  inkMuted:    '#5A4F42',
  inkFaint:    '#8B7F6F',
  rule:        '#1A1612',
  ruleSoft:    'rgba(26,22,18,0.18)',
  accent:      '#E8654F',
  accentSoft:  '#E8BFB6',
  positive:    '#2D5A3D',
  positiveSoft:'#C9DCC9',
  negative:    '#8B1A1A',
  serif: '"Source Serif 4", "Noto Serif TC", "PT Serif", Georgia, serif',
  sans:  '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono:  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
}

export const ACCENT_PRESETS: Array<{ name: string; value: string; soft: string }> = [
  { name: 'ember',  value: '#E8654F', soft: '#5A2318' },
  { name: 'red',    value: '#C8321E', soft: '#5A1810' },
  { name: 'ink',    value: '#1A1612', soft: '#0D0B09' },
  { name: 'forest', value: '#2D5A3D', soft: '#152E1F' },
  { name: 'navy',   value: '#1E3D8A', soft: '#0A1E4A' },
  { name: 'ochre',  value: '#8A5A1E', soft: '#452D0F' },
]

export const TAG_COLORS: Record<string, { fg: string; bg: string }> = {
  '#model-release': { fg: '#6B2E8A', bg: '#EBDCF0' },
  '#api-platform':  { fg: '#1E5A8A', bg: '#D4E2EE' },
  '#infra':         { fg: '#2D5A3D', bg: '#D4E2D4' },
  '#tooling':       { fg: '#8A5A1E', bg: '#EEE0D4' },
  '#eval':          { fg: '#6B1E3D', bg: '#EED4DC' },
  '#agent':         { fg: '#1E3D8A', bg: '#D4D8EE' },
  '#policy':        { fg: '#5A2D1E', bg: '#EED8D4' },
  '#market':        { fg: '#2D2D2D', bg: '#E0DCD4' },
  '#opinion':       { fg: '#5A5A2D', bg: '#EAE8D4' },
  '#research':      { fg: '#3D5A6B', bg: '#D4E0E6' },
  '#event-promo':   { fg: '#8A3D1E', bg: '#EEE0D4' },
}
