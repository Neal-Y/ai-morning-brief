import type { Theme } from '../theme.ts'

interface TopChromeProps {
  theme: Theme
  current: number
  total: number
  streak: number
  lastReadAgo: string
  dateLabel: string
  onOpenLibrary?: () => void
}

export function TopChrome({ theme, current, total, streak, lastReadAgo, dateLabel, onOpenLibrary }: TopChromeProps) {
  return (
    <div style={{
      padding: '14px 20px 10px',
      paddingTop: 'max(14px, env(safe-area-inset-top))',
      background: theme.bg,
      borderBottom: `1px solid ${theme.ruleSoft}`,
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontFamily: theme.serif, fontSize: 18, fontWeight: 900,
          color: theme.ink, letterSpacing: -0.3,
          fontStyle: 'italic',
        }}>The Morning Brief</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 9, color: theme.inkMuted,
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
                borderRadius: 2,
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
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i === current ? `d-active-${current}` : i}
              style={{
                flex: 1, height: 3,
                background: i <= current ? theme.accent : theme.ruleSoft,
                clipPath: 'inset(0)',
                animation: i === current ? 'wipeIn 0.4s cubic-bezier(0.4,0,0.2,1)' : 'none',
              }}
            />
          ))}
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 10, color: theme.inkMuted, letterSpacing: 0.5 }}>
          {current + 1}/{total}
        </div>
        <div style={{ width: 1, height: 10, background: theme.ruleSoft }} />
        <div style={{ fontFamily: theme.mono, fontSize: 10, color: theme.accent, fontWeight: 600 }}>
          🔥 {streak}
        </div>
        <div style={{ width: 1, height: 10, background: theme.ruleSoft }} />
        <div style={{ fontFamily: theme.mono, fontSize: 10, color: theme.inkFaint }}>
          {lastReadAgo}
        </div>
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
  const primaryBtn = (
    onClick: () => void,
    content: React.ReactNode,
    active: boolean,
    variant: 'like' | 'dislike',
  ) => (
    <button
      className="btn-press"
      onClick={onClick}
      style={{
        background: active ? (variant === 'like' ? theme.positive : theme.negative) : theme.bgDeep,
        color: active ? theme.card : theme.ink,
        border: `1.5px solid ${theme.ink}`,
        borderRadius: 6,
        minHeight: 48,
        padding: '0 2px',
        flex: 1,
        fontFamily: theme.mono, fontSize: 12, fontWeight: 700,
        letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        transition: 'all 0.15s',
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
      style={{
        background: active ? theme.ink : theme.bgDeep,
        color: active ? theme.card : theme.ink,
        border: `1.5px solid ${theme.ink}`,
        borderRadius: 6,
        minHeight: 48,
        padding: '0 2px',
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        transition: 'all 0.15s',
        cursor: 'pointer',
      }}
    >
      {icon}
      <span style={{ fontFamily: theme.mono, fontSize: 8, fontWeight: 600, letterSpacing: 0.5, lineHeight: 1 }}>{label}</span>
    </button>
  )

  return (
    <div style={{
      padding: '0 16px',
      display: 'flex', gap: 7,
      alignItems: 'stretch',
      flexShrink: 0,
    }}>
      {primaryBtn(onDislike, (
        <>
          <span
            key={feedback === 'down' ? 'dislike-on' : 'dislike-off'}
            style={{ display: 'inline-flex', animation: feedback === 'down' ? 'thumbDown 0.5s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none' }}
          ><IconThumbDown size={14} /></span>
          {' LESS'}
        </>
      ), feedback === 'down', 'dislike')}

      {iconBtn(onAsk, <IconChat size={14} />, 'ASK')}

      {iconBtn(onSave, (
        <span
          key={saved ? 'bm-on' : 'bm-off'}
          style={{ display: 'inline-flex', animation: saved ? 'stampIn 0.38s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none', color: saved ? theme.accent : theme.ink }}
        ><IconBookmark size={14} filled={saved} /></span>
      ), saved ? 'SAVED' : 'SAVE', saved)}

      {iconBtn(onOpen, <IconExternal size={14} />, 'READ')}

      {primaryBtn(onLike, (
        <>
          {'MORE '}
          <span
            key={feedback === 'up' ? 'like-on' : 'like-off'}
            style={{ display: 'inline-flex', animation: feedback === 'up' ? 'thumbUp 0.5s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none' }}
          ><IconThumbUp size={14} /></span>
        </>
      ), feedback === 'up', 'like')}
    </div>
  )
}

function IconThumbUp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10v11M7 10l4-7 2 1v6h7l-2 10H7" strokeLinejoin="round" />
    </svg>
  )
}

function IconThumbDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 14V3M17 14l-4 7-2-1v-6H4l2-10h11" strokeLinejoin="round" />
    </svg>
  )
}

function IconBookmark({ size = 14, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M5 3h14v18l-7-5-7 5V3z" strokeLinejoin="round" />
    </svg>
  )
}

function IconChat({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v12H8l-4 4V4z" strokeLinejoin="round" />
    </svg>
  )
}

function IconExternal({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 4h6v6M10 14L20 4M20 14v6H4V4h6" strokeLinejoin="round" strokeLinecap="round" />
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
