import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { THEME_DARK, ACCENT_PRESETS } from './theme.ts'
import type { Theme } from './theme.ts'
import { ArticleCard } from './components/Card.tsx'
import { TopChrome, FeedbackBar } from './components/Chrome.tsx'
import { isPushSupported, isStandalone, subscribeToPush } from './push.ts'
import { AskSheet } from './components/AskSheet.tsx'
import { Celebration } from './components/Celebration.tsx'
import { formatBriefDateLong, getTaipeiDateString } from './date.ts'
import type { Article, FeedResponse } from './types.ts'

function parsePublishedAgo(classifiedAt: number | string | null | undefined): string {
  if (!classifiedAt) return ''
  const ts = typeof classifiedAt === 'string' ? new Date(classifiedAt).getTime() : Number(classifiedAt)
  if (isNaN(ts)) return ''
  const h = Math.floor((Date.now() - ts) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function parseArticles(raw: FeedResponse['articles']): Article[] {
  return raw
    .filter(a => a.renderLevel !== 'OMIT')
    .map(a => ({
      ...a,
      skillTags: (() => { try { return JSON.parse(a.skillTags) } catch { return [] } })(),
      publishedAgo: parsePublishedAgo(a.classifiedAt),
    }))
}

function buildTheme(accentValue: string): Theme {
  const preset = ACCENT_PRESETS.find(p => p.value === accentValue) ?? ACCENT_PRESETS[0]!
  return { ...THEME_DARK, accent: preset.value, accentSoft: preset.soft }
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>([])
  const [idx, setIdx] = useState(0)
  const [swipeX, setSwipeX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [showAsk, setShowAsk] = useState(false)
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [briefDate, setBriefDate] = useState(() => getTaipeiDateString())
  const [springing, setSpringing] = useState(false)
  const [streak, setStreak] = useState(() => parseInt(localStorage.getItem('mb_streak') ?? '1'))
  const [accent] = useState<string>(
    () => localStorage.getItem('accent') ?? ACCENT_PRESETS[0]!.value
  )
  const [feedbackBarHeight, setFeedbackBarHeight] = useState(0)
  const [permissionResolved, setPermissionResolved] = useState(() => {
    if (!isPushSupported() || !isStandalone()) return true
    return Notification.permission !== 'default'
  })
  const [subscribing, setSubscribing] = useState(false)

  const T = buildTheme(accent)
  const dragStart = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null)
  const velocity = useRef<{ vx: number; lastX: number; lastT: number }>({ vx: 0, lastX: 0, lastT: 0 })
  const flyRotRef = useRef(12)
  const feedbackBarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const today = getTaipeiDateString()
    setBriefDate(today)
    fetch(`/api/feed?date=${today}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<FeedResponse>
      })
      .then(data => {
        setBriefDate(data.date ?? today)
        setArticles(parseArticles(data.articles))
        setLoading(false)
      })
      .catch(() => {
        setError('無法載入今日 brief')
        setLoading(false)
      })
  }, [])

  const atCelebration = idx >= articles.length && articles.length > 0
  const curArticle = !atCelebration && articles[idx] ? articles[idx] : null

  const advance = () => {
    setTransitioning(true)
    setTimeout(() => {
      setSwipeX(0)
      dragStart.current = null
      velocity.current = { vx: 0, lastX: 0, lastT: 0 }
      setIdx(i => {
        if (i === articles.length - 1) {
          const next = streak + 1
          setStreak(next)
          localStorage.setItem('mb_streak', String(next))
        }
        return i + 1
      })
      setTransitioning(false)
    }, 260)
  }

  const registerFeedback = (signal: 'up' | 'down') => {
    if (!curArticle) return
    flyRotRef.current = Math.min(Math.abs(velocity.current.vx) * 30 + 12, 28)
    setSwipeX(signal === 'up' ? 120 : -120)
    setFeedback(f => ({ ...f, [curArticle.id]: signal }))
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: curArticle.id, signal }),
    }).catch(() => {})
    advance()
  }

  const toggleSave = async () => {
    if (!curArticle) return
    const next = !saved[curArticle.id]
    setSaved(s => ({ ...s, [curArticle.id]: next }))
    if (next) {
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: curArticle.id }),
      }).catch(() => {})
    }
  }

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (atCelebration || showAsk || !curArticle) return
    const point = 'touches' in e ? e.touches[0] : e
    dragStart.current = { x: point.clientX, y: point.clientY, axis: null }
    velocity.current = { vx: 0, lastX: point.clientX, lastT: Date.now() }
  }

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStart.current) return
    const point = 'touches' in e ? e.touches[0] : e
    const dx = point.clientX - dragStart.current.x
    const dy = point.clientY - dragStart.current.y

    const now = Date.now()
    const dt = now - velocity.current.lastT
    if (dt > 8) {
      velocity.current.vx = (point.clientX - velocity.current.lastX) / dt
      velocity.current.lastX = point.clientX
      velocity.current.lastT = now
    }

    if (!dragStart.current.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      dragStart.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (dragStart.current.axis === 'x') {
      const resistance = 1 - Math.max(0, Math.abs(dx) - 60) * 0.003
      setSwipeX(dx * Math.max(resistance, 0.6))
    }
  }

  const onPointerUp = () => {
    if (!dragStart.current) return
    const vx = velocity.current.vx           // px/ms
    const isFlick = Math.abs(vx) > 0.4       // ~400 px/s threshold
    const overThreshold = Math.abs(swipeX) > 90

    if (dragStart.current.axis === 'x' && curArticle && (overThreshold || isFlick)) {
      flyRotRef.current = Math.min(Math.abs(vx) * 30 + 12, 28)
      const signal = (isFlick ? vx > 0 : swipeX > 0) ? 'up' : 'down'
      if (!overThreshold) setSwipeX(vx > 0 ? 100 : -100)
      setFeedback(f => ({ ...f, [curArticle.id]: signal }))
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: curArticle.id, signal }),
      }).catch(() => {})
      advance()
      return
    }
    if (dragStart.current?.axis === 'x' && Math.abs(swipeX) > 10) {
      setSpringing(true)
      setTimeout(() => setSpringing(false), 450)
    }
    setSwipeX(0)
    dragStart.current = null
  }

  useEffect(() => {
    const color = atCelebration ? T.card : T.bg
    document.documentElement.style.background = color
    document.body.style.background = color
  }, [atCelebration, T.bg, T.card])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showAsk) {
        if (e.key === 'Escape' || e.key === 'ArrowDown') setShowAsk(false)
        return
      }
      if (!curArticle) return
      if (e.key === 'ArrowRight') {
        setFeedback(f => ({ ...f, [curArticle.id]: 'up' }))
        setSwipeX(120)
        setTimeout(advance, 180)
      }
      if (e.key === 'ArrowLeft') {
        setFeedback(f => ({ ...f, [curArticle.id]: 'down' }))
        setSwipeX(-120)
        setTimeout(advance, 180)
      }
      if (e.key === 'ArrowUp') setShowAsk(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [curArticle, showAsk, swipeX])

  const dateLabel = formatBriefDateLong(briefDate)
  const showFeedbackBar = !!curArticle && !showAsk
  const cardBottomInset = showFeedbackBar ? `${feedbackBarHeight}px` : '0px'

  useLayoutEffect(() => {
    if (!showFeedbackBar || !feedbackBarRef.current) {
      setFeedbackBarHeight(0)
      return
    }
    const el = feedbackBarRef.current
    const updateHeight = () => setFeedbackBarHeight(el.getBoundingClientRect().height)
    updateHeight()
    const ro = new ResizeObserver(updateHeight)
    ro.observe(el)
    window.addEventListener('resize', updateHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [showFeedbackBar, curArticle?.id])

  if (loading || error || articles.length === 0 || !permissionResolved) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: T.bg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: 9, color: T.inkFaint,
          letterSpacing: 2.5, textTransform: 'uppercase',
          position: 'absolute',
          top: 'calc(24px + env(safe-area-inset-top))',
        }}>
          Vol. I · Daily Intelligence
        </div>

        <div style={{
          fontFamily: T.serif, fontSize: 28, fontStyle: 'italic', color: T.ink,
          fontWeight: 700, letterSpacing: -0.3,
          animation: loading ? 'breathe 2.2s ease-in-out infinite' : undefined,
        }}>
          The Morning Brief
        </div>

        <div style={{
          fontFamily: T.serif, fontSize: 13, fontStyle: 'italic',
          color: T.inkMuted, letterSpacing: 0.2,
          marginTop: -4,
        }}>
          a quiet briefing before the noise
        </div>

        {!loading && !permissionResolved && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              onClick={async () => {
                setSubscribing(true)
                await subscribeToPush()
                setSubscribing(false)
                setPermissionResolved(true)
              }}
              disabled={subscribing}
              style={{
                fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1,
                color: T.card, background: T.accent,
                border: 'none', borderRadius: 8, padding: '10px 24px',
                cursor: 'pointer', opacity: subscribing ? 0.6 : 1,
                textTransform: 'uppercase',
              }}
            >
              {subscribing ? '...' : '🔔 啟用推播通知'}
            </button>
            <button
              onClick={() => setPermissionResolved(true)}
              style={{
                fontFamily: T.mono, fontSize: 9, color: T.inkFaint,
                background: 'transparent', border: 'none',
                cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase',
              }}
            >
              略過
            </button>
          </div>
        )}

        {!loading && permissionResolved && (error || articles.length === 0) && (
          <div style={{
            fontFamily: T.mono, fontSize: 11, color: T.inkFaint,
            letterSpacing: 1, marginTop: 8,
          }}>
            {error ?? 'NO ARTICLES TODAY'}
          </div>
        )}

        <div style={{
          position: 'absolute',
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: T.mono, fontSize: 9, color: T.inkFaint,
          letterSpacing: 2.5, textTransform: 'uppercase',
        }}>
          <div style={{ width: 20, height: 1, background: T.ruleSoft }} />
          <span>{formatBriefDateLong(briefDate)} · Taipei</span>
          <div style={{ width: 20, height: 1, background: T.ruleSoft }} />
        </div>
      </div>
    )
  }

  const savedCount = Object.values(saved).filter(Boolean).length
  const currentChrome = atCelebration ? articles.length - 1 : idx

  return (
    <>
    {atCelebration && (
      <Celebration
        theme={T}
        savedCount={savedCount}
        streak={streak}
        readCount={articles.length}
        briefDate={briefDate}
      />
    )}
    <div style={{
      position: 'fixed', inset: 0,
      background: atCelebration ? T.card : T.bg,
      display: 'flex',
      justifyContent: 'center',
      visibility: atCelebration ? 'hidden' : 'visible',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, height: '100%',
        background: atCelebration ? T.card : T.bg,
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        fontFamily: T.sans,
      }}>
        {!atCelebration && (
          <TopChrome
            theme={T}
            current={currentChrome}
            total={articles.length}
            streak={streak}
            lastReadAgo="today"
            dateLabel={dateLabel}
          />
        )}

        <div
          style={{ flex: 1, overflow: 'hidden', position: 'relative', touchAction: 'pan-y', perspective: '1200px' }}
          onMouseDown={onPointerDown}
          onMouseMove={dragStart.current ? onPointerMove : undefined}
          onMouseUp={onPointerUp}
          onMouseLeave={dragStart.current ? onPointerUp : undefined}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        >
          {curArticle ? (
            <>
              {/* Next card — always visible underneath, floats up as current card flies */}
              {articles[idx + 1] && (
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  transform: `scale(${0.96 + Math.min(Math.abs(swipeX) / 90, 1) * 0.04}) translateY(${transitioning ? 0 : 10 - Math.min(Math.abs(swipeX) / 90, 1) * 10}px)`,
                  transition: transitioning
                    ? 'transform 0.42s cubic-bezier(0.22,1,0.36,1)'
                    : swipeX === 0
                    ? 'transform 0.35s cubic-bezier(0.22,1,0.36,1)'
                    : 'none',
                  transformOrigin: 'top center',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <ArticleCard article={articles[idx + 1]!} theme={T} swipeX={0} bottomInset={cardBottomInset} />
                </div>
              )}

              {/* Current card */}
              <div style={{
                position: 'absolute', inset: 0,
                transform: transitioning
                  ? `translateX(${swipeX > 0 ? 500 : -500}px) rotate(${swipeX > 0 ? 8 : -8}deg)`
                  : `translateX(${swipeX}px) rotate(${swipeX * 0.035}deg)`,
                transition: transitioning
                  ? 'transform 0.26s cubic-bezier(0.55,0,1,0.45)'
                  : springing
                  ? 'transform 0.38s cubic-bezier(0.175,0.885,0.32,1.275)'
                  : 'none',
                transformOrigin: 'center center',
                willChange: 'transform',
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: Math.abs(swipeX) > 10
                  ? `0 ${8 + Math.abs(swipeX) * 0.1}px ${24 + Math.abs(swipeX) * 0.2}px rgba(0,0,0,0.4)`
                  : '0 2px 8px rgba(0,0,0,0.2)',
              }}>
                <ArticleCard article={curArticle} theme={T} swipeX={swipeX} bottomInset={cardBottomInset} />
              </div>
            </>
          ) : null}

        </div>

        {showAsk && (
          <div
            onClick={() => setShowAsk(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(26,22,18,0.35)', zIndex: 25 }}
          />
        )}

        {curArticle && (
          <AskSheet
            theme={T}
            article={curArticle}
            visible={showAsk}
            onClose={() => setShowAsk(false)}
          />
        )}

        {showFeedbackBar && (
          <div
            ref={feedbackBarRef}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
              background: T.bg,
              borderTop: `1.5px solid ${T.ink}`,
              paddingBottom: 8,
              display: 'flex', justifyContent: 'center',
            }}
          >
            <div style={{ width: '100%', maxWidth: 480 }}>
            <FeedbackBar
              theme={T}
              feedback={feedback[curArticle!.id]}
              saved={saved[curArticle!.id] ?? false}
              onLike={() => registerFeedback('up')}
              onDislike={() => registerFeedback('down')}
              onAsk={() => setShowAsk(true)}
              onSave={toggleSave}
              onOpen={() => window.open(curArticle!.url, '_blank')}
            />
            </div>
          </div>
        )}

      </div>
    </div>
    </>
  )
}
