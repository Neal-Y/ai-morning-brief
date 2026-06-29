import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { FONT, RADIUS, T } from '../theme'

interface Props {
  label: string
  onPress: () => void
  /** Show the ember accent arrow (use for forward/primary actions). */
  arrow?: boolean
}

// Warm parchment "paper" CTA: a muted, slightly textured cream with a subtle
// top-to-bottom sheen and an ember accent glyph — not a flat bright slab.
const PAPER_TOP = '#EFE6D4'
const PAPER_BOTTOM = '#D8CCB4'

export function PaperButton({ label, onPress, arrow = true }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={[PAPER_TOP, PAPER_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.grad}
      >
        {/* hairline top highlight for a crafted edge */}
        <View style={styles.topHighlight} pointerEvents="none" />
        <Text style={styles.label}>{label}</Text>
        {arrow && <Text style={styles.arrow}>→</Text>}
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.button,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pressed: { transform: [{ scale: 0.985 }], shadowOpacity: 0.25 },
  grad: {
    height: 56,
    borderRadius: RADIUS.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  label: { fontFamily: FONT.bold, fontSize: 16, color: '#1A1612', letterSpacing: 0.3 },
  arrow: { fontFamily: FONT.bold, fontSize: 17, color: T.accent },
})
