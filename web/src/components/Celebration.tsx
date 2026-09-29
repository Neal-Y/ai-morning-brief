import type { Theme } from '../theme.ts'
import { formatBriefDateShort } from '../date.ts'
import { IconFlame } from './icons.tsx'

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
      position: 'fixed', inset: 0,
      background: theme.card,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'max(40px, env(safe-area-inset-top))',
      paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      paddingLeft: 24, paddingRight: 24,
      overflowY: 'auto',
    }}>
      {/* Editorial header — stays at top */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: theme.accent, marginBottom: 24 }} />

        <div style={{
          fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
          letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
        }}>End of edition · {dateStr}</div>

        <h1 style={{
          fontFamily: theme.serif, fontSize: 40, lineHeight: 1.02,
          fontWeight: 900, fontStyle: 'italic',
          color: theme.ink, margin: 0, marginBottom: 8, letterSpacing: -0.8,
        }}>That's it for<br />today.</h1>

        <p style={{
          fontFamily: theme.serif, fontSize: 15, lineHeight: 1.45,
          fontStyle: 'italic', color: theme.inkMuted,
          margin: 0,
        }}>You've read the morning. Come back tomorrow — the world won't slow down.</p>
      </div>

      {/* Stats cards — vertically centered in remaining space */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 14,
        paddingTop: 24, paddingBottom: 24,
      }}>
        <div style={{
          background: theme.raised, boxShadow: theme.highlight, borderRadius: 20,
          padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            fontFamily: theme.serif, fontSize: 48, fontWeight: 900,
            color: theme.accent, lineHeight: 1,
          }}>{streak}</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
            }}>Day streak</div>
            <div style={{
              fontFamily: theme.sans, fontSize: 13, color: theme.ink, fontWeight: 500,
            }}>keep going — see you tomorrow</div>
          </div>
          <IconFlame size={28} color={theme.accent} />
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          {[
            { label: 'READ', value: String(readCount), unit: '篇' },
            { label: 'SAVED', value: String(savedCount), unit: '篇' },
          ].map(s => (
            <div key={s.label} style={{
              background: theme.raised, boxShadow: theme.highlight, borderRadius: 18,
              padding: '14px 8px', textAlign: 'center',
            }}>
              <div style={{
                fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
              }}>{s.label}</div>
              <div style={{
                fontFamily: theme.serif, fontSize: 24, fontWeight: 700,
                color: theme.ink, lineHeight: 1,
              }}>{s.value}</div>
              <div style={{
                fontFamily: theme.sans, fontSize: 11, color: theme.inkMuted, marginTop: 2,
              }}>{s.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer — pinned at bottom of scroll area */}
      <div style={{
        fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
        letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center',
        flexShrink: 0,
      }}>— next edition · tomorrow 07:30 —</div>
    </div>
  )
}
