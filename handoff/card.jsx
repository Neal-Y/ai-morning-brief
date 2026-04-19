// Card — newspaper editorial style
// Structure: meta bar (tag + source + time) → serif title → summary → context → engineering impact highlight

function CategoryTag({ tag, theme }) {
  const colors = window.TAG_COLORS[tag] || { fg: theme.ink, bg: theme.bgDeep };
  return (
    <span style={{
      fontFamily: theme.mono,
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.fg,
      background: colors.bg,
      padding: '3px 7px',
      borderRadius: 2,
      whiteSpace: 'nowrap',
    }}>{tag}</span>
  );
}

function ArticleCard({ card, theme, swipeX = 0 }) {
  // Swipe tint: green for right (like), red for left (dislike)
  const tintOpacity = Math.min(Math.abs(swipeX) / 200, 0.35);
  const tintColor = swipeX > 0 ? theme.positive : theme.negative;

  return (
    <div style={{
      height: '100%',
      background: theme.card,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Swipe tint overlay */}
      {Math.abs(swipeX) > 10 && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
          background: tintColor,
          opacity: tintOpacity,
        }} />
      )}

      {/* Swipe action badge */}
      {Math.abs(swipeX) > 40 && (
        <div style={{
          position: 'absolute',
          top: 120,
          [swipeX > 0 ? 'right' : 'left']: 24,
          zIndex: 6,
          fontFamily: theme.serif,
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: 1,
          color: swipeX > 0 ? theme.positive : theme.negative,
          border: `3px solid ${swipeX > 0 ? theme.positive : theme.negative}`,
          padding: '6px 14px',
          transform: `rotate(${swipeX > 0 ? -8 : 8}deg)`,
          textTransform: 'uppercase',
          background: theme.card,
        }}>
          {swipeX > 0 ? 'More' : 'Less'}
        </div>
      )}

      {/* Meta bar: category tag + source */}
      <div style={{
        padding: '14px 24px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${theme.ruleSoft}`,
      }}>
        <CategoryTag tag={card.categoryTag} theme={theme} />
        <span style={{
          fontFamily: theme.mono, fontSize: 10, color: theme.inkFaint,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{card.source} · {card.publishedAgo}</span>
        <div style={{ flex: 1 }} />
        {card.renderLevel === 'LIGHT' && (
          <span style={{
            fontFamily: theme.mono, fontSize: 9, fontWeight: 600,
            color: theme.accent, textTransform: 'uppercase', letterSpacing: 1,
          }}>Signal</span>
        )}
      </div>

      {/* Title — serif, big, editorial */}
      <div style={{ padding: '18px 24px 8px' }}>
        <h1 style={{
          fontFamily: theme.serif,
          fontSize: 30, lineHeight: 1.12, fontWeight: 700,
          color: theme.ink,
          letterSpacing: -0.3,
          margin: 0,
          textWrap: 'pretty',
        }}>{card.title}</h1>
      </div>

      {/* Summary — serif italic, like a deck/standfirst */}
      <div style={{ padding: '0 24px 14px' }}>
        <p style={{
          fontFamily: theme.serif,
          fontSize: 17, lineHeight: 1.42, fontWeight: 400, fontStyle: 'italic',
          color: theme.inkMuted,
          margin: 0,
          textWrap: 'pretty',
        }}>{card.summary}</p>
      </div>

      {/* Rule */}
      <div style={{ height: 1, background: theme.rule, margin: '0 24px', opacity: 0.8 }} />

      {/* Context */}
      <div style={{ padding: '14px 24px 10px' }}>
        <div style={{
          fontFamily: theme.mono, fontSize: 9, fontWeight: 600,
          color: theme.inkFaint, letterSpacing: 1.5,
          textTransform: 'uppercase', marginBottom: 6,
        }}>Context</div>
        <p style={{
          fontFamily: theme.sans, fontSize: 14, lineHeight: 1.55,
          color: theme.ink, margin: 0, textWrap: 'pretty',
        }}>{card.context}</p>
      </div>

      {/* Reason badge — why you should read now */}
      {card.reason && (
        <div style={{ padding: '4px 24px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 3, height: 12, background: theme.accent,
          }} />
          <span style={{
            fontFamily: theme.sans, fontSize: 12, fontStyle: 'italic',
            color: theme.accent, fontWeight: 500,
          }}>{card.reason}</span>
        </div>
      )}

      {/* Spacer pushes impact to bottom-ish */}
      <div style={{ flex: 1 }} />

      {/* Engineering impact — the money shot */}
      <div style={{
        margin: '0 16px 16px',
        background: theme.bg,
        border: `1.5px solid ${theme.ink}`,
        borderRadius: 2,
        padding: '14px 16px',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: -8, left: 12,
          background: theme.card,
          padding: '0 6px',
          fontFamily: theme.mono, fontSize: 9, fontWeight: 700,
          color: theme.ink, letterSpacing: 2,
          textTransform: 'uppercase',
        }}>▸ Engineering Impact</div>
        <p style={{
          fontFamily: theme.sans, fontSize: 14, lineHeight: 1.5,
          color: theme.ink, margin: 0, fontWeight: 500,
          textWrap: 'pretty',
        }}>{card.engineeringImpact}</p>
      </div>

      {/* Skill tags footer */}
      <div style={{
        padding: '0 24px 12px', display: 'flex', gap: 6, flexWrap: 'wrap',
      }}>
        {card.skillTags.map(t => (
          <span key={t} style={{
            fontFamily: theme.mono, fontSize: 10,
            color: theme.inkMuted,
            letterSpacing: 0.3,
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ArticleCard, CategoryTag });
