// Sift — design tokens.
// Mirrors web/src/theme.ts THEME_DARK so the RN app reads as the same product
// as the PWA, not a different app bolted on. PWA has no light mode, so neither does this.

export const FONT = {
  black: 'NotoSansTC_900Black',
  bold: 'NotoSansTC_700Bold',
  medium: 'NotoSansTC_500Medium',
  regular: 'NotoSansTC_400Regular',
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const

export const T = {
  // surfaces
  page: '#14110D',
  dot: 'rgba(242,237,228,0.07)',
  surface: '#1F1B15',
  border: 'rgba(242,237,228,0.14)',
  track: '#2A2520',
  letterBg: '#262119',
  letterText: '#9E9587',

  // accent (Sift ember)
  accent: '#E8654F',
  accentHi: '#F0816C',
  accentSoft: '#5A2318',

  // semantic — brighter + more saturated than the PWA's muted tones so right/wrong
  // reads instantly on the near-black page (tints were barely visible before).
  correct: '#5FBE71',
  correctTint: '#203A28',
  wrong: '#E0554A',
  wrongTint: '#382020',

  // text
  text: '#F2EDE4',
  textMuted: '#9E9587',
  textFaint: '#6B6358',
} as const

export const RADIUS = {
  pill: 999,
  card: 22,
  option: 16,
  button: 16,
} as const

// XP awarded per outcome (matches handoff: correct*20 + wrong*5)
export const XP = { correct: 20, wrong: 5 } as const
