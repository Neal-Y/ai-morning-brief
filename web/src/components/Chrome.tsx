import type { Theme } from '../theme.ts'
import { GLASS_BLUR } from '../theme.ts'
import { IconFlame, StatChip } from './icons.tsx'

interface TopChromeProps {
  theme: Theme
  current: number
  total: number
  streak: number
  dateLabel: string
  onOpenLibrary?: () => void
}

export function TopChrome({ theme, current, total, streak, dateLabel, onOpenLibrary }: TopChromeProps) {
  return (
    <div style={{
      padding: '14px 20px 12px',
      paddingTop: 'max(14px, env(safe-area-inset-top))',
      background: theme.bg,
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{
          fontFamily: theme.serif, fontSize: 18, fontWeight: 900,
          color: theme.ink, letterSpacing: -0.3,
          fontStyle: 'italic',
        }}>The Morning Brief</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>{dateLabel}</div>
          {onOpenLibrary && (
            <button
              aria-label="開啟 Library"
              onClick={onOpenLibrary}
              style={{
                width: 26, height: 26,
                background: 'transparent',
                border: `1px solid ${theme.ruleSoft}`,
                borderRadius: 8,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: theme.ink, cursor: 'pointer', padding: 0,
              }}
            >
              <IconLibrary size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 5, flex: 1 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i === current ? `d-active-${current}` : i}
              style={{
                flex: 1, height: 4, borderRadius: 999,
                background: i <= current ? theme.accent : 'rgba(160,190,220,0.14)',
                clipPath: 'inset(0)',
                animation: i === current ? 'wipeIn 0.4s cubic-bezier(0.4,0,0.2,1)' : 'none',
              }}
            />
          ))}
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5 }}>
          {current + 1}/{total}
        </div>
        <StatChip icon={<IconFlame />} value={streak} color={theme.accent} background={theme.accentSoft} />
      </div>
    </div>
  )
}

interface FeedbackBarProps {
  theme: Theme
  feedback?: 'up' | 'down'
  saved: boolean
  onLike: () => void
  onDislike: () => void
  onAsk: () => void
  onSave: () => void
  onOpen: () => void
}

export function FeedbackBar({ theme, feedback, saved, onLike, onDislike, onAsk, onSave, onOpen }: FeedbackBarProps) {
  // Tonal buttons on a frosted-glass capsule: no outlines, an inset top
  // highlight for the raised read, colour only when a state is on.
  const tonal = 'rgba(255,255,255,0.05)'

  const primaryBtn = (
    onClick: () => void,
    content: React.ReactNode,
    active: boolean,
    variant: 'like' | 'dislike',
  ) => (
    <button
      className="btn-press"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active
          ? (variant === 'like' ? 'rgba(61,214,140,0.16)' : 'rgba(255,107,107,0.16)')
          : tonal,
        color: active ? (variant === 'like' ? '#5BE3A0' : '#FF8A8A') : theme.ink,
        border: 'none',
        boxShadow: theme.highlight,
        borderRadius: 18,
        minHeight: 50,
        padding: '0 2px',
        flex: 1,
        fontFamily: theme.mono, fontSize: 11, fontWeight: 700,
        letterSpacing: 0.6,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: 'pointer',
      }}
    >{content}</button>
  )

  const iconBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    active = false,
  ) => (
    <button
      className="btn-press"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? 'rgba(245,165,36,0.16)' : tonal,
        color: active ? theme.accent : theme.ink,
        border: 'none',
        boxShadow: theme.highlight,
        borderRadius: 18,
        minHeight: 50,
        padding: '0 2px',
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        cursor: 'pointer',
      }}
    >
      {icon}
      <span style={{ fontFamily: theme.mono, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, lineHeight: 1 }}>{label}</span>
    </button>
  )

  return (
    <div style={{
      margin: '0 12px',
      padding: 6,
      display: 'flex', gap: 6,
      alignItems: 'stretch',
      flexShrink: 0,
      borderRadius: 24,
      background: theme.glass,
      backdropFilter: GLASS_BLUR,
      WebkitBackdropFilter: GLASS_BLUR,
      border: `1px solid ${theme.glassEdge}`,
      boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
    }}>
      {primaryBtn(onDislike, (
        <>
          <span
            key={feedback === 'down' ? 'dislike-on' : 'dislike-off'}
            style={{ display: 'inline-flex', animation: feedback === 'down' ? 'thumbDown 0.5s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none' }}
          ><IconThumbDown size={16} /></span>
          {'LESS'}
        </>
      ), feedback === 'down', 'dislike')}

      {iconBtn(onAsk, <IconChat size={17} />, 'ASK')}

      {iconBtn(onSave, (
        <span
          key={saved ? 'bm-on' : 'bm-off'}
          style={{ display: 'inline-flex', animation: saved ? 'stampIn 0.38s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none' }}
        ><IconBookmark size={17} filled={saved} /></span>
      ), saved ? 'SAVED' : 'SAVE', saved)}

      {iconBtn(onOpen, <IconExternal size={17} />, 'READ')}

      {primaryBtn(onLike, (
        <>
          {'MORE'}
          <span
            key={feedback === 'up' ? 'like-on' : 'like-off'}
            style={{ display: 'inline-flex', animation: feedback === 'up' ? 'thumbUp 0.5s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none' }}
          ><IconThumbUp size={16} /></span>
        </>
      ), feedback === 'up', 'like')}
    </div>
  )
}

const THUMB = 'M7 11v9H4.5A1.5 1.5 0 0 1 3 18.5v-6A1.5 1.5 0 0 1 4.5 11H7zm0 0 3.6-7.2A1.8 1.8 0 0 1 14 5v4h4.6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.4 20H7'

function IconThumbUp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={THUMB} />
    </svg>
  )
}

function IconThumbDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleY(-1)' }} aria-hidden="true">
      <path d={THUMB} />
    </svg>
  )
}

function IconBookmark({ size = 14, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17l-5.5 4z" />
    </svg>
  )
}

function IconChat({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z" />
    </svg>
  )
}

function IconExternal({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}

function IconLibrary({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="3" x2="4" y2="21" />
      <line x1="8" y1="3" x2="8" y2="21" />
      <rect x="11" y="4" width="4" height="17" />
      <path d="M17 5l3 16" />
    </svg>
  )
}
