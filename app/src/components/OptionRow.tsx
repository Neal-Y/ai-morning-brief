import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { FONT, RADIUS, T } from '../theme'

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dimmed'

interface Props {
  letter: string // A / B / C / D
  text: string
  state: OptionState
  wasSelected: boolean
  disabled: boolean
  onPress: () => void
}

// Springy pop curve (handoff: cubic-bezier(0.34,1.56,0.64,1)).
const POP = Easing.bezier(0.34, 1.56, 0.64, 1)

export function OptionRow({ letter, text, state, wasSelected, disabled, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const shakeX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (state === 'correct') {
      // Pop the correct answer; a touch stronger if the user picked it.
      const peak = wasSelected ? 1.06 : 1.03
      scale.setValue(1)
      Animated.sequence([
        Animated.timing(scale, { toValue: peak, duration: 180, easing: POP, useNativeDriver: true }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 9,
          stiffness: 180,
          mass: 0.5,
          useNativeDriver: true,
        }),
      ]).start()
    } else if (state === 'wrong') {
      shakeX.setValue(0)
      Animated.sequence([
        Animated.timing(shakeX, { toValue: -7, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 7, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -5, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]).start()
    }
  }, [state, wasSelected, scale, shakeX])

  const palette = paletteFor(state)

  return (
    <Animated.View style={{ transform: [{ scale }, { translateX: shakeX }] }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.row,
          { backgroundColor: palette.bg, borderColor: palette.border },
          state === 'dimmed' && styles.dimmed,
        ]}
      >
        <View style={[styles.badge, { backgroundColor: palette.badgeBg }]}>
          <Text style={[styles.badgeText, { color: palette.badgeText }]}>{letter}</Text>
        </View>
        <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
        {state === 'correct' && <Text style={[styles.mark, { color: T.correct }]}>✓</Text>}
        {state === 'wrong' && <Text style={[styles.mark, { color: T.wrong }]}>✗</Text>}
      </Pressable>
    </Animated.View>
  )
}

function paletteFor(state: OptionState) {
  switch (state) {
    case 'correct':
      return {
        bg: T.correctTint,
        border: T.correct,
        badgeBg: T.correct,
        badgeText: '#FFFFFF',
        text: T.text,
      }
    case 'wrong':
      return {
        bg: T.wrongTint,
        border: T.wrong,
        badgeBg: T.wrong,
        badgeText: '#FFFFFF',
        text: T.text,
      }
    case 'dimmed':
      return {
        bg: T.surface,
        border: T.border,
        badgeBg: T.letterBg,
        badgeText: T.letterText,
        text: T.textMuted,
      }
    default:
      return {
        bg: T.surface,
        border: T.border,
        badgeBg: T.letterBg,
        badgeText: T.letterText,
        text: T.text,
      }
  }
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    borderRadius: RADIUS.option,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dimmed: { opacity: 0.55 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: FONT.monoBold, fontSize: 13 },
  text: { flex: 1, fontFamily: FONT.medium, fontSize: 16, lineHeight: 22 },
  mark: { fontFamily: FONT.bold, fontSize: 18 },
})
