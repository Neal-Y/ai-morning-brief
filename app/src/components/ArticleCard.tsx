import { useRef } from 'react'
import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { FONT, RADIUS, T } from '../theme'
import type { Article } from '../types'

interface Props {
  article: Article
  saved?: boolean
  onAsk?: () => void
  onSave?: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  'model-release': 'MODEL RELEASE',
  'api-platform': 'API · PLATFORM',
  'infra-inference': 'INFRA · INFERENCE',
  'tooling-open-source': 'TOOLING',
  'benchmark-eval': 'BENCHMARK',
  'agent-systems': 'AGENT SYSTEMS',
  'policy-regulation': 'POLICY · REGULATION',
  'company-market': 'COMPANY · MARKET',
  'research-adjacent': 'RESEARCH',
}

function categoryLabel(raw: string): string {
  const tag = raw.startsWith('#') ? raw.slice(1) : raw
  return CATEGORY_LABELS[tag] ?? tag.replace(/-/g, ' · ').toUpperCase()
}

function parseTags(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw.filter((t) => t && t !== '[]')
  if (!raw || raw === '[]') return []
  return raw.split(',').map((t) => t.trim()).filter((t) => t && t !== '[]')
}

const ACTION_BAR_HEIGHT = 76

export function ArticleCard({ article, saved = false, onAsk, onSave }: Props) {
  const isLight = article.renderLevel === 'LIGHT'
  const tags = parseTags(article.skillTags)

  // save animation
  const stampScale = useRef(new Animated.Value(1)).current
  const stampRotate = useRef(new Animated.Value(0)).current
  const rippleScale = useRef(new Animated.Value(0.3)).current
  const rippleOpacity = useRef(new Animated.Value(0)).current

  // read animation
  const readX = useRef(new Animated.Value(0)).current
  const readY = useRef(new Animated.Value(0)).current
  const readOpacity = useRef(new Animated.Value(1)).current

  const handleSave = () => {
    if (!saved) {
      rippleScale.setValue(0.3)
      rippleOpacity.setValue(0)
      Animated.parallel([
        Animated.sequence([
          Animated.timing(stampScale, { toValue: 1.6, duration: 90, useNativeDriver: true }),
          Animated.spring(stampScale, { toValue: 1, damping: 5, stiffness: 280, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(stampRotate, { toValue: -12, duration: 90, useNativeDriver: true }),
          Animated.spring(stampRotate, { toValue: 0, damping: 6, stiffness: 250, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(30),
          Animated.parallel([
            Animated.timing(rippleOpacity, { toValue: 0.7, duration: 60, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(rippleScale, { toValue: 2.8, duration: 450, useNativeDriver: true }),
            Animated.timing(rippleOpacity, { toValue: 0, duration: 420, useNativeDriver: true }),
          ]),
        ]),
      ]).start()
    }
    onSave?.()
  }

  const handleRead = () => {
    Linking.openURL(article.url)
    Animated.parallel([
      Animated.sequence([
        Animated.timing(readX, { toValue: 8, duration: 100, useNativeDriver: true }),
        Animated.spring(readX, { toValue: 0, damping: 7, stiffness: 300, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(readY, { toValue: -8, duration: 100, useNativeDriver: true }),
        Animated.spring(readY, { toValue: 0, damping: 7, stiffness: 300, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(readOpacity, { toValue: 0.25, duration: 80, useNativeDriver: true }),
        Animated.timing(readOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
    ]).start()
  }

  const stampStyle = {
    transform: [
      { scale: stampScale },
      { rotate: stampRotate.interpolate({ inputRange: [-12, 12], outputRange: ['-12deg', '12deg'] }) },
    ],
  }

  return (
    <View style={styles.card}>
      {/* ── category + source ── */}
      <View style={styles.metaRow}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>{categoryLabel(article.categoryTag)}</Text>
        </View>
        {article.source && (
          <Text style={styles.sourceText} numberOfLines={1}>{article.source}</Text>
        )}
      </View>

      {/* ── title ── */}
      <Text style={styles.title}>{article.title}</Text>

      {/* ── shortJudgment italic subtitle ── */}
      {article.shortJudgment && (
        <Text style={styles.subtitle}>{article.shortJudgment}</Text>
      )}

      <View style={styles.divider} />

      {/* ── scrollable body ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: ACTION_BAR_HEIGHT + 4 }}
      >
        {/* CONTEXT — ember left border */}
        {article.reason && (
          <View style={styles.contextBlock}>
            <Text style={styles.contextLabel}>CONTEXT</Text>
            <Text style={styles.contextText}>{article.reason}</Text>
          </View>
        )}

        {/* fallback: summary */}
        {!article.reason && article.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SUMMARY</Text>
            <Text style={styles.bodyText}>{article.summary}</Text>
          </View>
        )}

        {/* ENGINEERING IMPACT — outlined box */}
        {article.engineeringImpact && (
          <View style={styles.impactBox}>
            <View style={styles.impactHeader}>
              <Text style={styles.impactHeaderText}>▶  ENGINEERING IMPACT</Text>
            </View>
            <Text style={styles.impactBody}>{article.engineeringImpact}</Text>
          </View>
        )}

        {/* DEEP CONTEXT — FULL only */}
        {!isLight && article.context && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DEEP CONTEXT</Text>
            <Text style={[styles.bodyText, { color: T.textMuted }]}>{article.context}</Text>
          </View>
        )}

        {/* skill tags */}
        {tags.length > 0 && (
          <Text style={styles.tags}>{tags.map((t) => `#${t}`).join('  ')}</Text>
        )}
      </ScrollView>

      {/* ── action bar — absolute, always at card bottom ── */}
      <View style={styles.actionBar}>
        <View style={styles.actionBarInner}>
          <Pressable style={styles.askBtn} onPress={onAsk}>
            <Feather name="message-square" size={14} color="#fff" />
            <Text style={styles.askLabel}>追問</Text>
          </Pressable>

          <Pressable style={styles.iconBtn} onPress={handleSave}>
            <Animated.View style={[styles.ripple, { transform: [{ scale: rippleScale }], opacity: rippleOpacity }]} />
            <Animated.View style={stampStyle}>
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={saved ? T.accent : T.textMuted}
              />
            </Animated.View>
          </Pressable>

          <Pressable style={styles.iconBtn} onPress={handleRead}>
            <Animated.View style={{ transform: [{ translateX: readX }, { translateY: readY }], opacity: readOpacity }}>
              <Feather name="external-link" size={18} color={T.textMuted} />
            </Animated.View>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 0,
    overflow: 'hidden',
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  categoryPill: {
    borderWidth: 1,
    borderColor: T.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  categoryText: { fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: 1, color: T.accent },
  sourceText: { fontFamily: FONT.mono, fontSize: 10, color: T.textFaint, flex: 1 },

  title: {
    fontFamily: FONT.black,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: T.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONT.regular,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
    color: T.textMuted,
    marginBottom: 14,
  },

  divider: { height: 1, backgroundColor: T.border, marginBottom: 16 },
  scroll: { flex: 1 },

  // CONTEXT — ember left border
  contextBlock: { borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: 12, marginBottom: 18 },
  contextLabel: { fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: 1.5, color: T.textFaint, marginBottom: 5 },
  contextText: { fontFamily: FONT.medium, fontSize: 14, lineHeight: 22, color: T.text },

  // ENGINEERING IMPACT box
  impactBox: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: RADIUS.option,
    overflow: 'hidden',
    marginBottom: 18,
  },
  impactHeader: { borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 12, paddingVertical: 7 },
  impactHeaderText: { fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: 1.5, color: T.textFaint },
  impactBody: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 20, color: T.text, padding: 12 },

  section: { marginBottom: 18 },
  sectionLabel: { fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: 1.5, color: T.textFaint, marginBottom: 5 },
  bodyText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 22, color: T.text },

  tags: { fontFamily: FONT.mono, fontSize: 10, color: T.textFaint, letterSpacing: 0.3 },

  // action bar — position absolute at card bottom
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  actionBarInner: { flexDirection: 'row', gap: 8, alignItems: 'center' },

  askBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: T.accent,
    borderRadius: RADIUS.button,
    paddingVertical: 13,
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  askLabel: { fontFamily: FONT.bold, fontSize: 14, color: '#fff', letterSpacing: 0.2 },

  iconBtn: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: RADIUS.option,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },
  ripple: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: T.accent,
  },
})
