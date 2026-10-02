import { THEME_DARK } from '../../theme.ts'
import type { WeeklyData } from '../../api.ts'
import { navigate } from '../../router.ts'
import { Q } from '../quiz/tokens.ts'
import { QuizReview } from '../quiz/QuizReview.tsx'
import { mapApiQuiz } from '../../quiz/types.ts'

const T = THEME_DARK

/**
 * 本週回顧: one card that turns the week's scattered daily answers into
 * "where am I weak" — accuracy vs last week, the categories with the most
 * misses, the questions missed (the spaced-review schedule brings these back)
 * and what was saved. Data: api/weekly.ts (Edge, one DB round trip).
 */
export function WeeklyReview({ data }: { data: WeeklyData }) {
  const pct = (c: number, n: number) => (n > 0 ? Math.round((c / n) * 100) : null)
  const acc = pct(data.correct, data.answered)
  const lastAcc = pct(data.lastWeek.correct, data.lastWeek.answered)
  const delta = acc !== null && lastAcc !== null ? acc - lastAcc : null

  return (
    <div style={{
      background: T.card, borderRadius: 20, boxShadow: T.highlight,
      border: `1px solid ${T.ruleSoft}`, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 800, color: T.ink }}>本週回顧</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkFaint }}>{data.weekLabel}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Metric value={`${data.activeDays}/${data.daysElapsed}`} label="活躍天數" />
        <Metric value={String(data.read)} label="讀了幾篇" />
        <Metric value={String(data.answered)} label="答了幾題" />
        <Metric
          value={acc === null ? '—' : `${acc}%`}
          // Last week's rate as the label, coloured by direction: short enough
          // for a quarter-width cell ("比上週 +11" wrapped to two lines).
          label={lastAcc === null ? '正確率' : `上週 ${lastAcc}%`}
          labelColor={delta === null || delta === 0 ? undefined : delta > 0 ? Q.correct : Q.wrong}
        />
      </div>

      {data.weakCategories.length > 0 && (
        <Block title="最常卡住">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.weakCategories.map(c => (
              <span key={c.category} style={{
                borderRadius: 999, padding: '4px 10px', background: Q.wrongTint,
                fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: Q.wrong,
              }}>{c.category} · 錯 {c.wrong}/{c.total}</span>
            ))}
          </div>
        </Block>
      )}

      {data.missed.length > 0 && (
        <Block title="這週答錯的題" note="點開看解析">
          {data.missed.map(m => (
            <details key={m.quizId} style={{ borderTop: `1px solid ${T.ruleSoft}` }}>
              <summary style={{ cursor: 'pointer', padding: '12px 0', color: T.inkMuted }}>
                <span style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.5 }}>{m.prompt}</span>
              </summary>
              <div style={{ padding: '8px 0 16px' }}>
                <QuizReview quiz={m.question ? mapApiQuiz(m.question) : null} />
              </div>
            </details>
          ))}
        </Block>
      )}

      {data.saved.length > 0 && (
        <Block title="這週收藏">
          {data.saved.map(s => (
            <button
              key={s.id}
              onClick={() => navigate('/library')}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 0', border: 'none', borderTop: `1px solid ${T.ruleSoft}`,
                background: 'none', fontFamily: T.sans, fontSize: 13, lineHeight: 1.5, color: T.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >{s.title}</button>
          ))}
        </Block>
      )}

      {data.answered === 0 && data.read === 0 && (
        <div style={{ marginTop: 12, fontFamily: T.sans, fontSize: 13, color: T.inkFaint }}>
          這週還沒有紀錄，從今天的簡報或 5 題判斷題開始吧。
        </div>
      )}
    </div>
  )
}

function Metric({ value, label, labelColor }: { value: string; label: string; labelColor?: string }) {
  return (
    <div style={{ background: T.raised, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{
        fontFamily: T.mono, fontSize: 17, fontWeight: 700, color: T.ink,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ marginTop: 2, fontFamily: T.sans, fontSize: 11, color: labelColor ?? T.inkFaint }}>{label}</div>
    </div>
  )
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: T.inkMuted }}>{title}</span>
        {note && <span style={{ fontFamily: T.sans, fontSize: 11, color: T.inkFaint }}>{note}</span>}
      </div>
      {children}
    </div>
  )
}
