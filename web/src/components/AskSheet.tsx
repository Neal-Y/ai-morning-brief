import { useState } from 'react'
import type { Theme } from '../theme.ts'
import type { Article } from '../types.ts'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface AskSheetProps {
  theme: Theme
  article: Article
  visible: boolean
  onClose: () => void
}

const SUGGESTIONS = [
  '這跟競品比有什麼 trade-off？',
  'production 導入，第一個要擔心什麼？',
  '對我的 backend 架構影響最大的點是？',
]

export function AskSheet({ theme, article, visible, onClose }: AskSheetProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: '讀完這篇，有幾個後端工程師視角的追問想跟你聊：' },
  ])
  const [input, setInput] = useState('')

  const sendMessage = (text: string) => {
    setMessages(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: '（SSE streaming 追問功能 Week 2 上線，敬請期待）' },
    ])
    setInput('')
  }

  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      height: '78%',
      background: theme.card,
      borderTop: `2px solid ${theme.ink}`,
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
      zIndex: 30,
      display: 'flex', flexDirection: 'column',
      boxShadow: visible ? '0 -12px 40px rgba(26,22,18,0.18)' : 'none',
    }}>
      <div style={{ padding: '8px 0 2px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 3, background: theme.ruleSoft }} />
      </div>

      <div style={{
        padding: '8px 20px 12px',
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
          background: 'transparent', border: `1px solid ${theme.ink}`, borderRadius: 2,
          width: 26, height: 26, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.mono, fontSize: 12, color: theme.ink,
          cursor: 'pointer',
        }}>✕</button>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 20px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: m.role === 'user' ? theme.ink : theme.bg,
            color: m.role === 'user' ? theme.card : theme.ink,
            padding: '10px 14px',
            borderRadius: 2,
            fontFamily: theme.sans, fontSize: 14, lineHeight: 1.5,
            border: m.role === 'user' ? 'none' : `1px solid ${theme.ruleSoft}`,
          }}>{m.text}</div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)} style={{
              textAlign: 'left',
              background: theme.card,
              border: `1px dashed ${theme.ink}`,
              borderRadius: 2,
              padding: '10px 12px',
              fontFamily: theme.serif, fontSize: 13, fontStyle: 'italic',
              color: theme.ink, cursor: 'pointer',
            }}>→ {s}</button>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: `1px solid ${theme.ruleSoft}`,
        padding: '10px 14px 14px',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && input.trim() && sendMessage(input.trim())}
          placeholder="繼續追問…"
          style={{
            flex: 1, background: theme.bg,
            border: `1px solid ${theme.ruleSoft}`, borderRadius: 2,
            padding: '10px 12px',
            fontFamily: theme.sans, fontSize: 14, color: theme.ink,
            outline: 'none',
          }}
        />
        <button
          onClick={() => input.trim() && sendMessage(input.trim())}
          style={{
            background: theme.ink, color: theme.card,
            border: 'none', borderRadius: 2,
            padding: '0 16px',
            fontFamily: theme.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: 0.5, cursor: 'pointer',
          }}
        >SEND</button>
      </div>
    </div>
  )
}
