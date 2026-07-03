import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { DotGrid } from '../components/DotGrid'
import { ArticleCard } from '../components/ArticleCard'
import { AskSheet } from '../components/AskSheet'
import { fetchFeed, postFeedback, saveArticle, unsaveArticle } from '../api'
import { FONT, RADIUS, T } from '../theme'
import type { Article } from '../types'

const { width: SW } = Dimensions.get('window')
const SWIPE_THRESHOLD = SW * 0.35
const TILT = 8

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function FeedScreen() {
  const [articles, setArticles] = useState<Article[] | null>(null)
  const [index, setIndex] = useState(0)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [askOpen, setAskOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pan = useRef(new Animated.ValueXY()).current
  const rotate = pan.x.interpolate({
    inputRange: [-SW / 2, 0, SW / 2],
    outputRange: [`-${TILT}deg`, '0deg', `${TILT}deg`],
    extrapolate: 'clamp',
  })
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' })
  const skipOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' })

  useEffect(() => {
    fetchFeed(todayDate())
      .then(setArticles)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  const current = articles?.[index] ?? null
  const next = articles?.[index + 1] ?? null
  const isSaved = current ? saved.has(current.id) : false

  const dismiss = (direction: 'left' | 'right') => {
    Animated.timing(pan, {
      toValue: { x: direction === 'right' ? SW * 1.5 : -SW * 1.5, y: 0 },
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 })
      setIndex((i) => i + 1)
    })
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          if (current) postFeedback(current.id, 1).catch(() => {})
          dismiss('right')
        } else if (g.dx < -SWIPE_THRESHOLD) {
          if (current) postFeedback(current.id, -1).catch(() => {})
          dismiss('left')
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
        }
      },
    }),
  ).current

  const handleSave = () => {
    if (!current) return
    const willSave = !saved.has(current.id)
    setSaved((prev) => {
      const s = new Set(prev)
      if (s.has(current.id)) { s.delete(current.id) } else { s.add(current.id) }
      return s
    })
    if (willSave) {
      saveArticle(current.id).catch(() => {})
    } else {
      unsaveArticle(current.id).catch(() => {})
    }
  }

  if (error) {
    return (
      <DotGrid>
        <SafeAreaView style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </SafeAreaView>
      </DotGrid>
    )
  }

  if (!articles) {
    return (
      <DotGrid>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={T.accent} />
        </SafeAreaView>
      </DotGrid>
    )
  }

  if (articles.length === 0) {
    return (
      <DotGrid>
        <SafeAreaView style={styles.center}>
          <Text style={styles.doneIcon}>◎</Text>
          <Text style={styles.doneTitle}>今日尚無文章</Text>
          <Text style={styles.doneSub}>Pipeline 每天 07:30 台北時間更新</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setArticles(null)
              setError(null)
              fetchFeed(todayDate()).then(setArticles).catch((e: unknown) => setError(String(e)))
            }}
          >
            <Text style={styles.retryLabel}>重新載入</Text>
          </Pressable>
        </SafeAreaView>
      </DotGrid>
    )
  }

  if (index >= articles.length) {
    return (
      <DotGrid>
        <SafeAreaView style={styles.center}>
          <Text style={styles.doneIcon}>✦</Text>
          <Text style={styles.doneTitle}>今日簡報已讀完</Text>
          <Text style={styles.doneSub}>{articles.length} 篇文章</Text>
          <Pressable style={styles.retryBtn} onPress={() => setIndex(0)}>
            <Text style={styles.retryLabel}>重新讀一遍</Text>
          </Pressable>
        </SafeAreaView>
      </DotGrid>
    )
  }

  return (
    <DotGrid>
      <SafeAreaView style={styles.root}>
        {/* header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>每日簡報</Text>
          <Text style={styles.headerCount}>{index + 1} / {articles.length}</Text>
        </View>

        {/* card deck */}
        <View style={styles.deck}>
          {next && (
            <View style={[styles.cardWrap, styles.cardBehind]} pointerEvents="none">
              <ArticleCard article={next} />
            </View>
          )}

          {current && (
            <Animated.View
              style={[styles.cardWrap, {
                transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
              }]}
              {...panResponder.panHandlers}
            >
              <Animated.View style={[styles.hint, styles.hintLike, { opacity: likeOpacity }]}>
                <Text style={styles.hintLabel}>有用 →</Text>
              </Animated.View>
              <Animated.View style={[styles.hint, styles.hintSkip, { opacity: skipOpacity }]}>
                <Text style={styles.hintLabel}>← 略過</Text>
              </Animated.View>

              <ArticleCard
                article={current}
                saved={isSaved}
                onAsk={() => setAskOpen(true)}
                onSave={handleSave}
              />
            </Animated.View>
          )}
        </View>
      </SafeAreaView>

      {current && (
        <AskSheet
          visible={askOpen}
          onClose={() => setAskOpen(false)}
          articleId={current.id}
          context={{ title: current.title, summary: current.summary, context: current.context }}
        />
      )}
    </DotGrid>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: FONT.bold, fontSize: 17, color: T.text },
  headerCount: { fontFamily: FONT.mono, fontSize: 12, color: T.textFaint },

  deck: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  cardWrap: { position: 'absolute', inset: 0 },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }] },

  hint: {
    position: 'absolute',
    top: 20,
    zIndex: 10,
    borderWidth: 1.5,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  hintLike: { right: 16, borderColor: T.correct, backgroundColor: T.correctTint },
  hintSkip: { left: 16, borderColor: T.wrong, backgroundColor: T.wrongTint },
  hintLabel: { fontFamily: FONT.monoBold, fontSize: 12, color: T.text },

  errorText: { fontFamily: FONT.mono, fontSize: 13, color: T.wrong },
  doneIcon: { fontSize: 36, color: T.accent },
  doneTitle: { fontFamily: FONT.black, fontSize: 24, color: T.text },
  doneSub: { fontFamily: FONT.mono, fontSize: 13, color: T.textFaint, textAlign: 'center', marginHorizontal: 24 },
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryLabel: { fontFamily: FONT.monoMed, fontSize: 13, color: T.textMuted },
})
