import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { DotGrid } from '../components/DotGrid'
import { AskSheet } from '../components/AskSheet'
import { fetchLibrary, saveArticle, unsaveArticle, type LibraryArticle } from '../api'
import { CATEGORY_LABELS } from '../types'
import { FONT, RADIUS, T } from '../theme'

type Tab = 'all' | 'saved'

function categoryLabel(raw: string) {
  const tag = raw.startsWith('#') ? raw.slice(1) : raw
  return CATEGORY_LABELS[tag] ?? tag.replace(/-/g, ' ').toUpperCase()
}

function formatDate(d: string) {
  return d.slice(0, 10) // YYYY-MM-DD
}

interface ArticleRowProps {
  article: LibraryArticle
  onAsk: () => void
  onToggleSave: () => void
}

function ArticleRow({ article, onAsk, onToggleSave }: ArticleRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isLight = article.renderLevel === 'LIGHT'

  return (
    <View style={styles.row}>
      {/* header — always visible */}
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.rowHeader}>
        <View style={styles.rowMeta}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{categoryLabel(article.categoryTag)}</Text>
          </View>
          {article.feedback === 'up' && <Text style={styles.feedbackDot}>↑</Text>}
          {article.feedback === 'down' && <Text style={[styles.feedbackDot, { color: T.wrong }]}>↓</Text>}
        </View>
        <Text style={styles.rowTitle} numberOfLines={expanded ? undefined : 2}>
          {article.title}
        </Text>
        <View style={styles.rowFooter}>
          <Text style={styles.rowDate}>{formatDate(article.briefDate)}</Text>
          {article.source && (
            <Text style={styles.rowSource}>· {article.source}</Text>
          )}
          <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      {/* expanded content */}
      {expanded && (
        <View style={styles.expandedBody}>
          <View style={styles.divider} />

          {article.shortJudgment && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>一句判斷</Text>
              <Text style={styles.sectionText}>{article.shortJudgment}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>摘要</Text>
            <Text style={styles.sectionText}>{article.summary}</Text>
          </View>

          {!isLight && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>工程影響</Text>
                <Text style={styles.sectionText}>{article.engineeringImpact}</Text>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>深入脈絡</Text>
                <Text style={styles.sectionText}>{article.context}</Text>
              </View>
            </>
          )}

          {/* action row */}
          <View style={styles.expandedActions}>
            <Pressable onPress={() => Linking.openURL(article.url)} style={styles.actionBtn}>
              <Text style={styles.actionLabel}>↗ 原文</Text>
            </Pressable>
            <Pressable onPress={onAsk} style={styles.actionBtn}>
              <Feather name="message-square" size={11} color={T.textMuted} />
              <Text style={styles.actionLabel}>追問</Text>
            </Pressable>
            <Pressable
              onPress={onToggleSave}
              style={[styles.actionBtn, article.saved && styles.actionBtnSaved]}
            >
              <Text style={[styles.actionLabel, article.saved && styles.actionLabelSaved]}>
                {article.saved ? '✦ 已收藏' : '✦ 收藏'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

export function LibraryScreen() {
  const [tab, setTab] = useState<Tab>('all')
  const [articles, setArticles] = useState<LibraryArticle[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [askTarget, setAskTarget] = useState<LibraryArticle | null>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const data = await fetchLibrary()
      setArticles(data)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load().catch(() => {})
    setRefreshing(false)
  }, [load])

  const handleToggleSave = useCallback((article: LibraryArticle) => {
    setArticles((prev) =>
      prev?.map((a) =>
        a.id === article.id ? { ...a, saved: !a.saved } : a
      ) ?? prev
    )
    if (article.saved) {
      unsaveArticle(article.id).catch(() => {})
    } else {
      saveArticle(article.id).catch(() => {})
    }
  }, [])

  const visible = articles
    ? tab === 'saved'
      ? articles.filter((a) => a.saved)
      : articles
    : null

  // group by date for 'all' tab
  const groups: { date: string; items: LibraryArticle[] }[] = []
  if (visible && tab === 'all') {
    for (const a of visible) {
      const d = formatDate(a.briefDate)
      const last = groups[groups.length - 1]
      if (last && last.date === d) {
        last.items.push(a)
      } else {
        groups.push({ date: d, items: [a] })
      }
    }
  }

  return (
    <DotGrid>
      <SafeAreaView style={styles.root}>
        {/* header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Library</Text>
          {articles && (
            <Text style={styles.headerCount}>
              {tab === 'saved'
                ? `${articles.filter((a) => a.saved).length} 收藏`
                : `${articles.length} 篇`}
            </Text>
          )}
        </View>

        {/* tabs */}
        <View style={styles.tabs}>
          {(['all', 'saved'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                {t === 'all' ? '全部' : '收藏'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* content */}
        {loadError ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>載入失敗，請稍後再試</Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>重新載入</Text>
            </Pressable>
          </View>
        ) : !visible ? (
          <View style={styles.center}>
            <ActivityIndicator color={T.accent} />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {tab === 'saved' ? '尚未收藏任何文章' : '歷史紀錄為空'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'all'
              ? groups.map((g) => (
                  <View key={g.date} style={styles.group}>
                    <Text style={styles.groupDate}>{g.date}</Text>
                    {g.items.map((a) => (
                      <ArticleRow
                        key={a.id}
                        article={a}
                        onAsk={() => setAskTarget(a)}
                        onToggleSave={() => handleToggleSave(a)}
                      />
                    ))}
                  </View>
                ))
              : visible.map((a) => (
                  <ArticleRow
                    key={a.id}
                    article={a}
                    onAsk={() => setAskTarget(a)}
                    onToggleSave={() => handleToggleSave(a)}
                  />
                ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {askTarget && (
        <AskSheet
          visible
          onClose={() => setAskTarget(null)}
          articleId={askTarget.id}
          context={{ title: askTarget.title, summary: askTarget.summary, context: askTarget.context }}
        />
      )}
    </DotGrid>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: FONT.bold, fontSize: 17, color: T.text },
  headerCount: { fontFamily: FONT.mono, fontSize: 12, color: T.textFaint },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: T.border,
  },
  tabActive: { backgroundColor: T.accentSoft, borderColor: T.accent },
  tabLabel: { fontFamily: FONT.monoMed, fontSize: 12, color: T.textFaint },
  tabLabelActive: { color: T.accent },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },

  group: { marginBottom: 8 },
  groupDate: {
    fontFamily: FONT.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: T.textFaint,
    textTransform: 'uppercase',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },

  row: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  rowHeader: { padding: 14 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pill: {
    backgroundColor: T.accentSoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { fontFamily: FONT.monoBold, fontSize: 9, letterSpacing: 1, color: T.accent },
  feedbackDot: { fontFamily: FONT.monoBold, fontSize: 12, color: T.correct },
  rowTitle: { fontFamily: FONT.bold, fontSize: 15, lineHeight: 22, color: T.text, marginBottom: 8 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowDate: { fontFamily: FONT.mono, fontSize: 11, color: T.textFaint },
  rowSource: { fontFamily: FONT.mono, fontSize: 11, color: T.textFaint, flex: 1 },
  expandChevron: { fontFamily: FONT.mono, fontSize: 10, color: T.textFaint },

  expandedBody: { paddingHorizontal: 14, paddingBottom: 14 },
  divider: { height: 1, backgroundColor: T.border, marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionLabel: {
    fontFamily: FONT.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: T.textFaint,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionText: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 20, color: T.textMuted },

  expandedActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnSaved: { borderColor: T.accent },
  actionLabel: { fontFamily: FONT.monoMed, fontSize: 11, color: T.textMuted },
  actionLabelSaved: { color: T.accent },

  emptyText: { fontFamily: FONT.mono, fontSize: 13, color: T.textFaint },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: T.border,
  },
  retryText: { fontFamily: FONT.monoMed, fontSize: 13, color: T.textMuted },
})
