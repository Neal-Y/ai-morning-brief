import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Theme } from '../theme.ts'
import type { Article } from '../types.ts'
import { apiFetch } from '../api.ts'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AskSheetProps {
  theme: Theme
  article: Article
  visible: boolean
  onClose: () => void
  fullScreen?: boolean
  onHistorySaved?: (articleId: string, messageCount: number) => void
}

interface AskHistoryResponse {
  ok?: boolean
  messages?: ApiMessage[]
  messageCount?: number
}

const INTRO_MESSAGE: Message = {
  role: 'assistant',
  text: '讀完這篇，有幾個後端工程師視角的追問想跟你聊：',
}

const SUGGESTIONS = [
  '這跟競品比有什麼 trade-off？',
  'production 導入，第一個要擔心什麼？',
  '對我的 backend 架構影響最大的點是？',
]

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
            borderRadius: 3,
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
    if (history.length === 0) return
    try {
      const response = await apiFetch('/api/ask-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, messages: history }),
      })
      const data = await response.json().catch(() => ({})) as AskHistoryResponse
      if (response.ok && data.ok) {
        onHistorySaved?.(articleId, data.messageCount ?? history.length)
      }
    } catch {
      // Ask still works if history persistence is temporarily unavailable.
    }
  }

  // Reset state when article changes
  useEffect(() => {
    stopActiveRequest()
    setMessages([INTRO_MESSAGE])
    setApiHistory([])
    setInput('')
    setLoading(false)
    setHistoryLoading(false)
    historyLoadedArticleRef.current = null
    shouldStickToBottomRef.current = true
  }, [article.id])

  useEffect(() => {
    if (!visible || historyLoadedArticleRef.current === article.id) return

    let cancelled = false
    const articleId = article.id
    setHistoryLoading(true)
    apiFetch(`/api/ask-history?articleId=${articleId}`)
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<AskHistoryResponse>
      })
      .then(data => {
        if (cancelled || article.id !== articleId) return
        historyLoadedArticleRef.current = articleId
        const history = Array.isArray(data.messages) ? data.messages : []
        setHistoryLoading(false)
        if (history.length === 0) return
        setApiHistory(prev => prev.length > 0 ? prev : history)
        setMessages(prev => prev.some(m => m.role === 'user') ? prev : historyToMessages(history))
        onHistorySaved?.(articleId, data.messageCount ?? history.length)
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

  const hasConversation = messages.some(m => m.role === 'user')

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
    <div style={{
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      height: fullScreen ? '100dvh' : '82%',
      background: theme.card,
      borderTopLeftRadius: fullScreen ? 0 : 16,
      borderTopRightRadius: fullScreen ? 0 : 16,
      borderTop: fullScreen ? 'none' : `2px solid ${theme.ink}`,
      overflow: 'hidden',
      transform: entered ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
      zIndex: 30,
      display: 'flex', flexDirection: 'column',
      boxShadow: !fullScreen && entered ? '0 -12px 40px rgba(26,22,18,0.18)' : 'none',
    }}>
      {!fullScreen && (
        <div style={{ padding: '8px 0 2px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 3, background: theme.ruleSoft }} />
        </div>
      )}

      <div style={{
        padding: fullScreen
          ? 'calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px'
          : '8px 20px 12px',
        borderBottom: `1px solid ${theme.ruleSoft}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
            letterSpacing: 1.5, textTransform: 'uppercase',
          }}>Ask Claude · Haiku 4.5</div>
          <div style={{
            fontFamily: theme.serif, fontSize: 14, color: theme.ink,
            fontWeight: 600, fontStyle: 'italic',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{article.title}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${theme.ink}`, borderRadius: 8,
          width: 26, height: 26, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.mono, fontSize: 12, color: theme.ink,
          cursor: 'pointer',
        }}>✕</button>
      </div>

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
              background: theme.bg,
              border: `1px solid ${theme.ruleSoft}`,
              borderRadius: 2,
              padding: '10px 14px',
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
              background: m.role === 'user' ? theme.ink : theme.bg,
              color: m.role === 'user' ? theme.card : theme.ink,
              padding: '10px 14px',
              borderRadius: 2,
              fontFamily: theme.sans, fontSize: 14, lineHeight: 1.5,
              border: m.role === 'user' ? 'none' : `1px solid ${theme.ruleSoft}`,
              overflowWrap: 'anywhere',
            }}>
              {m.role === 'assistant'
                ? <AssistantMarkdown text={m.text} theme={theme} />
                : m.text}
            </div>
          )
        })}

        {!hasConversation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)} style={{
                textAlign: 'left',
                background: theme.card,
                border: `1px dashed ${theme.ink}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontFamily: theme.serif, fontSize: 13, fontStyle: 'italic',
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
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && sendMessage(input.trim())}
          placeholder={historyLoading ? '載入對話…' : loading ? '思考中…' : '繼續追問…'}
          disabled={loading || historyLoading}
          style={{
            flex: 1, background: theme.bg,
            border: `1px solid ${theme.ruleSoft}`, borderRadius: 8,
            padding: '10px 12px',
            fontFamily: theme.sans, fontSize: 14, color: theme.ink,
            outline: 'none', opacity: loading ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => sendMessage(input.trim())}
          disabled={loading || historyLoading || !input.trim()}
          style={{
            background: theme.ink, color: theme.card,
            border: 'none', borderRadius: 8,
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
