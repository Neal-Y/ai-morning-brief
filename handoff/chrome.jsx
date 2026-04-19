// Top chrome: progress dots + streak + last-read time
// Bottom: feedback row (dislike / original / ask / save / like)

function TopChrome({ theme, current, total, streak, lastReadAgo }) {
  return (
    <div style={{
      padding: '14px 20px 10px',
      background: theme.bg,
      borderBottom: `1px solid ${theme.ruleSoft}`,
    }}>
      {/* Masthead-ish row */}
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
        }}>Sun · Apr 19 · 2026</div>
      </div>

      {/* Progress + streak + last read */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Progress dashes */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3,
              background: i <= current ? theme.ink : theme.ruleSoft,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        <div style={{
          fontFamily: theme.mono, fontSize: 10, color: theme.inkMuted,
          letterSpacing: 0.5,
        }}>{current + 1}/{total}</div>
        <div style={{ width: 1, height: 10, background: theme.ruleSoft }} />
        <div style={{
          fontFamily: theme.mono, fontSize: 10, color: theme.accent, fontWeight: 600,
        }}>🔥 {streak}</div>
        <div style={{ width: 1, height: 10, background: theme.ruleSoft }} />
        <div style={{
          fontFamily: theme.mono, fontSize: 10, color: theme.inkFaint,
        }}>{lastReadAgo} ago</div>
      </div>
    </div>
  );
}

function FeedbackBar({ theme, onDislike, onLike, onAsk, onSave, onOpen, saved, feedback }) {
  const btn = (onClick, content, active, variant) => (
    <button onClick={onClick} style={{
      background: active
        ? (variant === 'like' ? theme.positive : variant === 'dislike' ? theme.negative : theme.ink)
        : 'transparent',
      color: active ? theme.card : theme.ink,
      border: `1.5px solid ${theme.ink}`,
      borderRadius: 2,
      padding: '10px 0',
      flex: 1,
      fontFamily: theme.mono, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.5,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      transition: 'all 0.15s',
    }}>{content}</button>
  );

  return (
    <div style={{
      background: theme.bg,
      borderTop: `1.5px solid ${theme.ink}`,
      padding: '10px 16px 14px',
      display: 'flex', gap: 6,
    }}>
      {btn(onDislike, (
        <><IconThumbDown size={13} /> LESS</>
      ), feedback === 'down', 'dislike')}
      {btn(onAsk, (
        <><IconChat size={13} /> ASK</>
      ))}
      {btn(onSave, (
        <><IconBookmark size={13} filled={saved} /> {saved ? 'SAVED' : 'SAVE'}</>
      ), saved)}
      {btn(onOpen, (
        <><IconExternal size={13} /> READ</>
      ))}
      {btn(onLike, (
        <><IconThumbUp size={13} /> MORE</>
      ), feedback === 'up', 'like')}
    </div>
  );
}

// Icons — thin line, editorial
function IconThumbUp({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10v11M7 10l4-7 2 1v6h7l-2 10H7" strokeLinejoin="round"/>
    </svg>
  );
}
function IconThumbDown({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 14V3M17 14l-4 7-2-1v-6H4l2-10h11" strokeLinejoin="round"/>
    </svg>
  );
}
function IconBookmark({ size = 14, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M5 3h14v18l-7-5-7 5V3z" strokeLinejoin="round"/>
    </svg>
  );
}
function IconChat({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v12H8l-4 4V4z" strokeLinejoin="round"/>
    </svg>
  );
}
function IconExternal({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 4h6v6M10 14L20 4M20 14v6H4V4h6" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

Object.assign(window, {
  TopChrome, FeedbackBar,
  IconThumbUp, IconThumbDown, IconBookmark, IconChat, IconExternal,
});
