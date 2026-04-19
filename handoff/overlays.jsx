// Ask sheet — bottom sheet that slides up with Claude conversation
// Quiz card — Duolingo-style multi-choice
// Celebration — finished today's brief screen

function AskSheet({ theme, card, visible, onClose }) {
  const [messages, setMessages] = React.useState([
    {
      role: 'assistant',
      text: '讀完這篇，有三個後端工程師視角的追問想跟你聊：',
    },
  ]);
  const [input, setInput] = React.useState('');

  const suggestions = [
    '這跟 OpenAI Responses API 比有什麼 trade-off？',
    'production 導入，第一個要擔心什麼？',
    'agent loop 的 retry budget 該怎麼調？',
  ];

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
      {/* Handle */}
      <div style={{
        padding: '8px 0 2px', display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ width: 32, height: 3, background: theme.ruleSoft }} />
      </div>

      {/* Header */}
      <div style={{
        padding: '8px 20px 12px',
        borderBottom: `1px solid ${theme.ruleSoft}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
            letterSpacing: 1.5, textTransform: 'uppercase',
          }}>Ask Claude · Haiku 4.5</div>
          <div style={{
            fontFamily: theme.serif, fontSize: 14, color: theme.ink,
            fontWeight: 600, fontStyle: 'italic',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{card?.title}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${theme.ink}`, borderRadius: 2,
          width: 26, height: 26, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.mono, fontSize: 12, color: theme.ink,
        }}>✕</button>
      </div>

      {/* Messages */}
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

        {/* Suggestion chips */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
        }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => {
              setMessages(prev => [
                ...prev,
                { role: 'user', text: s },
                { role: 'assistant', text: '這是 Claude 的回覆示意 — 實際會透過 SSE streaming 逐字出現。' },
              ]);
            }} style={{
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

      {/* Input */}
      <div style={{
        borderTop: `1px solid ${theme.ruleSoft}`,
        padding: '10px 14px 14px',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="繼續追問…"
          style={{
            flex: 1, background: theme.bg,
            border: `1px solid ${theme.ruleSoft}`, borderRadius: 2,
            padding: '10px 12px',
            fontFamily: theme.sans, fontSize: 14, color: theme.ink,
            outline: 'none',
          }}
        />
        <button style={{
          background: theme.ink, color: theme.card,
          border: 'none', borderRadius: 2,
          padding: '0 16px',
          fontFamily: theme.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: 0.5, cursor: 'pointer',
        }}>SEND</button>
      </div>
    </div>
  );
}

function QuizCard({ theme, quiz, onComplete }) {
  const [selected, setSelected] = React.useState(null);
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div style={{
      height: '100%', background: theme.card,
      display: 'flex', flexDirection: 'column',
      padding: '20px 24px',
    }}>
      <div style={{
        fontFamily: theme.mono, fontSize: 10, fontWeight: 700,
        color: theme.accent, letterSpacing: 2,
        textTransform: 'uppercase', marginBottom: 4,
      }}>◇ Recall Quiz · {quiz.daysAgo} days ago</div>

      <div style={{
        fontFamily: theme.serif, fontSize: 13, fontStyle: 'italic',
        color: theme.inkMuted, marginBottom: 18,
      }}>{quiz.articleTitle}</div>

      <h2 style={{
        fontFamily: theme.serif, fontSize: 22, lineHeight: 1.25, fontWeight: 700,
        color: theme.ink, margin: 0, marginBottom: 20, textWrap: 'pretty',
      }}>{quiz.question}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {quiz.options.map((opt, i) => {
          const isSelected = selected === opt.id;
          const showCorrect = revealed && opt.correct;
          const showWrong = revealed && isSelected && !opt.correct;
          return (
            <button key={opt.id} onClick={() => !revealed && setSelected(opt.id)} style={{
              textAlign: 'left',
              background: showCorrect ? theme.positiveSoft
                : showWrong ? theme.accentSoft
                : isSelected ? theme.bg
                : theme.card,
              border: `1.5px solid ${showCorrect ? theme.positive
                : showWrong ? theme.negative
                : isSelected ? theme.ink
                : theme.ruleSoft}`,
              borderRadius: 2,
              padding: '12px 14px',
              fontFamily: theme.sans, fontSize: 14, lineHeight: 1.4,
              color: theme.ink, cursor: revealed ? 'default' : 'pointer',
              display: 'flex', gap: 10, alignItems: 'flex-start',
              transition: 'all 0.15s',
            }}>
              <span style={{
                fontFamily: theme.mono, fontSize: 11, fontWeight: 700,
                color: theme.inkFaint, minWidth: 14,
              }}>{String.fromCharCode(65 + i)}</span>
              <span style={{ flex: 1 }}>{opt.text}</span>
              {showCorrect && <span style={{ color: theme.positive, fontWeight: 700 }}>✓</span>}
              {showWrong && <span style={{ color: theme.negative, fontWeight: 700 }}>✕</span>}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div style={{
          marginTop: 14,
          background: theme.bg,
          border: `1px solid ${theme.ruleSoft}`,
          borderLeft: `3px solid ${theme.accent}`,
          padding: '10px 12px',
          fontFamily: theme.sans, fontSize: 12, lineHeight: 1.5,
          color: theme.ink,
        }}>{quiz.explanation}</div>
      )}

      <button
        onClick={() => revealed ? onComplete(selected === 'a') : setRevealed(true)}
        disabled={!selected && !revealed}
        style={{
          marginTop: 14,
          background: (selected || revealed) ? theme.ink : theme.ruleSoft,
          color: theme.card,
          border: 'none', borderRadius: 2,
          padding: '12px 0',
          fontFamily: theme.mono, fontSize: 12, fontWeight: 600,
          letterSpacing: 2, textTransform: 'uppercase',
          cursor: (selected || revealed) ? 'pointer' : 'not-allowed',
        }}>
        {revealed ? 'Continue to brief →' : 'Check answer'}
      </button>
    </div>
  );
}

function Celebration({ theme, stats, onWeekly }) {
  return (
    <div style={{
      height: '100%', background: theme.card,
      display: 'flex', flexDirection: 'column',
      padding: '40px 24px 24px',
      position: 'relative',
    }}>
      {/* Decorative rule */}
      <div style={{ height: 3, background: theme.ink, marginBottom: 6 }} />
      <div style={{ height: 1, background: theme.ink, marginBottom: 24 }} />

      <div style={{
        fontFamily: theme.mono, fontSize: 10, color: theme.inkFaint,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
      }}>End of edition · Apr 19</div>

      <h1 style={{
        fontFamily: theme.serif, fontSize: 40, lineHeight: 1.02,
        fontWeight: 900, fontStyle: 'italic',
        color: theme.ink, margin: 0, marginBottom: 8, letterSpacing: -0.8,
      }}>That's it for<br/>today.</h1>

      <p style={{
        fontFamily: theme.serif, fontSize: 15, lineHeight: 1.45,
        fontStyle: 'italic', color: theme.inkMuted,
        margin: 0, marginBottom: 28,
      }}>You've read the morning. Come back tomorrow — the world won't slow down.</p>

      {/* Streak callout */}
      <div style={{
        background: theme.bg, border: `1.5px solid ${theme.ink}`, borderRadius: 2,
        padding: '16px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          fontFamily: theme.serif, fontSize: 48, fontWeight: 900,
          color: theme.accent, lineHeight: 1,
        }}>{stats.current}</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
            letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2,
          }}>Day streak</div>
          <div style={{
            fontFamily: theme.sans, fontSize: 13, color: theme.ink, fontWeight: 500,
          }}>personal best {stats.best} · 1 away from new record</div>
        </div>
        <div style={{ fontSize: 28 }}>🔥</div>
      </div>

      {/* Today stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1,
        background: theme.ink, border: `1.5px solid ${theme.ink}`, borderRadius: 2,
        marginBottom: 14,
      }}>
        {[
          { label: 'READ', value: '4', unit: 'min' },
          { label: 'SAVED', value: stats.savedToday, unit: '篇' },
          { label: 'RECALL', value: '1/1', unit: 'correct' },
        ].map(s => (
          <div key={s.label} style={{
            background: theme.card, padding: '14px 8px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
            }}>{s.label}</div>
            <div style={{
              fontFamily: theme.serif, fontSize: 24, fontWeight: 700,
              color: theme.ink, lineHeight: 1,
            }}>{s.value}</div>
            <div style={{
              fontFamily: theme.sans, fontSize: 10, color: theme.inkMuted, marginTop: 2,
            }}>{s.unit}</div>
          </div>
        ))}
      </div>

      {/* Weekly peek */}
      <button onClick={onWeekly} style={{
        background: 'transparent', border: `1px dashed ${theme.ink}`, borderRadius: 2,
        padding: '12px', cursor: 'pointer',
        textAlign: 'left', width: '100%',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
              letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
            }}>This week · so far</div>
            <div style={{
              fontFamily: theme.serif, fontSize: 16, fontWeight: 600, color: theme.ink,
            }}>{stats.weeklyArticles} articles · mostly #infra, #model-release</div>
          </div>
          <div style={{ fontFamily: theme.mono, fontSize: 14, color: theme.ink }}>→</div>
        </div>
      </button>

      <div style={{ flex: 1 }} />

      <div style={{
        fontFamily: theme.mono, fontSize: 9, color: theme.inkFaint,
        letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center',
      }}>— next edition · tomorrow 07:30 —</div>
    </div>
  );
}

Object.assign(window, { AskSheet, QuizCard, Celebration });
