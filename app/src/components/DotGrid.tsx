import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg'
import { T } from '../theme'

// Signature dot-grid background (22×22 spacing, 1px dots).
// Rendered as a single SVG pattern fill — cheap, scales to any size.
export function DotGrid({ children }: { children?: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id="dots" width={22} height={22} patternUnits="userSpaceOnUse">
            <Circle cx={1} cy={1} r={1} fill={T.dot} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.page },
})
