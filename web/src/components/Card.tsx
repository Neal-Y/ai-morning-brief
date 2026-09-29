import type { Article } from '../types.ts'
import type { Theme } from '../theme.ts'
import { TAG_COLORS } from '../theme.ts'
import { useLayoutEffect, useRef, useState } from 'react'
import { IconBolt, IconSparkle } from './icons.tsx'

interface CategoryTagProps {
  tag: string
  theme: Theme
}

export function CategoryTag({ tag, theme }: CategoryTagProps) {
  const colors = TAG_COLORS[tag] ?? { fg: theme.inkMuted, bg: theme.raised }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: theme.mono,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.ink,
      background: theme.raised,
      padding: '4px 10px 4px 8px',
      borderRadius: 999,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: colors.fg, flexShrink: 0 }} />
      {tag.replace(/^#/, '')}
    </span>
  )
}

interface ArticleCardProps {
  article: Article
  theme: Theme
  swipeX?: number
  bottomInset?: string
}

export function ArticleCard({ article, theme, swipeX = 0, bottomInset = '0px' }: ArticleCardProps) {
  const tintOpacity = Math.min(Math.abs(swipeX) / 200, 0.35)
  const tintColor = swipeX > 0 ? theme.positive : theme.negative
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [needsBottomInset, setNeedsBottomInset] = useState(false)

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const inset = parseFloat(bottomInset) || 0
    const update = () => {
      setNeedsBottomInset(el.scrollHeight > el.clientHeight - inset + 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [article.id, bottomInset])

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
          borderRadius: 12,
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
        padding: '18px 20px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <CategoryTag tag={article.categoryTag} theme={theme} />
        <span style={{
          fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {article.source ?? ''}{article.publishedAgo ? ` · ${article.publishedAgo}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        {article.renderLevel === 'LIGHT' && (
          <span style={{
            fontFamily: theme.mono, fontSize: 11, fontWeight: 700,
            color: theme.accent, background: theme.accentSoft,
            padding: '3px 8px', borderRadius: 999,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>Signal</span>
        )}
      </div>

      {/* Scrollable body — Engineering Impact lives inside so extra space falls below it */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: needsBottomInset ? bottomInset : 0,
        } as React.CSSProperties}
      >
        <div style={{ padding: '2px 20px 10px' }}>
          <h1 style={{
            fontFamily: theme.serif,
            fontSize: 28, lineHeight: 1.16, fontWeight: 700,
            color: theme.ink,
            letterSpacing: -0.4,
            margin: 0,
          }}>{article.title}</h1>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          <p style={{
            fontFamily: theme.serif,
            fontSize: 16.5, lineHeight: 1.5, fontWeight: 400,
            color: theme.inkMuted,
            margin: 0,
          }}>{article.summary}</p>
        </div>

        <div style={{ height: 1, background: theme.ruleSoft, margin: '0 20px' }} />

        <div style={{ padding: '14px 20px 8px' }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 11, fontWeight: 600,
            color: theme.inkFaint, letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 6,
          }}>Context</div>
          <p style={{
            fontFamily: theme.sans, fontSize: 16, lineHeight: 1.6,
            color: theme.ink, margin: 0,
          }}>{article.context}</p>
        </div>

        {article.reason && (
          <div style={{ padding: '4px 20px 14px', display: 'flex', alignItems: 'center', gap: 7, color: theme.accent }}>
            <span style={{ display: 'inline-flex', flexShrink: 0 }}><IconSparkle /></span>
            <span style={{
              fontFamily: theme.sans, fontSize: 14,
              color: theme.accent, fontWeight: 500,
            }}>{article.reason}</span>
          </div>
        )}

        {article.skillTags.length > 0 && (
          <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {article.skillTags.map(t => (
              <span key={t} style={{
                fontFamily: theme.mono, fontSize: 11,
                color: theme.inkMuted,
                letterSpacing: 0.3,
              }}>{t}</span>
            ))}
          </div>
        )}

        <div style={{
          margin: '4px 12px 20px',
          background: theme.raised,
          boxShadow: theme.highlight,
          borderRadius: 18,
          padding: '14px 16px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: theme.accent,
            fontFamily: theme.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}><IconBolt />Engineering Impact</div>
          <p style={{
            fontFamily: theme.sans, fontSize: 16, lineHeight: 1.55,
            color: theme.ink, margin: '8px 0 0', fontWeight: 500,
          }}>{article.engineeringImpact}</p>
        </div>
      </div>
    </div>
  )
}
