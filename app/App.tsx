import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Text, View } from 'react-native'
import {
  useFonts,
  NotoSansTC_400Regular,
  NotoSansTC_500Medium,
  NotoSansTC_700Bold,
  NotoSansTC_900Black,
} from '@expo-google-fonts/noto-sans-tc'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QuizScreen } from './src/screens/QuizScreen'
import { FeedScreen } from './src/screens/FeedScreen'
import { LibraryScreen } from './src/screens/LibraryScreen'
import { T, FONT } from './src/theme'

const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, string> = {
  Quiz: '✦',
  Feed: '◎',
  Library: '⊟',
}

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSansTC_400Regular,
    NotoSansTC_500Medium,
    NotoSansTC_700Bold,
    NotoSansTC_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  })

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: T.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.accent} />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarStyle: {
                backgroundColor: T.surface,
                borderTopColor: T.border,
                borderTopWidth: 1,
                height: 64,
                paddingBottom: 10,
              },
              tabBarActiveTintColor: T.accent,
              tabBarInactiveTintColor: T.textFaint,
              tabBarLabelStyle: { fontFamily: FONT.mono, fontSize: 10, letterSpacing: 0.5 },
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 18, color }}>{TAB_ICONS[route.name] ?? '●'}</Text>
              ),
            })}
          >
            <Tab.Screen name="Quiz" component={QuizScreen} options={{ tabBarLabel: '今日題目' }} />
            <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarLabel: '簡報' }} />
            <Tab.Screen name="Library" component={LibraryScreen} options={{ tabBarLabel: 'Library' }} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
