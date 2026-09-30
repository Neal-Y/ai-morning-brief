// Small filled glyphs that replace emoji (🔥 ⚡) — emoji render as stickers on
// iOS and can't take the theme colour.

export function IconFlame({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2.8c.6 3.3 5.2 5.2 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.8 2.3-4.9.1 1.6.9 2.7 2.1 3.1-.6-2.9-.2-5.7.8-8.4z" />
    </svg>
  )
}

export function IconBolt({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
    </svg>
  )
}

export function IconSparkle({ size = 13, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  )
}

/** Pill with a glyph + number (streak / XP). */
export function StatChip({ icon, value, color, background }: {
  icon: React.ReactNode; value: React.ReactNode; color: string; background: string
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px 3px 7px', borderRadius: 999,
      background, color,
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    }}>
      {icon}{value}
    </span>
  )
}

/**
 * The Sift mark — the app icon's funnel of shrinking bars (many signals in,
 * one out), drawn in the accent so the in-app wordmark matches the home-screen
 * icon. Proportions follow web/public/icon-512.svg.
 */
export function SiftMark({ size = 18, color = '#F5A524', glow = false }: {
  size?: number; color?: string; glow?: boolean
}) {
  return (
    <svg
      width={size} height={size} viewBox="86 146 340 250" aria-hidden="true"
      style={glow ? { filter: `drop-shadow(0 0 ${Math.max(2, size / 10)}px ${color}88)` } : undefined}
    >
      <g fill={color}>
        <rect x="96" y="158" width="122" height="26" rx="13" />
        <rect x="244" y="158" width="172" height="26" rx="13" />
        <rect x="148" y="213" width="216" height="26" rx="13" />
        <rect x="192" y="264" width="128" height="26" rx="13" />
        <rect x="222" y="318" width="68" height="24" rx="12" />
        <circle cx="256" cy="378" r="13" />
      </g>
    </svg>
  )
}

/** Mark + "Sift" wordmark, used in the Feed header and the launch screen. */
export function SiftWordmark({ size = 18, color, markColor }: {
  size?: number; color: string; markColor: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.42 }}>
      <SiftMark size={size * 1.05} color={markColor} />
      <span style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        fontSize: size, fontWeight: 800, letterSpacing: -0.02 * size,
        color, lineHeight: 1,
      }}>Sift</span>
    </span>
  )
}
