import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { THEME_DARK } from './theme.ts'
import { ArticleCard } from './components/Card.tsx'
import { TopChrome, FeedbackBar } from './components/Chrome.tsx'
import { isPushSupported, isStandalone, completeSubscription } from './push.ts'
import { Celebration } from './components/Celebration.tsx'
import { formatBriefDateLong, getTaipeiDateString } from './date.ts'
import type { Article, FeedResponse } from './types.ts'
import { apiFetch, fetchActivity, readCache, writeCache, type ActivityData } from './api.ts'
import { prefetchTodaysQuiz } from './quiz/session.ts'
import { fetchFeed, readLocalFeed, readPushPrefetchedFeed, writeLocalFeed } from './feedLoader.ts'
import { navigate } from './router.ts'
import { useNavInset } from './nav.ts'
import { SiftMark } from './components/icons.tsx'

// AskSheet pulls in react-markdown + remark-gfm (the bulk of the old bundle)
// but is only needed once someone taps ASK. Load it then, and prefetch it in
// the background after the brief is on screen.
const loadAskSheet = () => import('./components/AskSheet.tsx')
const AskSheet = lazy(() => loadAskSheet().then(m => ({ default: m.AskSheet })))

// The bottom nav owns the safe-area band and the home-indicator clearance that
// FEEDBACK_BAR_BOTTOM = 56 used to provide (Issue 6). The action row now just
// sits a short gap above the nav.
const FEEDBACK_BAR_GAP = 14
const FEEDBACK_DOCK_TOP_PAD = 18
const FEEDBACK_DOCK_MIN_HEIGHT = 76
const FEEDBACK_CONTENT_GAP = 16

// Cards float inset from the screen edges as rounded, raised sheets. They still
// run down under the glass dock + nav; ArticleCard's bottomInset keeps the text
// scrollable clear of both.
const CARD_FRAME: React.CSSProperties = {
  top: 4, left: 12, right: 12, bottom: 12,
  borderRadius: 24,
  overflow: 'hidden',
  border: '1px solid rgba(160,190,220,0.10)',
}

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

// Today's reading position + reactions survive leaving the tab (App unmounts on
// every tab switch) and iOS killing the PWA. Without this, coming back from
// Library or Quiz restarted the brief at card 1 with every 👍/🔖 cleared.
const FEED_SESSION_KEY = 'mb_feed_session'

interface FeedSession {
  date: string
  idx: number
  feedback: Record<string, 'up' | 'down'>
  saved: Record<string, boolean>
}

function readFeedSession(date: string): FeedSession | null {
  try {
    const raw = localStorage.getItem(FEED_SESSION_KEY)
    const s = raw ? JSON.parse(raw) as FeedSession : null
    if (!s || s.date !== date || !Number.isInteger(s.idx) || s.idx < 0) return null
    return { date, idx: s.idx, feedback: s.feedback ?? {}, saved: s.saved ?? {} }
  } catch {
    return null
  }
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>([])
  const [idx, setIdx] = useState(0)
  const [swipeX, setSwipeX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [showAsk, setShowAsk] = useState(false)
  // Mount the (lazy) AskSheet on first use and keep it mounted after, so its
  // close animation and per-article history behave as before.
  const [askMounted, setAskMounted] = useState(false)
  useEffect(() => { if (showAsk) setAskMounted(true) }, [showAsk])
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [briefDate, setBriefDate] = useState(() => getTaipeiDateString())
  const [springing, setSpringing] = useState(false)
  // One streak for the whole app, computed server-side from reading (feedback)
  // and quiz days. Replaces the old localStorage `mb_streak`, which +1'd on
  // every finish regardless of date and never reset.
  const [activity, setActivity] = useState<{ streak: number; activeToday: boolean }>(() => {
    // Last known value renders instantly; /api/activity refreshes it below.
    const cached = readCache<ActivityData>('activity')
    return { streak: cached?.streak ?? 0, activeToday: false }
  })
  const [feedbackBarHeight, setFeedbackBarHeight] = useState(0)
  const [permissionResolved, setPermissionResolved] = useState(() => {
    if (!isPushSupported() || !isStandalone()) return true
    return Notification.permission !== 'default'
  })
  const [subscribing, setSubscribing] = useState(false)

  const navInset = useNavInset()
  const T = THEME_DARK
  const dragStart = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null)
  const velocity = useRef<{ vx: number; lastX: number; lastT: number }>({ vx: 0, lastX: 0, lastT: 0 })
  const flyRotRef = useRef(12)
  const feedbackBarRef = useRef<HTMLDivElement | null>(null)
  const saveInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (isPushSupported() && isStandalone() && Notification.permission === 'granted') {
      void completeSubscription()
    }
  }, [])

  useEffect(() => {
    if (!subscribing) return
    const interval = setInterval(() => {
      if (Notification.permission !== 'default') {
        clearInterval(interval)
        setSubscribing(false)
        setPermissionResolved(true)
        if (Notification.permission === 'granted') void completeSubscription()
      }
    }, 500)
    return () => clearInterval(interval)
  }, [subscribing])

  useEffect(() => {
    fetchActivity()
      .then(a => {
        setActivity({ streak: a.streak, activeToday: a.activeToday ?? false })
        writeCache('activity', a)
      })
      .catch(() => {}) // streak chip just reads 0; never block the feed on it
  }, [])

  useEffect(() => {
    const today = getTaipeiDateString()
    setBriefDate(today)
    let cancelled = false
    // Ids of the list on screen. A later source with the same articles is a
    // no-op, so the network refresh never resets a brief already being read.
    let shownIds: string | null = null

    const apply = (data: FeedResponse) => {
      if (cancelled) return
      const date = data.date ?? today
      const parsed = parseArticles(data.articles)
      const ids = parsed.map(a => a.id).join(',')
      if (ids === shownIds) return
      const first = shownIds === null
      shownIds = ids
      if (first) {
        const session = readFeedSession(date)
        if (session) {
          setIdx(Math.min(session.idx, parsed.length))
          setFeedback(session.feedback)
          setSaved(session.saved)
        }
        // The brief is on screen; fetch today's quiz set in the background so
        // 「去答今天的判斷題」/ the Quiz tab opens with no spinner.
        setTimeout(prefetchTodaysQuiz, 1500)
        setTimeout(() => { void loadAskSheet() }, 2000)
      } else {
        setIdx(i => Math.min(i, parsed.length))
      }
      setBriefDate(date)
      setArticles(parsed)
      setLoading(false)
    }

    // Fastest source first (see feedLoader.ts); the network copy always runs
    // and refreshes the cache.
    const local = readLocalFeed(today)
    if (local) apply(local)
    else void readPushPrefetchedFeed(today).then(d => { if (d && shownIds === null) apply(d) })

    fetchFeed(today)
      .then(data => {
        writeLocalFeed(data.date ?? today, data)
        apply(data)
      })
      .catch(() => {
        if (cancelled || shownIds !== null) return // a cached copy is already on screen
        setError('無法載入今日 brief')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (articles.length === 0) return
    try {
      localStorage.setItem(FEED_SESSION_KEY, JSON.stringify({ date: briefDate, idx, feedback, saved }))
    } catch { /* private mode / quota */ }
  }, [articles.length, briefDate, idx, feedback, saved])

  const atCelebration = idx >= articles.length && articles.length > 0
  const curArticle = !atCelebration && articles[idx] ? articles[idx] : null

  const advance = () => {
    setTransitioning(true)
    setTimeout(() => {
      setSwipeX(0)
      dragStart.current = null
      velocity.current = { vx: 0, lastX: 0, lastT: 0 }
      setIdx(i => i + 1)
      setTransitioning(false)
    }, 260)
  }

  // Undo: step back one card and withdraw the 👍/👎 it received, so a
  // mis-swipe doesn't feed the classifier's preference signal.
  const undo = () => {
    if (transitioning || idx === 0) return
    const prev = articles[idx - 1]
    if (!prev) return
    setSwipeX(0)
    setIdx(idx - 1)
    if (feedback[prev.id]) {
      setFeedback(f => {
        const next = { ...f }
        delete next[prev.id]
        return next
      })
      apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: prev.id, signal: 'clear' }),
      }).catch(() => {})
    }
  }

  const registerFeedback = (signal: 'up' | 'down') => {
    if (!curArticle) return
    flyRotRef.current = Math.min(Math.abs(velocity.current.vx) * 30 + 12, 28)
    setSwipeX(signal === 'up' ? 120 : -120)
    setFeedback(f => ({ ...f, [curArticle.id]: signal }))
    apiFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: curArticle.id, signal }),
    }).catch(() => {})
    advance()
  }

  const toggleSave = async () => {
    if (!curArticle) return
    const articleId = curArticle.id
    if (saveInFlightRef.current.has(articleId)) return
    saveInFlightRef.current.add(articleId)
    const prev = saved[articleId] ?? false
    const next = !prev
    setSaved(s => ({ ...s, [articleId]: next }))
    try {
      const res = await apiFetch(next ? '/api/save' : '/api/unsave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean }
      if (!res.ok || !data.ok) throw new Error(`save toggle failed (${res.status})`)
    } catch {
      setSaved(s => ({ ...s, [articleId]: prev }))
    } finally {
      saveInFlightRef.current.delete(articleId)
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
      // apiFetch, not bare fetch: the swipe is the primary way feedback is
      // given, and bare fetch omits the X-Device-Id header, so those rows were
      // landing unattributed while the button path recorded them per-device.
      apiFetch('/api/feedback', {
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

  // The celebration paints html/body in the card colour; put the page colour
  // back when leaving the Feed tab (e.g. 「去答今天的判斷題」), or every other
  // tab inherits the wrong background in overscroll / safe-area bands.
  useEffect(() => () => {
    document.documentElement.style.background = T.bg
    document.body.style.background = T.bg
  }, [T.bg])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showAsk) {
        if (e.key === 'Escape' || e.key === 'ArrowDown') setShowAsk(false)
        return
      }
      if (!curArticle) return
      // Through registerFeedback so the signal is actually POSTed — the arrow
      // keys used to set local state only, and the row never reached the DB.
      if (e.key === 'ArrowRight') registerFeedback('up')
      if (e.key === 'ArrowLeft') registerFeedback('down')
      if (e.key === 'ArrowUp') setShowAsk(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [curArticle, showAsk, swipeX])

  const dateLabel = formatBriefDateLong(briefDate)
  const showFeedbackBar = !!curArticle && !showAsk
  const dockHeight = Math.max(
    FEEDBACK_DOCK_MIN_HEIGHT,
    feedbackBarHeight + FEEDBACK_BAR_GAP + FEEDBACK_DOCK_TOP_PAD,
  )
  const cardBottomInset = showFeedbackBar && feedbackBarHeight > 0
    ? `${navInset + dockHeight + FEEDBACK_CONTENT_GAP}px`
    : `${navInset}px`

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
        {/* Launch screen: the home-screen icon's mark, so opening the app
            reads as one continuous motion from icon to content. */}
        <div style={{ animation: loading ? 'breathe 2.2s ease-in-out infinite' : undefined }}>
          <SiftMark size={56} color={T.accent} glow />
        </div>

        <div style={{
          fontFamily: T.sans, fontSize: 30, fontWeight: 800, color: T.ink,
          letterSpacing: -0.6, marginTop: 10,
        }}>
          Sift
        </div>

        <div style={{
          fontFamily: T.sans, fontSize: 13, color: T.inkMuted, letterSpacing: 0.4,
          marginTop: -2,
        }}>
          篩掉雜訊，留下訊號
        </div>

        {!loading && !permissionResolved && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button
              onClick={async () => {
                setSubscribing(true)
                try { await Notification.requestPermission() } catch { /* ignore */ }
                if (Notification.permission !== 'default') {
                  setSubscribing(false)
                  setPermissionResolved(true)
                  if (Notification.permission === 'granted') void completeSubscription()
                }
              }}
              disabled={subscribing}
              style={{
                fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                color: T.onAccent, background: T.accent,
                border: 'none', borderRadius: 14, padding: '12px 24px',
                cursor: 'pointer', opacity: subscribing ? 0.6 : 1,
                textTransform: 'uppercase',
              }}
            >
              {subscribing ? (
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', height: 12 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      display: 'inline-block', width: 4, height: 4,
                      borderRadius: '50%', background: 'currentColor',
                      animation: `dotBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
                    }} />
                  ))}
                </span>
              ) : '啟用推播通知'}
            </button>
            <button
              onClick={() => setPermissionResolved(true)}
              style={{
                fontFamily: T.mono, fontSize: 11, color: T.inkFaint,
                background: 'transparent', border: 'none',
                cursor: 'pointer', letterSpacing: 0.3, textTransform: 'uppercase',
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
          bottom: navInset + 24,
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: T.mono, fontSize: 11, color: T.inkFaint,
          letterSpacing: 1.5, textTransform: 'uppercase',
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
        // Finishing the brief makes today count, even if /api/activity was
        // fetched before the last swipe landed.
        streak={activity.activeToday ? activity.streak : activity.streak + 1}
        readCount={articles.length}
        briefDate={briefDate}
        onGoQuiz={() => navigate('/quiz')}
        onUndo={undo}
      />
    )}
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: '100%',
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
            streak={activity.streak}
            dateLabel={dateLabel}
            onUndo={idx > 0 ? undo : undefined}
          />
        )}

        <div
          style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', touchAction: 'pan-y', perspective: '1200px' }}
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
                  position: 'absolute', pointerEvents: 'none',
                  transform: `scale(${0.96 + Math.min(Math.abs(swipeX) / 90, 1) * 0.04}) translateY(${transitioning ? 0 : 10 - Math.min(Math.abs(swipeX) / 90, 1) * 10}px)`,
                  transition: transitioning
                    ? 'transform 0.42s cubic-bezier(0.22,1,0.36,1)'
                    : swipeX === 0
                    ? 'transform 0.35s cubic-bezier(0.22,1,0.36,1)'
                    : 'none',
                  transformOrigin: 'top center',
                  ...CARD_FRAME,
                }}>
                  <ArticleCard article={articles[idx + 1]!} theme={T} swipeX={0} bottomInset={cardBottomInset} />
                </div>
              )}

              {/* Current card */}
              <div style={{
                position: 'absolute',
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
                ...CARD_FRAME,
                boxShadow: Math.abs(swipeX) > 10
                  ? `0 ${12 + Math.abs(swipeX) * 0.1}px ${32 + Math.abs(swipeX) * 0.2}px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`
                  : '0 18px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
                <ArticleCard article={curArticle} theme={T} swipeX={swipeX} bottomInset={cardBottomInset} />
              </div>
            </>
          ) : null}

        </div>

        {showAsk && (
          <div
            onClick={() => setShowAsk(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(4,8,12,0.55)', zIndex: 55 }}
          />
        )}

        {curArticle && askMounted && (
          <Suspense fallback={null}>
            <AskSheet
              theme={T}
              article={curArticle}
              visible={showAsk}
              onClose={() => setShowAsk(false)}
            />
          </Suspense>
        )}

      </div>
      {showFeedbackBar && (
        <>
          <div
            ref={feedbackBarRef}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: navInset + FEEDBACK_BAR_GAP,
              width: '100%',
              maxWidth: 480,
              transform: 'translateX(-50%)',
              zIndex: 40,
            }}
          >
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
        </>
      )}
    </div>
    </>
  )
}
