import type { Theme } from '../theme.ts'

interface TopChromeProps {
  theme: Theme
  current: number
  total: number
  streak: number
  lastReadAgo: string
}

export function TopChrome({ theme, current, total, streak, lastReadAgo }: TopChromeProps) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase().replace(/,/g, ' ·')

  return (
    <div style={{
      padding: '14px 20px 10px',
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
        <div style={{
          fontFamily: theme.mono, fontSize: 9, color: theme.inkMuted,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>{dateStr}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i === current ? `d-active-${current}` : i}
              style={{
                flex: 1, height: 3,
                background: i <= current ? theme.ink : theme.ruleSoft,
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
        background: active ? (variant === 'like' ? theme.positive : theme.negative) : 'transparent',
        color: active ? theme.card : theme.ink,
        border: `1.5px solid ${theme.ink}`,
        borderRadius: 2,
        padding: '10px 0',
        flex: 1.5,
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
    content: React.ReactNode,
    active = false,
  ) => (
    <button
      className="btn-press"
      onClick={onClick}
      style={{
        background: active ? theme.ink : 'transparent',
        color: active ? theme.card : theme.ink,
        border: `1.5px solid ${theme.ink}`,
        borderRadius: 2,
        padding: '10px 0',
        flex: 0.8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
        cursor: 'pointer',
      }}
    >{content}</button>
  )

  return (
    <div style={{
      background: theme.bg,
      borderTop: `1.5px solid ${theme.ink}`,
      padding: '10px 16px 14px',
      display: 'flex', gap: 6,
      flexShrink: 0,
    }}>
      {primaryBtn(onDislike, <><IconThumbDown size={14} /> LESS</>, feedback === 'down', 'dislike')}
      {iconBtn(onAsk, <IconChat size={15} />)}
      {iconBtn(onSave, (
        <span
          key={saved ? 'bm-on' : 'bm-off'}
          style={{
            display: 'inline-flex',
            animation: saved ? 'stampIn 0.38s cubic-bezier(0.175,0.885,0.32,1.275)' : 'none',
            color: saved ? theme.accent : theme.ink,
          }}
        >
          <IconBookmark size={15} filled={saved} />
        </span>
      ), saved)}
      {iconBtn(onOpen, <IconExternal size={15} />)}
      {primaryBtn(onLike, <>MORE <IconThumbUp size={14} /></>, feedback === 'up', 'like')}
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
