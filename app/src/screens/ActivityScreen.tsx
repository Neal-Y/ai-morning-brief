import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { ActivityIndicator, Animated, Easing, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { DotGrid } from '../components/DotGrid'
import { FONT, T } from '../theme'
import { fetchActivity, type ActivityData } from '../api'

const MONTH_LABELS: { week: number; label: string }[] = [
  { week: 0, label: 'Jan' }, { week: 8, label: 'Mar' }, { week: 17, label: 'May' },
  { week: 26, label: 'Jul' }, { week: 34, label: 'Sep' }, { week: 43, label: 'Nov' },
]

const CELL_SIZE = 10
const CELL_GAP = 2
const CELL_STRIDE = CELL_SIZE + CELL_GAP        // 12px per column
const HEATMAP_TOTAL_WIDTH = 52 * CELL_STRIDE - CELL_GAP  // 622px

const EMPTY_HEATMAP: number[][] = Array.from({ length: 52 }, () => Array(7).fill(0))

// ── heatmap color scale ──────────────────────────────────────────────────────
// Level 0 uses a hardcoded opaque hex because T.border is rgba (would look wrong on cell bg)
const HEAT_COLORS = ['#2E2820', '#5C1F0E', '#9B3218', T.accent] as const
function heatColor(level: number) {
  return HEAT_COLORS[Math.min(level, 3)] ?? HEAT_COLORS[0]
}

// ── shared count-up hook ─────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900, delay = 0) {
  const [display, setDisplay] = useState(0)
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)))
    Animated.timing(anim, {
      toValue: target, duration, delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // JS-side number readout, not a transform prop
    }).start()
    return () => anim.removeListener(id)
  }, [target, duration, delay, anim])
  return display
}

// ── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, delay = 0 }: {
  value: number; label: string; delay?: number
}) {
  const display = useCountUp(value, 900, delay)
  return (
    <View style={s.statCard}>
      <Text style={s.statValue}>{display}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

// ── WeekPie ──────────────────────────────────────────────────────────────────
// Donut built from 60 small rotated tick Views (clock-hand transform trick —
// avoids react-native-svg dependency, consistent with codebase convention).
const PIE_SIZE = 96
const PIE_TICKS = 60
const PIE_TICK_LEN = 10
const PIE_TICK_W = 3

interface PieSegment { label: string; value: number; color: string }
interface RecentRow { date: string; category: string; correct: number; total: number; expanded: boolean }

function WeekPie({ segments, total }: { segments: PieSegment[]; total: number }) {
  const sweepAnim = useRef(new Animated.Value(0)).current
  const [sweep, setSweep] = useState(0)
  useEffect(() => {
    const id = sweepAnim.addListener(({ value }) => setSweep(value))
    Animated.timing(sweepAnim, {
      toValue: 1, duration: 900, delay: 150,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start()
    return () => sweepAnim.removeListener(id)
  }, [sweepAnim])
  const countDisplay = useCountUp(total, 900, 150)

  let acc = 0
  const bounds = segments.map(seg => {
    const start = acc
    acc += (seg.value / total) * 360
    return { color: seg.color, start, end: acc }
  })
  const colorForAngle = (deg: number) => {
    const b = bounds.find(x => deg >= x.start && deg < x.end)
    return b ? b.color : '#2E2820'
  }

  return (
    <View style={s.pieCard}>
      <View style={{ width: PIE_SIZE, height: PIE_SIZE }}>
        {Array.from({ length: PIE_TICKS }).map((_, i) => {
          const angle = (i / PIE_TICKS) * 360
          const visible = angle / 360 <= sweep
          return (
            <View
              key={i}
              style={[s.pieTick, {
                backgroundColor: colorForAngle(angle),
                opacity: visible ? 1 : 0,
                transform: [
                  { rotate: `${angle}deg` },
                  { translateY: -(PIE_SIZE / 2 - PIE_TICK_LEN / 2 - 2) },
                ],
              }]}
            />
          )
        })}
        <View style={s.pieCenter}>
          <Text style={s.pieCenterValue}>{countDisplay}</Text>
          <Text style={s.pieCenterLabel}>題</Text>
        </View>
      </View>
      <View style={s.pieLegend}>
        {segments.map((seg, i) => (
          <View key={i} style={s.pieLegendRow}>
            <View style={[s.pieLegendDot, { backgroundColor: seg.color }]} />
            <Text style={s.pieLegendLabel}>{seg.label}</Text>
            <Text style={s.pieLegendValue}>{seg.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Heatmap ──────────────────────────────────────────────────────────────────
// One Animated.Value drives a per-column stagger via JS interpolation offsets,
// rather than 52 separate values.
function Heatmap({ data }: { data: number[][] }) {
  const scrollRef = useRef<ScrollView>(null)
  const revealAnim = useRef(new Animated.Value(0)).current
  const [reveal, setReveal] = useState(0)
  useEffect(() => {
    const id = revealAnim.addListener(({ value }) => setReveal(value))
    Animated.timing(revealAnim, {
      toValue: 1, duration: 700, delay: 100,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start()
    return () => revealAnim.removeListener(id)
  }, [revealAnim])

  return (
    <View style={s.heatmapCard}>
      <View style={s.heatmapBody}>
        <View style={s.dayLabels}>
          {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
            <Text key={i} style={s.dayLabel}>{d}</Text>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View>
            <View style={s.monthRow}>
              {MONTH_LABELS.map((m, i) => (
                <Text key={i} style={[s.monthLabel, { left: m.week * CELL_STRIDE }]}>{m.label}</Text>
              ))}
            </View>
            <View style={s.weeksRow}>
              {data.map((col, ci) => {
                const colStart = (ci / data.length) * 0.6
                const colProgress = Math.min(1, Math.max(0, (reveal - colStart) / 0.4))
                return (
                  <View
                    key={ci}
                    style={[s.weekCol, {
                      opacity: colProgress,
                      transform: [{ scale: 0.4 + colProgress * 0.6 }],
                    }]}
                  >
                    {col.map((level, ri) => (
                      <View key={ri} style={[s.cell, { backgroundColor: heatColor(level) }]} />
                    ))}
                  </View>
                )
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

// ── AccuracyBar ──────────────────────────────────────────────────────────────
function AccuracyBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const id = widthAnim.addListener(({ value }) => setWidth(value))
    Animated.timing(widthAnim, {
      toValue: pct, duration: 800, delay: 60 + delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start()
    return () => widthAnim.removeListener(id)
  }, [pct, delay, widthAnim])
  return (
    <View style={s.accuracyTrack}>
      <View style={[s.accuracyFill, { width: `${width}%` as `${number}%` }]} />
    </View>
  )
}

// ── ActivityRow ──────────────────────────────────────────────────────────────
function ActivityRow({ row, delay = 0 }: { row: RecentRow; delay?: number }) {
  const pct = Math.round((row.correct / row.total) * 100)
  return (
    <View style={s.activityRow}>
      <View style={s.activityTopLine}>
        <Text style={s.activityDate}>{row.date}</Text>
        <View style={s.categoryPill}>
          <Text style={s.categoryPillText}>{row.category}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={s.activityScore}>{row.correct} / {row.total} 題</Text>
      </View>
      {row.expanded && (
        <View style={s.accuracyRow}>
          <AccuracyBar pct={pct} delay={delay} />
          <Text style={s.accuracyPct}>{pct}%</Text>
        </View>
      )}
    </View>
  )
}

// ── screen ───────────────────────────────────────────────────────────────────
export function ActivityScreen() {
  const [data, setData] = useState<ActivityData | null>(null)

  useFocusEffect(
    useCallback(() => {
      fetchActivity().then(setData).catch(() => {})
    }, [])
  )

  const heatmap = data?.heatmap ?? EMPTY_HEATMAP
  const streak = data?.streak ?? 0
  const weekBreakdown = data
    ? [
        { label: '答對', value: data.weekStats.correct, color: T.correct },
        { label: '答錯', value: data.weekStats.wrong, color: T.wrong },
      ]
    : []
  const weekTotal = data?.weekStats.total ?? 0
  const stats = [
    { value: streak, label: '連續天數' },
    { value: data?.weekStats.total ?? 0, label: '本週答題' },
    { value: data?.totalCorrect ?? 0, label: '累計答對' },
  ]
  const recent = data?.recent.map((r, i) => ({ ...r, expanded: i === 0 })) ?? []

  return (
    <DotGrid>
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <Text style={s.title}>學習紀錄</Text>
            {streak > 0 && (
              <View style={s.streakBadge}>
                <Text style={s.streakEmoji}>🔥</Text>
                <Text style={s.streakText}>{streak} 天</Text>
              </View>
            )}
          </View>

          {!data ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : (
            <>
              <View style={s.statsRow}>
                {stats.map((st, i) => (
                  <StatCard key={i} value={st.value} label={st.label} delay={i * 80} />
                ))}
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>本週組成</Text>
                <WeekPie segments={weekBreakdown} total={weekTotal} />
              </View>

              <View style={s.section}>
                <Text style={s.sectionLabel}>ACTIVITY · 過去一年</Text>
                <Heatmap data={heatmap} />
              </View>

              {recent.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionLabel}>RECENT · 最近 5 天</Text>
                  <View>
                    {recent.map((row, i) => (
                      <ActivityRow key={i} row={row} delay={i === 0 ? 300 : 0} />
                    ))}
                  </View>
                </View>
              )}

              {recent.length === 0 && (
                <View style={s.emptySection}>
                  <Text style={s.emptyText}>開始答題後，這裡會顯示你的學習軌跡</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </DotGrid>
  )
}

// ── styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6,
  },
  title: { fontFamily: FONT.black, fontSize: 22, color: T.text },

  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: T.accentSoft, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  streakEmoji: { fontSize: 13 },
  streakText: { fontFamily: FONT.monoBold, fontSize: 13, color: T.accent },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  statCard: {
    flex: 1, backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  statValue: { fontFamily: FONT.monoBold, fontSize: 26, color: T.text },
  statLabel: { fontFamily: FONT.mono, fontSize: 11, color: T.textMuted, marginTop: 4, letterSpacing: 0.3 },

  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: {
    fontFamily: FONT.monoMed, fontSize: 11, color: T.textFaint,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },

  pieCard: {
    flexDirection: 'row', alignItems: 'center', gap: 18,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16,
  },
  pieTick: {
    position: 'absolute', top: '50%', left: '50%',
    width: PIE_TICK_W, height: PIE_TICK_LEN,
    marginLeft: -PIE_TICK_W / 2, marginTop: -PIE_TICK_LEN / 2,
    borderRadius: PIE_TICK_W / 2,
  },
  pieCenter: {
    position: 'absolute', width: 68, height: 68, borderRadius: 34,
    top: (PIE_SIZE - 68) / 2, left: (PIE_SIZE - 68) / 2,
    backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center',
  },
  pieCenterValue: { fontFamily: FONT.monoBold, fontSize: 22, color: T.text },
  pieCenterLabel: { fontFamily: FONT.mono, fontSize: 9, color: T.textFaint },
  pieLegend: { flex: 1, gap: 8 },
  pieLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieLegendDot: { width: 9, height: 9, borderRadius: 3 },
  pieLegendLabel: { fontFamily: FONT.mono, fontSize: 12, color: T.textMuted, flex: 1 },
  pieLegendValue: { fontFamily: FONT.monoBold, fontSize: 12, color: T.text },

  heatmapCard: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14,
  },
  monthRow: { height: 12, marginBottom: 6, position: 'relative', width: HEATMAP_TOTAL_WIDTH },
  monthLabel: { position: 'absolute', fontFamily: FONT.mono, fontSize: 9, color: T.textFaint },
  heatmapBody: { flexDirection: 'row', alignItems: 'flex-start' },
  dayLabels: { width: 16, justifyContent: 'space-between', marginTop: 18, paddingBottom: 2 },
  dayLabel: { fontFamily: FONT.mono, fontSize: 8, color: T.textFaint, height: 10, lineHeight: 10 },
  weeksRow: { flexDirection: 'row', gap: 2 },
  weekCol: { gap: 2 },
  cell: { width: 10, height: 10, borderRadius: 2 },

  activityRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 8 },
  activityTopLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityDate: { fontFamily: FONT.mono, fontSize: 13, color: T.text, width: 62 },
  categoryPill: {
    borderWidth: 1, borderColor: T.accent, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  categoryPillText: { fontFamily: FONT.monoBold, fontSize: 10, letterSpacing: 0.5, color: T.accent },
  activityScore: { fontFamily: FONT.monoBold, fontSize: 13, color: T.text },
  accuracyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accuracyTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#2E2820', overflow: 'hidden' },
  accuracyFill: { height: '100%', borderRadius: 3, backgroundColor: T.accent },
  accuracyPct: { fontFamily: FONT.mono, fontSize: 11, color: T.textMuted, width: 34, textAlign: 'right' },

  loadingRow: { paddingTop: 40, alignItems: 'center' },
  emptySection: { paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' },
  emptyText: { fontFamily: FONT.mono, fontSize: 13, color: T.textFaint, textAlign: 'center', lineHeight: 20 },
})
