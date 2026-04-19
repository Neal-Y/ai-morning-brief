// Design tokens — newspaper/FT editorial style
// Warm paper cream, deep ink, red accent. Serif display + mono tag + sans body.

const THEME_LIGHT = {
  // Surfaces — warm paper
  bg: '#F2EDE4',          // cream paper
  bgDeep: '#E8E2D5',      // slightly darker, for layered surfaces
  card: '#FBF7EE',        // card (lighter than bg, like newsprint highlight)
  cardEdge: '#1A1612',
  // Ink
  ink: '#1A1612',         // deep warm black
  inkMuted: '#5A4F42',    // warm grey
  inkFaint: '#8B7F6F',    // pale warm grey
  rule: '#1A1612',        // for hairline rules
  ruleSoft: 'rgba(26,22,18,0.18)',
  // Accents
  accent: '#C8321E',      // FT red / ink-pot red
  accentSoft: '#E8BFB6',
  positive: '#2D5A3D',    // deep forest (for engineering impact highlight)
  positiveSoft: '#C9DCC9',
  negative: '#8B1A1A',    // darker red for downvote
  // Fonts
  serif: '"Source Serif 4", "PT Serif", Georgia, serif',
  sans: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

const THEME_DARK = {
  bg: '#14110D',
  bgDeep: '#0D0B08',
  card: '#1F1B15',
  cardEdge: '#F2EDE4',
  ink: '#F2EDE4',
  inkMuted: '#9E9587',
  inkFaint: '#6B6358',
  rule: '#F2EDE4',
  ruleSoft: 'rgba(242,237,228,0.18)',
  accent: '#E8654F',
  accentSoft: '#5A2318',
  positive: '#7FB57F',
  positiveSoft: '#26402A',
  negative: '#C54444',
  serif: '"Source Serif 4", "PT Serif", Georgia, serif',
  sans: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

// Category tag → color (editorial section colors)
const TAG_COLORS = {
  '#model-release': { fg: '#6B2E8A', bg: '#EBDCF0' },  // plum
  '#api-platform':  { fg: '#1E5A8A', bg: '#D4E2EE' },  // blue
  '#infra':         { fg: '#2D5A3D', bg: '#D4E2D4' },  // forest
  '#tooling':       { fg: '#8A5A1E', bg: '#EEE0D4' },  // ochre
  '#eval':          { fg: '#6B1E3D', bg: '#EED4DC' },  // burgundy
  '#agent':         { fg: '#1E3D8A', bg: '#D4D8EE' },  // navy
  '#policy':        { fg: '#5A2D1E', bg: '#EED8D4' },  // brick
  '#market':        { fg: '#2D2D2D', bg: '#E0DCD4' },  // charcoal
  '#opinion':       { fg: '#5A5A2D', bg: '#EAE8D4' },  // olive
  '#research':      { fg: '#3D5A6B', bg: '#D4E0E6' },  // slate
};

Object.assign(window, { THEME_LIGHT, THEME_DARK, TAG_COLORS });
