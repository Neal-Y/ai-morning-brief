import { useEffect, useRef, useState } from 'react'
import { THEME_DARK } from '../../theme.ts'

const T = THEME_DARK

/** Counts from 0 to `target` with an ease-out curve. */
export function useCountUp(target: number, duration = 900, delay = 0): number {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    let start: number | null = null
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, Math.max(0, (now - start - delay) / duration))
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current) }
  }, [target, duration, delay])

  return value
}

export function StatCard({ value, label, delay = 0 }: {
  value: number; label: string; delay?: number
}) {
  const display = useCountUp(value, 900, delay)
  return (
    <div style={{
      flex: 1, background: T.card,
      border: `1px solid ${T.ruleSoft}`, borderRadius: 14,
      padding: '14px 12px',
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 24, fontWeight: 700, color: T.ink,
        fontVariantNumeric: 'tabular-nums',
      }}>{display}</div>
      <div style={{
        fontFamily: T.mono, fontSize: 10, color: T.inkMuted,
        marginTop: 4, letterSpacing: 0.3,
      }}>{label}</div>
    </div>
  )
}
