import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Theme } from '../theme.ts'
import type { Article } from '../types.ts'
import { apiFetch } from '../api.ts'
import { loadAskHistory, saveAskHistory } from '../askHistory.ts'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Quiz follow-ups: what the model is allowed to know tracks the question's
 * state. Before answering it gets the question + answer-free material only
 * (api/ask.ts is told not to reveal the answer); once answered it also gets
 * the user's answer, the key and the explanation.
 */
export interface QuizAskContext {
  prompt: string
  material: string
  answered: boolean
  correct?: boolean
  yourAnswer?: string
  correctAnswer?: string
  explanation?: string
}

interface AskSheetProps {
  theme: Theme
  article: Article
  /** Present when the sheet is asking about a quiz question, not an article. */
  quiz?: QuizAskContext
  visible: boolean
  onClose: () => void
  fullScreen?: boolean
  onHistorySaved?: (articleId: string, messageCount: number) => void
}

const INTRO_MESSAGE: Message = {
  role: 'assistant',
  text: '讀完這篇，有幾個後端工程師視角的追問想跟你聊：',
}

// Shown when per-article suggestions can't be generated (offline, API error).
const FALLBACK_SUGGESTIONS = [
  '這件事對後端工程師實際的影響是？',
  '如果要導入，第一個要擔心什麼？',
]

function quizIntro(q: QuizAskContext): string {
  if (!q.answered) return '還沒作答也可以問，我不會直接講答案：'
  return q.correct ? '答對了。想再挖深一點可以問：' : '這題哪裡卡住？可以從這裡開始：'
}

function quizSuggestions(q: QuizAskContext): string[] {
  if (!q.answered) return ['給我一個提示，先別講答案', '這題在考什麼觀念？']
  if (q.correct) return ['什麼情況下答案會不一樣？', '實務上哪裡會踩到這個？']
  const mine = q.yourAnswer && !q.yourAnswer.includes('\n') && q.yourAnswer.length <= 28
    ? `我選「${q.yourAnswer}」為什麼不對？`
    : '我的答案錯在哪裡？'
  return [mine, '用一個實際例子解釋正確答案']
}

// Article suggestions are generated per article by api/ask.ts (mode: 'suggest')
// and cached per article, so each article costs at most one small Haiku call.
const SUGGEST_CACHE_PREFIX = 'mb_ask_suggest_'

function readCachedSuggestions(articleId: string): string[] | null {
  try {
    const raw = localStorage.getItem(SUGGEST_CACHE_PREFIX + articleId)
    const parsed = raw ? JSON.parse(raw) as unknown : null
    return Array.isArray(parsed) && parsed.every(s => typeof s === 'string') && parsed.length > 0
      ? parsed as string[]
      : null
  } catch {
    return null
  }
}

function useArticleSuggestions(article: Article, enabled: boolean): string[] | null {
  const [suggestions, setSuggestions] = useState<string[] | null>(() => readCachedSuggestions(article.id))

  useEffect(() => {
    const cached = readCachedSuggestions(article.id)
    setSuggestions(cached)
    if (cached || !enabled) return
    let cancelled = false
    apiFetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'suggest',
        articleTitle: article.title,
        articleSummary: article.summary,
        articleContext: article.context,
      }),
    })
      .then(r => r.ok ? r.json() as Promise<{ suggestions?: unknown }> : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(({ suggestions: s }) => {
        if (cancelled) return
        const list = Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 3) : []
        if (list.length === 0) throw new Error('empty suggestions')
        try { localStorage.setItem(SUGGEST_CACHE_PREFIX + article.id, JSON.stringify(list)) } catch { /* quota */ }
        setSuggestions(list)
      })
      .catch(() => { if (!cancelled) setSuggestions(FALLBACK_SUGGESTIONS) })
    return () => { cancelled = true }
  }, [article.id, enabled])

  return suggestions
}

/**
 * iOS standalone doesn't shrink the layout when the keyboard opens — it
 * scrolls the page so the input is visible, which pushed the sheet's header
 * (and the question) off the top. While the keyboard is up, pin the sheet to
 * the visual viewport instead: top = where the visible area starts, height =
 * what's left above the keyboard. Only the modal sheet does this; the app
 * shell keeps its CSS layout (FRONTEND_FIX_LOG Issue 6 rejected sizing the
 * shell from visualViewport).
 */
function useKeyboardFrame(sheetRef: React.RefObject<HTMLDivElement>, active: boolean) {
  const [frame, setFrame] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) { setFrame(null); return }
    // Baseline = the keyboard-free height. NOT window.innerHeight: iOS shrinks
    // innerHeight together with the visual viewport when the keyboard opens,
    // so innerHeight − vv.height stays ~0 and the keyboard was never detected
    // (first real-device test, 2026-09-30). The layout viewport
    // (documentElement.clientHeight) doesn't move with the keyboard; the
    // tallest vv height seen while open backs it up.
    let baseline = Math.max(document.documentElement.clientHeight, vv.height)
    const update = () => {
      baseline = Math.max(baseline, vv.height)
      const host = sheetRef.current?.offsetParent as HTMLElement | null | undefined
      // A keyboard takes well over 120px; smaller deltas are toolbar/URL-bar noise.
      if (!host || baseline - vv.height < 120) { setFrame(null); return }
      setFrame({ top: vv.offsetTop - host.getBoundingClientRect().top, height: vv.height })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setFrame(null)
    }
  }, [active, sheetRef])

  return frame
}

function AssistantMarkdown({ text, theme }: { text: string; theme: Theme }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p style={{ margin: '0 0 10px' }}>{children}</p>
        ),
        h1: ({ children }) => (
          <h2 style={{
            margin: '0 0 10px',
            fontFamily: theme.serif,
            fontSize: 17,
            lineHeight: 1.35,
            fontWeight: 700,
          }}>{children}</h2>
        ),
        h2: ({ children }) => (
          <h3 style={{
            margin: '14px 0 8px',
            fontFamily: theme.serif,
            fontSize: 15,
            lineHeight: 1.35,
            fontWeight: 700,
          }}>{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 style={{
            margin: '12px 0 6px',
            fontFamily: theme.sans,
            fontSize: 14,
            lineHeight: 1.35,
            fontWeight: 700,
          }}>{children}</h4>
        ),
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ margin: '0 0 10px', paddingLeft: 18 }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ marginBottom: 5, paddingLeft: 2 }}>{children}</li>
        ),
        strong: ({ children }) => (
          <strong style={{ fontWeight: 750 }}>{children}</strong>
        ),
        hr: () => (
          <div style={{ height: 1, background: theme.ruleSoft, margin: '12px 0' }} />
        ),
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" style={{ color: theme.accent }}>
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code style={{
            fontFamily: theme.mono,
            fontSize: '0.92em',
            background: theme.card,
            border: `1px solid ${theme.ruleSoft}`,
            borderRadius: 5,
            padding: '1px 4px',
          }}>{children}</code>
        ),
        pre: ({ children }) => (
          <pre style={{
            margin: '0 0 10px',
            overflowX: 'auto',
            whiteSpace: 'pre',
            WebkitOverflowScrolling: 'touch',
          }}>{children}</pre>
        ),
        table: ({ children }) => (
          <div style={{
            overflowX: 'auto',
            margin: '0 0 10px',
            WebkitOverflowScrolling: 'touch',
          }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{
            border: `1px solid ${theme.ruleSoft}`,
            padding: '5px 7px',
            textAlign: 'left',
            fontWeight: 700,
          }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{
            border: `1px solid ${theme.ruleSoft}`,
            padding: '5px 7px',
            verticalAlign: 'top',
          }}>{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function historyToMessages(history: ApiMessage[]): Message[] {
  return [
    INTRO_MESSAGE,
    ...history.map((m): Message => ({ role: m.role, text: m.content })),
  ]
}

export function AskSheet({
  theme,
  article,
  quiz,
  visible,
  onClose,
  fullScreen = false,
  onHistorySaved,
}: AskSheetProps) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INTRO_MESSAGE])
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const streamedAssistantTextRef = useRef('')
  const flushFrameRef = useRef<number | null>(null)
  const activeRequestRef = useRef<AbortController | null>(null)
  const historyLoadedArticleRef = useRef<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [contextExpanded, setContextExpanded] = useState(false)
  const keyboardFrame = useKeyboardFrame(sheetRef, visible)
  const hasConversation = messages.some(m => m.role === 'user')
  // Only generate once history has loaded and turned out empty — a thread with
  // history never shows suggestions, so don't pay for them.
  const articleSuggestions = useArticleSuggestions(
    article,
    visible && !quiz && !hasConversation && !historyLoading && historyLoadedArticleRef.current === article.id,
  )

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = messageListRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  const updateStickiness = () => {
    const el = messageListRef.current
    if (!el) return
    shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const flushAssistantText = () => {
    flushFrameRef.current = null
    const nextText = streamedAssistantTextRef.current
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant' || last.text === nextText) return prev
      return [...prev.slice(0, -1), { role: 'assistant', text: nextText }]
    })
  }

  const scheduleAssistantFlush = () => {
    if (flushFrameRef.current !== null) return
    flushFrameRef.current = requestAnimationFrame(flushAssistantText)
  }

  const cancelScheduledFlush = () => {
    if (flushFrameRef.current === null) return
    cancelAnimationFrame(flushFrameRef.current)
    flushFrameRef.current = null
  }

  const stopActiveRequest = () => {
    activeRequestRef.current?.abort()
    activeRequestRef.current = null
    cancelScheduledFlush()
    streamedAssistantTextRef.current = ''
  }

  const dropPendingAssistant = () => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      return prev.slice(0, -1)
    })
  }

  useEffect(() => {
    if (visible) {
      setMounted(true)
      const id = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(id)
    } else {
      const hadActiveRequest = !!activeRequestRef.current
      stopActiveRequest()
      if (hadActiveRequest) {
        setLoading(false)
        dropPendingAssistant()
      }
      setEntered(false)
      const t = setTimeout(() => setMounted(false), 350)
      return () => clearTimeout(t)
    }
  }, [visible])

  useEffect(() => {
    if (!mounted || !shouldStickToBottomRef.current) return
    const id = requestAnimationFrame(() => {
      scrollToBottom(loading ? 'auto' : 'smooth')
      updateStickiness()
    })
    return () => cancelAnimationFrame(id)
  }, [messages, loading, mounted])

  useEffect(() => {
    if (!visible) return
    shouldStickToBottomRef.current = true
    const id = requestAnimationFrame(() => {
      scrollToBottom('auto')
      updateStickiness()
    })
    return () => cancelAnimationFrame(id)
  }, [visible])

  const persistHistory = async (articleId: string, history: ApiMessage[]) => {
    const count = await saveAskHistory(articleId, history)
    if (count !== null) onHistorySaved?.(articleId, count)
  }

  // Reset state when article changes
  useEffect(() => {
    stopActiveRequest()
    setMessages([INTRO_MESSAGE])
    setApiHistory([])
    setInput('')
    setLoading(false)
    setHistoryLoading(false)
    setContextExpanded(false)
    historyLoadedArticleRef.current = null
    shouldStickToBottomRef.current = true
  }, [article.id])

  useEffect(() => {
    if (!visible || historyLoadedArticleRef.current === article.id) return

    let cancelled = false
    const articleId = article.id
    setHistoryLoading(true)
    loadAskHistory(articleId)
      .then(({ messages: history, messageCount }) => {
        if (cancelled || article.id !== articleId) return
        historyLoadedArticleRef.current = articleId
        setHistoryLoading(false)
        if (history.length === 0) return
        setApiHistory(prev => prev.length > 0 ? prev : history)
        setMessages(prev => prev.some(m => m.role === 'user') ? prev : historyToMessages(history))
        onHistorySaved?.(articleId, messageCount)
      })
      .catch(() => {
        if (!cancelled) historyLoadedArticleRef.current = articleId
        if (!cancelled) setHistoryLoading(false)
      })

    return () => {
      cancelled = true
      setHistoryLoading(false)
    }
  }, [article.id, visible, onHistorySaved])

  useEffect(() => () => stopActiveRequest(), [])

  if (!mounted) return null

  // Quiz suggestions follow the question's state, so they stay available mid-
  // thread (e.g. ask for a hint, answer wrong, then "why was mine wrong?").
  // Article suggestions only open an empty thread.
  const asked = new Set(messages.filter(m => m.role === 'user').map(m => m.text))
  const suggestions = quiz
    ? (loading ? [] : quizSuggestions(quiz).filter(s => !asked.has(s)))
    : hasConversation ? [] : articleSuggestions
  // Once a thread exists its opener stays put rather than rewriting history.
  const introText = quiz
    ? (hasConversation ? '關於這題：' : quizIntro(quiz))
    : INTRO_MESSAGE.text

  const sendMessage = async (text: string) => {
    if (loading || historyLoading || !text.trim()) return

    const newApiHistory: ApiMessage[] = [...apiHistory, { role: 'user', content: text }]
    streamedAssistantTextRef.current = ''
    shouldStickToBottomRef.current = true
    cancelScheduledFlush()
    setApiHistory(newApiHistory)
    setMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }])
    setInput('')
    setLoading(true)

    try {
      const controller = new AbortController()
      activeRequestRef.current = controller

      const response = await apiFetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          articleTitle: article.title,
          articleSummary: article.summary,
          articleContext: article.context,
          ...(quiz ? { quiz } : {}),
          messages: newApiHistory,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') continue
          try {
            streamedAssistantTextRef.current += JSON.parse(raw) as string
            scheduleAssistantFlush()
          } catch {
            // skip malformed chunk
          }
        }
      }

      cancelScheduledFlush()
      flushAssistantText()
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null
      }
      const completedHistory: ApiMessage[] = [
        ...newApiHistory,
        { role: 'assistant', content: streamedAssistantTextRef.current },
      ]
      setApiHistory(completedHistory)
      void persistHistory(article.id, completedHistory)
    } catch (error) {
      cancelScheduledFlush()
      if ((error as Error).name === 'AbortError') return
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', text: '抱歉，發生錯誤，請再試一次。' },
      ])
    } finally {
      activeRequestRef.current = null
      setLoading(false)
    }
  }

  return (
    <div ref={sheetRef} style={{
      position: 'absolute',
      left: 0, right: 0,
      // Keyboard up: occupy exactly the visible area above it (useKeyboardFrame).
      // Otherwise fullScreen fills the host layer (top+bottom pinned) rather
      // than assuming 100dvh: inside the quiz frame the host is shorter than
      // the dynamic viewport, and a fixed 100dvh pushed the header off-screen.
      ...(keyboardFrame
        ? { top: keyboardFrame.top, height: keyboardFrame.height }
        : fullScreen ? { top: 0, bottom: 0 } : { bottom: 0, height: '82%' }),
      background: theme.card,
      // With the keyboard up every sheet reaches the top of the screen, so it
      // takes the full-screen chrome (square corners, status-bar padding).
      borderTopLeftRadius: fullScreen || keyboardFrame ? 0 : 24,
      borderTopRightRadius: fullScreen || keyboardFrame ? 0 : 24,
      borderTop: fullScreen ? 'none' : `1px solid ${theme.glassEdge}`,
      overflow: 'hidden',
      transform: entered ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
      // Above the bottom nav (z 50): the ask sheet is a modal takeover.
      zIndex: 60,
      display: 'flex', flexDirection: 'column',
      boxShadow: !fullScreen && entered ? '0 -16px 48px rgba(0,0,0,0.45)' : 'none',
    }}>
      {!fullScreen && !keyboardFrame && (
        <div style={{ padding: '8px 0 2px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 5, borderRadius: 999, background: 'rgba(160,190,220,0.25)' }} />
        </div>
      )}

      <div style={{
        padding: fullScreen || keyboardFrame
          ? 'calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px'
          : '8px 20px 12px',
        borderBottom: `1px solid ${theme.ruleSoft}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 11, color: theme.inkFaint,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>Ask Claude · Haiku 4.5</div>
          <div style={{
            fontFamily: theme.serif, fontSize: 14, color: theme.ink,
            fontWeight: 600,
            // Two lines: one line cut most titles mid-thought.
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>{quiz ? '追問這題' : article.title}</div>
        </div>
        <button className="btn-press" aria-label="關閉" onClick={onClose} style={{
          background: theme.raised, border: 'none', borderRadius: 999,
          boxShadow: theme.highlight,
          width: 30, height: 30, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.mono, fontSize: 12, color: theme.ink,
          cursor: 'pointer',
        }}>✕</button>
      </div>

      {quiz && (
        // Pinned outside the scrolling thread, so the question stays in view
        // while typing. Collapsed to three lines; tap to see all of it plus
        // (once answered) your answer next to the key.
        <button
          onClick={() => setContextExpanded(v => !v)}
          aria-expanded={contextExpanded}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: theme.raised, border: 'none',
            borderBottom: `1px solid ${theme.ruleSoft}`,
            padding: '12px 20px', cursor: 'pointer',
            maxHeight: contextExpanded ? '45%' : undefined,
            overflowY: contextExpanded ? 'auto' : 'hidden',
            flexShrink: 0,
          }}
        >
          <div style={{
            fontFamily: theme.sans, fontSize: 14, lineHeight: 1.5, color: theme.ink, fontWeight: 600,
            ...(contextExpanded ? {} : {
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }),
          }}>{quiz.prompt}</div>
          {quiz.answered && !contextExpanded && (
            <div style={{
              marginTop: 6, fontFamily: theme.sans, fontSize: 12,
              color: quiz.correct ? theme.positive : theme.negative,
            }}>{quiz.correct ? '✓ 你答對了' : '✕ 你答錯了'} · 點開看答案</div>
          )}
          {contextExpanded && quiz.answered && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quiz.yourAnswer && (
                <ContextLine theme={theme} label="你的答案" text={quiz.yourAnswer}
                  color={quiz.correct ? theme.positive : theme.negative} />
              )}
              {!quiz.correct && quiz.correctAnswer && (
                <ContextLine theme={theme} label="正確答案" text={quiz.correctAnswer} color={theme.positive} />
              )}
            </div>
          )}
          {contextExpanded && !quiz.answered && quiz.material && (
            <div style={{
              marginTop: 10, fontFamily: theme.sans, fontSize: 13, lineHeight: 1.55,
              color: theme.inkMuted, whiteSpace: 'pre-wrap',
            }}>{quiz.material}</div>
          )}
        </button>
      )}

      <div
        ref={messageListRef}
        onScroll={updateStickiness}
        style={{
        flex: 1, overflowY: 'auto', padding: '14px 20px',
        display: 'flex', flexDirection: 'column', gap: 12,
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        overflowAnchor: 'none',
      }}>
        {messages.map((m, i) => {
          const isLoadingPlaceholder = loading && i === messages.length - 1 && m.role === 'assistant' && m.text === ''
          if (isLoadingPlaceholder) return (
            <div key={i} style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              background: theme.raised,
              borderRadius: 18,
              borderBottomLeftRadius: 6,
              padding: '12px 14px',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: theme.ink,
                  animation: `dotBounce 1.1s ease-in-out ${j * 0.18}s infinite`,
                }} />
              ))}
            </div>
          )
          return (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: m.role === 'user' ? '85%' : '92%',
              background: m.role === 'user' ? theme.accent : theme.raised,
              color: m.role === 'user' ? theme.onAccent : theme.ink,
              padding: '10px 14px',
              borderRadius: 18,
              ...(m.role === 'user' ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }),
              fontFamily: theme.sans, fontSize: 14, lineHeight: 1.5,
              overflowWrap: 'anywhere',
            }}>
              {m.role === 'assistant'
                ? <AssistantMarkdown text={m === INTRO_MESSAGE ? introText : m.text} theme={theme} />
                : m.text}
            </div>
          )
        })}

        {!historyLoading && (suggestions === null || suggestions.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {suggestions === null && [0, 1, 2].map(i => (
              // Placeholder while this article's suggestions are generated (~1s).
              <div key={i} style={{
                height: 42, borderRadius: 14, background: theme.raised,
                animation: `askShimmer 1.2s ease-in-out ${i * 0.12}s infinite`,
              }} />
            ))}
            {suggestions?.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)} style={{
                textAlign: 'left',
                background: theme.raised,
                border: 'none',
                boxShadow: theme.highlight,
                borderRadius: 14,
                padding: '11px 14px',
                fontFamily: theme.sans, fontSize: 14,
                color: theme.ink, cursor: 'pointer',
              }}>→ {s}</button>
            ))}
          </div>
        )}

        <div style={{ height: 1 }} />
      </div>

      <div style={{
        borderTop: `1px solid ${theme.ruleSoft}`,
        padding: '10px 14px',
        // The keyboard covers the home-indicator band, so drop the safe-area
        // padding while it's up.
        paddingBottom: keyboardFrame ? 10 : 'calc(10px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && sendMessage(input.trim())}
          placeholder={historyLoading ? '載入對話…' : loading ? '思考中…' : '繼續追問…'}
          disabled={loading || historyLoading}
          style={{
            flex: 1, background: theme.raised,
            border: `1px solid ${theme.ruleSoft}`, borderRadius: 999,
            padding: '11px 16px',
            fontFamily: theme.sans, fontSize: 14, color: theme.ink,
            outline: 'none', opacity: loading ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => sendMessage(input.trim())}
          disabled={loading || historyLoading || !input.trim()}
          style={{
            background: theme.accent, color: theme.onAccent,
            border: 'none', borderRadius: 999,
            padding: '0 16px',
            fontFamily: theme.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: 0.5, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || historyLoading || !input.trim() ? 0.5 : 1,
          }}
        >SEND</button>
      </div>
    </div>
  )
}

function ContextLine({ theme, label, text, color }: {
  theme: Theme; label: string; text: string; color: string
}) {
  return (
    <div>
      <div style={{ fontFamily: theme.mono, fontSize: 11, color, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontFamily: theme.sans, fontSize: 13, lineHeight: 1.55, color: theme.inkMuted,
        whiteSpace: 'pre-wrap',
      }}>{text}</div>
    </div>
  )
}
