import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FONT, RADIUS, T } from '../theme'
import { FadeInDown, ZoomIn } from './Reveal'

interface Props {
  correctCount: number
  total: number
  xpToday: number
  onRestart: () => void
}

export function CompletionCard({ correctCount, total, xpToday, onRestart }: Props) {
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0

  return (
    <View style={styles.root}>
      <ZoomIn duration={400} style={styles.mark}>
        <Text style={styles.markText}>✓</Text>
      </ZoomIn>
      <FadeInDown duration={350} delay={120}>
        <Text style={styles.title}>今日完成！</Text>
      </FadeInDown>

      <FadeInDown duration={350} delay={200} style={styles.statsRow}>
        <Stat label="答對" value={`${correctCount}/${total}`} />
        <Stat label="今日 XP" value={`${xpToday}`} />
        <Stat label="正確率" value={`${accuracy}%`} />
      </FadeInDown>

      <FadeInDown duration={350} delay={280} style={styles.footer}>
        <Pressable style={styles.btn} onPress={onRestart}>
          <Text style={styles.btnText}>再玩一次</Text>
        </Pressable>
      </FadeInDown>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  mark: {
    width: 76,
    height: 76,
    borderRadius: 999,
    backgroundColor: T.correct,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  markText: { color: '#FFFFFF', fontFamily: FONT.black, fontSize: 40 },
  title: { fontFamily: FONT.black, fontSize: 26, color: T.text, marginBottom: 26 },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  stat: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingVertical: 18,
    alignItems: 'center',
  },
  statValue: { fontFamily: FONT.black, fontSize: 24, color: T.text },
  statLabel: { fontFamily: FONT.mono, fontSize: 11, color: T.textMuted, marginTop: 6 },
  footer: { alignSelf: 'stretch', marginTop: 32 },
  btn: {
    height: 56,
    borderRadius: RADIUS.button,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: FONT.bold, fontSize: 16, color: '#FFFFFF' },
})
