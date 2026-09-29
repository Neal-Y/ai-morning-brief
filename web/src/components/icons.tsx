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
