import type { Theme } from '../theme.ts'
import { formatBriefDateShort } from '../date.ts'

interface CelebrationProps {
  theme: Theme
  savedCount: number
  streak: number
  readCount: number
  briefDate: string
}

export function Celebration({ theme, savedCount, streak, readCount, briefDate }: CelebrationProps) {
  const dateStr = formatBriefDateShort(briefDate)

  return (
    <div style={{
      height: '100%', background: theme.card,
      display: 'flex', flexDirection: 'column',
      padding: '40px 24px 24px',
      overflowY: 'auto',
    }}>
      <div style={{ height: 3, background: theme.ink, marginBottom: 6 }} />
      <div style={{ height: 1, background: theme.ink, marginBottom: 24 }} />

      <div style={{
        fontFamily: theme.mono, fontSize: 10, color: theme.inkFaint,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
      }}>End of edition · {dateStr}</div>

      <h1 style={{
        fontFamily: theme.serif, fontSize: 40, lineHeight: 1.02,
        fontWeight: 900, fontStyle: 'italic',
        color: theme.ink, margin: 0, marginBottom: 8, letterSpacing: -0.8,
      }}>That's it for<br />today.</h1>

      <p style={{
        fontFamily: theme.serif, fontSize: 15, lineHeight: 1.45,
        fontStyle: 'italic', color: theme.inkMuted,
        margin: 0, marginBottom: 28,
      }}>You've read the morning. Come back tomorrow — the world won't slow down.</p>

      <div style={{
        background: theme.bg, border: `1.5px solid ${theme.ink}`, borderRadius: 2,
        padding: '16px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          fontFamily: theme.serif, fontSize: 48, fontWeight: 900,
          color: theme.accent, lineHeight: 1,
        }}>{streak}</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
            letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2,
          }}>Day streak</div>
          <div style={{
            fontFamily: theme.sans, fontSize: 13, color: theme.ink, fontWeight: 500,
          }}>keep going — see you tomorrow</div>
        </div>
        <div style={{ fontSize: 28 }}>🔥</div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 1,
        background: theme.ink, border: `1.5px solid ${theme.ink}`, borderRadius: 2,
        marginBottom: 14,
      }}>
        {[
          { label: 'READ', value: String(readCount), unit: '篇' },
          { label: 'SAVED', value: String(savedCount), unit: '篇' },
        ].map(s => (
          <div key={s.label} style={{
            background: theme.card, padding: '14px 8px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
            }}>{s.label}</div>
            <div style={{
              fontFamily: theme.serif, fontSize: 24, fontWeight: 700,
              color: theme.ink, lineHeight: 1,
            }}>{s.value}</div>
            <div style={{
              fontFamily: theme.sans, fontSize: 10, color: theme.inkMuted, marginTop: 2,
            }}>{s.unit}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
        letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center',
      }}>— next edition · tomorrow 07:30 —</div>
    </div>
  )
}
