import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Markdown from 'react-native-markdown-display'
import { FONT, RADIUS, T } from '../theme'
import { fetchAskHistory, saveAskHistory, streamAsk, type AskContext, type AskMessage } from '../api'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  visible: boolean
  onClose: () => void
  articleId: string
  context: AskContext
}

const INTRO: Message = { role: 'assistant', text: '關於這題，想更深入哪個方向？' }
const SUGGESTIONS = [
  '為什麼其他選項不對？',
  '這在 production 上實務怎麼用？',
  '有沒有常見的誤解或陷阱？',
]

const SCREEN_H = Dimensions.get('window').height

export function AskSheet({ visible, onClose, articleId, context }: Props) {
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INTRO])
  const [history, setHistory] = useState<AskMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const anim = useRef(new Animated.Value(0)).current
  const scrollRef = useRef<ScrollView>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamedRef = useRef('')

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      fetchAskHistory(articleId).then((hist) => {
        if (hist.length > 0) {
          setHistory(hist)
          setMessages(hist.map((m) => ({ role: m.role, text: m.content })))
        }
      }).catch(() => {})
    } else if (mounted) {
      abortRef.current?.abort()
      Animated.timing(anim, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
        setMounted(false)
        setMessages([INTRO])
        setHistory([])
        setInput('')
        setLoading(false)
      })
    }
  }, [visible, mounted, anim, articleId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const hasConversation = messages.some((m) => m.role === 'user')

  const send = async (text: string) => {
    const q = text.trim()
    if (loading || !q) return
    const nextHistory: AskMessage[] = [...history, { role: 'user', content: q }]
    streamedRef.current = ''
    setHistory(nextHistory)
    setMessages((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '' }])
    setInput('')
    setLoading(true)
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamAsk(
        context,
        nextHistory,
        (delta) => {
          streamedRef.current += delta
          const text = streamedRef.current
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            return [...prev.slice(0, -1), { role: 'assistant', text }]
          })
          scrollRef.current?.scrollToEnd({ animated: false })
        },
        controller.signal,
      )
      const fullHistory: AskMessage[] = [...nextHistory, { role: 'assistant', content: streamedRef.current }]
      setHistory(fullHistory)
      saveAskHistory(articleId, fullHistory).catch(() => {})
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('[AskSheet] stream error:', err)
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', text: '抱歉，發生錯誤，請再試一次。' },
      ])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }

  if (!mounted) return null

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] })
  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] })

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>ASK CLAUDE · HAIKU 4.5</Text>
                <Text style={styles.title} numberOfLines={1}>{context.title}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((m, i) => {
                const isPlaceholder =
                  loading && i === messages.length - 1 && m.role === 'assistant' && m.text === ''
                if (isPlaceholder) {
                  return (
                    <View key={i} style={[styles.bubble, styles.assistantBubble]}>
                      <ActivityIndicator color={T.textMuted} size="small" />
                    </View>
                  )
                }
                if (m.role === 'user') {
                  return (
                    <View key={i} style={[styles.bubble, styles.userBubble]}>
                      <Text style={styles.userText}>{m.text}</Text>
                    </View>
                  )
                }
                return (
                  <View key={i} style={[styles.bubble, styles.assistantBubble]}>
                    <Markdown style={markdownStyles}>{m.text}</Markdown>
                  </View>
                )
              })}

              {!hasConversation && (
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((s, i) => (
                    <Pressable key={i} style={styles.suggestion} onPress={() => send(s)}>
                      <Text style={styles.suggestionText}>→ {s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={loading ? '思考中…' : '繼續追問…'}
                placeholderTextColor={T.textFaint}
                editable={!loading}
                style={styles.input}
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
              />
              <Pressable
                onPress={() => send(input)}
                disabled={loading || !input.trim()}
                style={[styles.sendBtn, (loading || !input.trim()) && styles.sendBtnDisabled]}
              >
                <Text style={styles.sendText}>送出</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const markdownStyles = {
  body: { color: T.text, fontFamily: FONT.regular, fontSize: 14, lineHeight: 22 },
  heading1: { color: T.text, fontFamily: FONT.bold, fontSize: 16, marginBottom: 6, marginTop: 2 },
  heading2: { color: T.text, fontFamily: FONT.bold, fontSize: 15, marginBottom: 6, marginTop: 8 },
  heading3: { color: T.text, fontFamily: FONT.bold, fontSize: 14, marginBottom: 4, marginTop: 6 },
  strong: { fontFamily: FONT.bold, color: T.text },
  bullet_list: { marginBottom: 6 },
  ordered_list: { marginBottom: 6 },
  list_item: { marginBottom: 3 },
  code_inline: {
    fontFamily: FONT.mono,
    fontSize: 13,
    color: T.accentHi,
    backgroundColor: T.surface,
    borderRadius: 4,
  },
  // Override library light-background defaults so quoted/code blocks fit the dark theme.
  blockquote: {
    backgroundColor: T.surface,
    borderColor: T.accent,
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 4,
  },
  code_block: {
    backgroundColor: T.surface,
    color: T.text,
    fontFamily: FONT.mono,
    fontSize: 13,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    padding: 10,
  },
  fence: {
    backgroundColor: T.surface,
    color: T.text,
    fontFamily: FONT.mono,
    fontSize: 13,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    padding: 10,
  },
  hr: { backgroundColor: T.border, height: 1, marginVertical: 10 },
  link: { color: T.accent },
} as const

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    height: '90%',
    backgroundColor: T.page,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: T.border,
    marginTop: 8,
    marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: T.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: FONT.mono, fontSize: 9, color: T.textFaint, letterSpacing: 1.5 },
  title: { fontFamily: FONT.bold, fontSize: 14, color: T.text, marginTop: 2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: T.textMuted, fontSize: 14, fontFamily: FONT.medium },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 28, gap: 10 },
  bubble: { maxWidth: '90%', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: T.accentSoft },
  userText: { color: T.text, fontFamily: FONT.medium, fontSize: 14, lineHeight: 21 },
  // Assistant answers flow borderless + full width (like a doc), not boxed —
  // long structured replies read far better than crammed into a bordered bubble.
  assistantBubble: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  suggestions: { gap: 8, marginTop: 2 },
  suggestion: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionText: { color: T.textMuted, fontFamily: FONT.medium, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1,
    borderColor: T.border,
  },
  input: {
    flex: 1,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.text,
    fontFamily: FONT.regular,
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: T.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 14 },
})
