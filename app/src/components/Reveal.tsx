import { useEffect, useRef } from 'react'
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native'

interface RevealProps {
  duration?: number
  delay?: number
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

// RN-core Animated replacement for reanimated's `entering={FadeInDown...}`.
// Expo Go on this device can't load react-native-reanimated's native module
// (NativeWorklets / NativeReanimated both throw at init) — RN's built-in
// Animated API has no such native-linking dependency, so it just works.
export function FadeInDown({ duration = 400, delay = 0, style, children }: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [duration, delay, progress])

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

export function ZoomIn({ duration = 400, delay = 0, style, children }: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start()
  }, [duration, delay, progress])

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}