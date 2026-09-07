import { useEffect, useState } from 'react'
import { THEME_DARK } from './theme.ts'
import { useNavInset } from './nav.ts'
import { fetchActivity, type ActivityData } from './api.ts'
import { StatCard } from './components/activity/StatCard.tsx'
import { Heatmap } from './components/activity/Heatmap.tsx'
import { WeekPie } from './components/activity/WeekPie.tsx'
import { Q } from './components/quiz/tokens.ts'

const T = THEME_DARK

const EMPTY_HEATMAP: number[][] = Array.from({ length: 52 }, () => Array(7).fill(0))

export default function Activity() {
  const navInset = useNavInset()
  const [data, setData] = useState<ActivityData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchActivity()
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])

  const streak = data?.streak ?? 0
  const weekTotal = data?.weekStats.total ?? 0
  const accuracy = weekTotal > 0
    ? Math.round((data!.weekStats.correct / weekTotal) * 100)
    : 0
  const recent = data?.recent ?? []

  return (
    <div style={{
      height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain',
      background: T.bg, color: T.ink, fontFamily: T.sans,
      paddingBottom: navInset,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'calc(env(safe-area-inset-top, 0px) + 18px) 20px 6px',
        }}>
          <span style={{
            fontFamily: T.serif, fontSize: 21, fontWeight: 900, fontStyle: 'italic',
            color: T.ink, letterSpacing: -0.3,
          }}>學習紀錄</span>
          {streak > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: T.accentSoft, borderRadius: 999, padding: '6px 12px',
              fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.accent,
            }}>🔥 {streak} 天</span>
          )}
        </div>

        {!data ? (
          <div style={{
            padding: '48px 20px', textAlign: 'center',
            fontFamily: T.mono, fontSize: 11, color: T.inkFaint, letterSpacing: 1,
          }}>{error ? '無法載入學習紀錄' : '載入中…'}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0' }}>
              <StatCard value={streak} label="連續天數" delay={0} />
              <StatCard value={weekTotal} label="本週答題" delay={80} />
              <StatCard value={data.totalCorrect} label="累計答對" delay={160} />
            </div>

            <Section label="本週組成">
              <WeekPie
                segments={[
                  { label: '答對', value: data.weekStats.correct, color: Q.correct },
                  { label: '答錯', value: data.weekStats.wrong, color: Q.wrong },
                ]}
                total={weekTotal}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <div style={{
                  flex: 1, height: 5, borderRadius: 3, background: '#2E2820', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3, background: T.accent,
                    width: `${accuracy}%`,
                    transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)',
                  }} />
                </div>
                <span style={{
                  fontFamily: T.mono, fontSize: 11, color: T.inkMuted,
                  width: 76, textAlign: 'right',
                }}>正確率 {accuracy}%</span>
              </div>
            </Section>

            <Section label="Activity · 過去一年">
              <Heatmap data={data.heatmap ?? EMPTY_HEATMAP} />
            </Section>

            {recent.length > 0 ? (
              <Section label="Recent · 最近 5 天">
                {recent.map((row, i) => {
                  const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0
                  return (
                    <div key={i} style={{
                      padding: '12px 0', borderBottom: `1px solid ${T.ruleSoft}`,
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontFamily: T.mono, fontSize: 12.5, color: T.ink, width: 66,
                        }}>{row.date}</span>
                        <span style={{
                          border: `1px solid ${T.accent}`, borderRadius: 999,
                          padding: '2px 8px',
                          fontFamily: T.mono, fontSize: 9.5, fontWeight: 700,
                          letterSpacing: 0.5, color: T.accent,
                        }}>{row.category}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{
                          fontFamily: T.mono, fontSize: 12.5, fontWeight: 700, color: T.ink,
                        }}>{row.correct} / {row.total} 題</span>
                      </div>
                      {i === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            flex: 1, height: 5, borderRadius: 3, background: '#2E2820', overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%', borderRadius: 3, background: T.accent,
                              width: `${pct}%`,
                              transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)',
                            }} />
                          </div>
                          <span style={{
                            fontFamily: T.mono, fontSize: 11, color: T.inkMuted,
                            width: 34, textAlign: 'right',
                          }}>{pct}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </Section>
            ) : (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                fontFamily: T.mono, fontSize: 12, color: T.inkFaint, lineHeight: 1.7,
              }}>開始答題後，這裡會顯示你的學習軌跡</div>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 20px 0' }}>
      <div style={{
        fontFamily: T.mono, fontSize: 10, color: T.inkFaint,
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  )
}
