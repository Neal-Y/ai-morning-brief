import type { Article } from '../types.ts'
import type { Theme } from '../theme.ts'
import { TAG_COLORS } from '../theme.ts'

interface CategoryTagProps {
  tag: string
  theme: Theme
}

export function CategoryTag({ tag, theme }: CategoryTagProps) {
  const colors = TAG_COLORS[tag] ?? { fg: theme.ink, bg: theme.bgDeep }
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
  )
}

interface ArticleCardProps {
  article: Article
  theme: Theme
  swipeX?: number
}

export function ArticleCard({ article, theme, swipeX = 0 }: ArticleCardProps) {
  const tintOpacity = Math.min(Math.abs(swipeX) / 200, 0.35)
  const tintColor = swipeX > 0 ? theme.positive : theme.negative

  return (
    <div style={{
      height: '100%',
      background: theme.card,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {Math.abs(swipeX) > 10 && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
          background: tintColor,
          opacity: tintOpacity,
        }} />
      )}

      {Math.abs(swipeX) > 40 && (
        <div style={{
          position: 'absolute',
          top: 120,
          ...(swipeX > 0 ? { right: 24 } : { left: 24 }),
          zIndex: 6,
          fontFamily: theme.serif,
          fontSize: Math.abs(swipeX) > 90 ? 32 : 28,
          fontWeight: 900,
          letterSpacing: 1,
          color: swipeX > 0 ? theme.positive : theme.negative,
          border: `${Math.abs(swipeX) > 90 ? 4 : 3}px solid ${swipeX > 0 ? theme.positive : theme.negative}`,
          padding: '6px 14px',
          transform: `rotate(${swipeX > 0 ? -8 : 8}deg) scale(${Math.abs(swipeX) > 90 ? 1.08 : 1})`,
          textTransform: 'uppercase',
          background: theme.card,
          transition: 'font-size 0.12s, transform 0.12s, border-width 0.12s',
        }}>
          {swipeX > 0 ? 'More' : 'Less'}
        </div>
      )}

      {/* Meta bar */}
      <div style={{
        padding: '14px 24px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${theme.ruleSoft}`,
        flexShrink: 0,
      }}>
        <CategoryTag tag={article.categoryTag} theme={theme} />
        <span style={{
          fontFamily: theme.mono, fontSize: 10, color: theme.inkFaint,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {article.source ?? ''}{article.publishedAgo ? ` · ${article.publishedAgo}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        {article.renderLevel === 'LIGHT' && (
          <span style={{
            fontFamily: theme.mono, fontSize: 9, fontWeight: 600,
            color: theme.accent, textTransform: 'uppercase', letterSpacing: 1,
          }}>Signal</span>
        )}
      </div>

      {/* Scrollable body — Engineering Impact lives inside so extra space falls below it */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        <div style={{ padding: '18px 24px 8px' }}>
          <h1 style={{
            fontFamily: theme.serif,
            fontSize: 30, lineHeight: 1.12, fontWeight: 700,
            color: theme.ink,
            letterSpacing: -0.3,
            margin: 0,
          }}>{article.title}</h1>
        </div>

        <div style={{ padding: '0 24px 14px' }}>
          <p style={{
            fontFamily: theme.serif,
            fontSize: 17, lineHeight: 1.42, fontWeight: 400, fontStyle: 'italic',
            color: theme.inkMuted,
            margin: 0,
          }}>{article.summary}</p>
        </div>

        <div style={{ height: 1, background: theme.rule, margin: '0 24px', opacity: 0.8 }} />

        <div style={{ padding: '14px 24px 10px' }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 9, fontWeight: 600,
            color: theme.inkFaint, letterSpacing: 1.5,
            textTransform: 'uppercase', marginBottom: 6,
          }}>Context</div>
          <p style={{
            fontFamily: theme.sans, fontSize: 15, lineHeight: 1.55,
            color: theme.ink, margin: 0,
          }}>{article.context}</p>
        </div>

        {article.reason && (
          <div style={{ padding: '4px 24px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 3, height: 12, background: theme.accent, flexShrink: 0 }} />
            <span style={{
              fontFamily: theme.sans, fontSize: 13, fontStyle: 'italic',
              color: theme.accent, fontWeight: 500,
            }}>{article.reason}</span>
          </div>
        )}

        {article.skillTags.length > 0 && (
          <div style={{ padding: '0 24px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {article.skillTags.map(t => (
              <span key={t} style={{
                fontFamily: theme.mono, fontSize: 10,
                color: theme.inkMuted,
                letterSpacing: 0.3,
              }}>{t}</span>
            ))}
          </div>
        )}

        <div style={{
          margin: '4px 16px 24px',
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
            fontFamily: theme.sans, fontSize: 15, lineHeight: 1.5,
            color: theme.ink, margin: 0, fontWeight: 500,
          }}>{article.engineeringImpact}</p>
        </div>
      </div>
    </div>
  )
}
