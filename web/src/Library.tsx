import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { THEME_DARK, TAG_COLORS } from './theme.ts'
import { navigate } from './router.ts'
import { AskSheet } from './components/AskSheet.tsx'
import type { Article } from './types.ts'
import { apiFetch } from './api.ts'
import { useNavInset } from './nav.ts'

const T = THEME_DARK
// Lighter rule for filter-row separators only — keeps the filter bar visually
// distinct from group headers without bumping ruleSoft globally.
const RULE_FAINT = 'rgba(242,237,228,0.10)'
const RULE_MID = 'rgba(242,237,228,0.18)'

interface LibraryArticle extends Omit<Article, 'skillTags' | 'publishedAgo'> {
  skillTags: string
  feedback: 'up' | 'down' | null
  saved: boolean
  notionSynced: boolean
  askMessageCount: number
}

interface LibraryResponse {
  articles: LibraryArticle[]
}

interface UiArticle {
  id: string
  url: string
  title: string
  summary: string
  context: string
  engineeringImpact: string
  reason: string
  categoryTag: string
  skillTags: string[]
  score: number
  source: string | null
  briefDate: string
  dateLabel: string
  feedback: 'up' | 'down' | null
  saved: boolean
  notionSynced: boolean
  askMessageCount: number
  // Cached Article for AskSheet
  asArticle: Article
}

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

function parseBriefDate(dateString: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
}

function formatDateLabel(dateString: string): string {
  const date = parseBriefDate(dateString)
  if (!date) return dateString
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const weekday = WEEKDAYS[date.getUTCDay()]
  return `${month}月${day}日 ${weekday}`
}

function deriveSource(url: string, fallback: string | null): string {
  try {
    return new URL(url).hostname.toUpperCase()
  } catch {
    return (fallback ?? '').toUpperCase()
  }
}

function parseSkillTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function toUi(row: LibraryArticle): UiArticle {
  const skillTags = parseSkillTags(row.skillTags)
  const asArticle: Article = {
    id: row.id,
    url: row.url,
    title: row.title,
    summary: row.summary,
    context: row.context,
    engineeringImpact: row.engineeringImpact,
    reason: row.reason,
    shortJudgment: row.shortJudgment,
    categoryTag: row.categoryTag,
    skillTags,
    renderLevel: row.renderLevel,
    recommendation: row.recommendation,
    score: row.score,
    source: row.source,
    briefDate: row.briefDate,
    publishedAgo: '',
  }
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    summary: row.summary,
    context: row.context,
    engineeringImpact: row.engineeringImpact,
    reason: row.reason,
    categoryTag: row.categoryTag,
    skillTags,
    score: row.score,
    source: deriveSource(row.url, row.source),
    briefDate: row.briefDate,
    dateLabel: formatDateLabel(row.briefDate),
    feedback: row.feedback,
    saved: row.saved,
    notionSynced: row.notionSynced,
    askMessageCount: row.askMessageCount ?? 0,
    asArticle,
  }
}

function fuzzyMatch(a: UiArticle, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (a.title + ' ' + a.summary + ' ' + a.context).toLowerCase().includes(q)
}

const ALL_CATEGORIES = Object.keys(TAG_COLORS)

interface ReactionMark {
  icon: 'bookmark' | 'thumbUp' | 'thumbDown'
  color: string
}

function reactionIcon(article: UiArticle): ReactionMark | null {
  if (article.saved) return { icon: 'bookmark', color: T.accent }
  if (article.feedback === 'up') return { icon: 'thumbUp', color: T.positive }
  if (article.feedback === 'down') return { icon: 'thumbDown', color: T.negative }
  return null
}

function AskCountMark({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      color: T.inkFaint, fontFamily: T.mono, fontSize: 9,
      letterSpacing: 0.4, whiteSpace: 'nowrap',
    }}>
      <Icon name="chat" size={10} color={T.inkFaint} strokeWidth={2} />
      {count}
    </span>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
type IconName =
  | 'arrowLeft' | 'bookmark' | 'chat' | 'externalLink' | 'search' | 'close'
  | 'thumbUp' | 'thumbDown' | 'chevronRight'

function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.8, filled = false }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number; filled?: boolean
}) {
  const stroke = filled && name === 'bookmark' ? 'none' : color
  const fill = filled && name === 'bookmark' ? color : 'none'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={stroke} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {name === 'arrowLeft' && <polyline points="15 18 9 12 15 6" />}
      {name === 'bookmark' && <path d="M5 3h14v18l-7-5-7 5V3z" />}
      {name === 'chat' && <path d="M4 4h16v12H8l-4 4V4z" />}
      {name === 'externalLink' && <><path d="M14 4h6v6"/><path d="M10 14L20 4"/><path d="M20 14v6H4V4h6"/></>}
      {name === 'search' && <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
      {name === 'close' && <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
      {name === 'thumbUp' && <path d="M7 22V11M2 13v7a2 2 0 002 2h11.5a2 2 0 001.96-1.6l1.5-7A2 2 0 0017 11H13V6a3 3 0 00-3-3L7 11"/>}
      {name === 'thumbDown' && <path d="M17 2v11M22 11v-7a2 2 0 00-2-2H8.5a2 2 0 00-1.96 1.6l-1.5 7A2 2 0 007 13h4v5a3 3 0 003 3l3-8"/>}
      {name === 'chevronRight' && <polyline points="9 6 15 12 9 18" />}
    </svg>
  )
}

// ─── Category Tag ─────────────────────────────────────────────────────────────
function CategoryTag({ tag }: { tag: string }) {
  const colors = TAG_COLORS[tag] ?? { fg: T.inkMuted, bg: T.card }
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: 600,
      letterSpacing: 0.5, textTransform: 'uppercase',
      color: colors.fg, background: colors.bg,
      padding: '2px 6px', borderRadius: 2, whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>{tag}</span>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────
function SkeletonRow({ wide = false }: { wide?: boolean }) {
  return (
    <div style={{
      padding: '12px 20px 13px 43px',
      borderBottom: `1px solid ${RULE_FAINT}`,
    }}>
      <div className="lib-skeleton" style={{ height: 14, width: wide ? '85%' : '70%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div className="lib-skeleton" style={{ height: 17, width: 72, borderRadius: 2 }} />
        <div className="lib-skeleton" style={{ height: 10, width: 90 }} />
        <div className="lib-skeleton" style={{ height: 10, width: 24 }} />
      </div>
    </div>
  )
}

function SkeletonGroup() {
  return (
    <div>
      <div style={{
        padding: '16px 20px 8px',
        borderBottom: `1px solid ${RULE_FAINT}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div className="lib-skeleton" style={{ height: 14, width: 110 }} />
        <div className="lib-skeleton" style={{ height: 10, width: 30 }} />
      </div>
      <SkeletonRow wide />
      <SkeletonRow />
      <SkeletonRow wide />
    </div>
  )
}

// ─── Empty States ─────────────────────────────────────────────────────────────
function EmptyState({ type, onClearFilters }: {
  type: 'noData' | 'noResults' | 'noFilter'
  onClearFilters?: () => void
}) {
  const configs = {
    noData:    { headline: '累積中', body: '明天看完第一份 brief 後，\n這裡會開始有東西。', action: null as string | null },
    noResults: { headline: '找不到', body: '試試其他關鍵字？', action: null },
    noFilter:  { headline: '無結果', body: '這個 filter 組合沒有文章。', action: '清除所有 filter' },
  }
  const { headline, body, action } = configs[type]
  return (
    <div style={{
      padding: '56px 32px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center',
    }}>
      <div style={{ width: 52, marginBottom: 20 }}>
        <div style={{ height: 3, background: T.ink }} />
        <div style={{ height: 5 }} />
        <div style={{ height: 1, background: T.ink }} />
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: 9, color: T.inkFaint,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
      }}>The Morning Brief · Library</div>
      <div style={{
        fontFamily: T.serif, fontSize: 30, fontWeight: 900, fontStyle: 'italic',
        color: T.ink, lineHeight: 1.05, letterSpacing: -0.5, marginBottom: 10,
      }}>{headline}</div>
      <p style={{
        fontFamily: T.serif, fontSize: 15, fontStyle: 'italic',
        color: T.inkMuted, lineHeight: 1.55, whiteSpace: 'pre-line',
        marginBottom: action ? 20 : 0,
      }}>{body}</p>
      {action && onClearFilters && (
        <button onClick={onClearFilters} style={{
          fontFamily: T.mono, fontSize: 10, fontWeight: 600,
          letterSpacing: 0.5, textTransform: 'uppercase',
          padding: '9px 20px', borderRadius: 2, cursor: 'pointer',
          background: 'transparent', color: T.ink,
          border: `1.5px solid rgba(242,237,228,0.35)`,
        }}>{action}</button>
      )}
    </div>
  )
}

// ─── Date Group Header ────────────────────────────────────────────────────────
function DateGroupHeader({ label, count, topOffset }: {
  label: string; count: number; topOffset: number
}) {
  return (
    <div style={{
      padding: '14px 20px 8px',
      borderBottom: `1px solid ${RULE_FAINT}`,
      position: 'sticky',
      top: topOffset,
      background: T.bg,
      zIndex: 4,
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    }}>
      <span style={{
        fontFamily: T.serif, fontSize: 13, fontWeight: 700,
        fontStyle: 'italic', color: T.ink, letterSpacing: -0.1,
      }}>{label}</span>
      <span style={{
        fontFamily: T.mono, fontSize: 10, color: T.inkFaint,
        textTransform: 'uppercase', letterSpacing: 1,
      }}>{count} 篇</span>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({
  query, setQuery,
  activeCategories, toggleCategory,
  activeFeedback, toggleFeedback,
  hasAnyFilter, onClearAll,
  topOffset,
  registerRef,
}: {
  query: string
  setQuery: (s: string) => void
  activeCategories: string[]
  toggleCategory: (c: string) => void
  activeFeedback: string[]
  toggleFeedback: (f: string) => void
  hasAnyFilter: boolean
  onClearAll: () => void
  topOffset: number
  registerRef: (el: HTMLDivElement | null) => void
}) {
  return (
    <div ref={registerRef} style={{
      background: T.bg, borderBottom: `1px solid ${RULE_MID}`,
      position: 'sticky', top: topOffset, zIndex: 10,
    }}>
      <div style={{
        padding: '9px 20px 8px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${RULE_FAINT}`,
      }}>
        <Icon name="search" size={14} color={T.inkFaint} />
        <input
          type="text" placeholder="搜尋標題、摘要..."
          value={query} onChange={e => setQuery(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: T.ink, fontFamily: T.sans, fontSize: 14, outline: 'none',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            display: 'inline-flex',
          }}>
            <Icon name="close" size={14} color={T.inkFaint} />
          </button>
        )}
        {hasAnyFilter && !query && (
          <button onClick={onClearAll} style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 600,
            letterSpacing: 0.5, textTransform: 'uppercase',
            padding: '4px 8px', borderRadius: 2, cursor: 'pointer',
            background: 'transparent', color: T.accent,
            border: `1px solid ${T.accent}`,
          }}>清除</button>
        )}
      </div>

      <div style={{
        padding: '7px 20px 8px',
        display: 'flex', gap: 5, overflowX: 'auto',
        alignItems: 'center', scrollbarWidth: 'none',
      }}>
        <div style={{
          display: 'flex', gap: 5, alignItems: 'center',
          padding: '2px 6px 2px 4px',
          border: `1px solid rgba(242,237,228,0.12)`,
          borderRadius: 2, flexShrink: 0,
        }}>
          {[
            { id: 'up', label: '👍', title: '篩選：我喜歡過的' },
            { id: 'down', label: '👎', title: '篩選：我不喜歡過的' },
            { id: 'saved', label: '🔖', title: '篩選：已收藏' },
          ].map(chip => {
            const active = activeFeedback.includes(chip.id)
            return (
              <button key={chip.id} onClick={() => toggleFeedback(chip.id)} title={chip.title} style={{
                fontFamily: T.mono, fontSize: 13, lineHeight: 1,
                padding: '4px 6px', borderRadius: 2, cursor: 'pointer',
                background: active ? T.ink : 'transparent',
                border: `1px solid ${active ? T.ink : 'transparent'}`,
                opacity: active ? 1 : 0.65,
                transition: 'all 0.15s',
              }}>{chip.label}</button>
            )
          })}
        </div>

        <div style={{ width: 1, height: 18, background: 'rgba(242,237,228,0.15)', flexShrink: 0, margin: '0 3px' }} />

        {ALL_CATEGORIES.map(cat => {
          const active = activeCategories.includes(cat)
          const colors = TAG_COLORS[cat] ?? { fg: T.ink, bg: T.card }
          return (
            <button key={cat} onClick={() => toggleCategory(cat)} style={{
              fontFamily: T.mono, fontSize: 9, fontWeight: 600,
              letterSpacing: 0.4, whiteSpace: 'nowrap',
              padding: '5px 8px', borderRadius: 2, cursor: 'pointer',
              background: active ? colors.bg : 'transparent',
              color: active ? colors.fg : T.inkFaint,
              border: `1px solid ${active ? colors.bg : 'rgba(242,237,228,0.15)'}`,
              transition: 'all 0.15s', textTransform: 'uppercase', flexShrink: 0,
            }}>{cat}</button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Article Row ──────────────────────────────────────────────────────────────
function ArticleRow({ article, onToggleSave, onAsk }: {
  article: UiArticle
  onToggleSave: (a: UiArticle) => void
  onAsk: (a: UiArticle) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const reaction = reactionIcon(article)

  return (
    <div style={{ borderBottom: `1px solid ${RULE_FAINT}` }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: '12px 20px', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}
      >
        <div style={{
          paddingTop: 3, flexShrink: 0, opacity: 0.3,
          transition: 'transform 0.2s ease',
          transform: expanded ? 'rotate(90deg)' : 'none',
        }}>
          <Icon name="chevronRight" size={13} color={T.ink} strokeWidth={2.2} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.serif, fontSize: 16, fontWeight: 600,
            color: T.ink, lineHeight: 1.28, letterSpacing: -0.1,
            marginBottom: 5,
          }}>{article.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <CategoryTag tag={article.categoryTag} />
            <span style={{
              fontFamily: T.mono, fontSize: 10, color: T.inkFaint,
              textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap',
            }}>{article.source}</span>
            <span style={{ color: T.inkFaint, fontFamily: T.mono, fontSize: 10 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint }}>{article.score}</span>
            {reaction && (
              <span style={{ display: 'flex', alignItems: 'center', marginLeft: 1 }}>
                <Icon name={reaction.icon} size={11} color={reaction.color} strokeWidth={2}
                  filled={reaction.icon === 'bookmark'} />
              </span>
            )}
            <AskCountMark count={article.askMessageCount} />
          </div>
        </div>
      </div>

      {expanded && (
        <ExpandedBody article={article} onToggleSave={onToggleSave} onAsk={onAsk} variant="all" />
      )}
    </div>
  )
}

// ─── Saves Row ────────────────────────────────────────────────────────────────
function SavesRow({ article, onToggleSave, onAsk }: {
  article: UiArticle
  onToggleSave: (a: UiArticle) => void
  onAsk: (a: UiArticle) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const synced = article.notionSynced
  return (
    <div style={{ borderBottom: `1px solid ${RULE_FAINT}` }}>
      <div onClick={() => setExpanded(v => !v)} style={{
        padding: '12px 20px', cursor: 'pointer',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{
          paddingTop: 3, flexShrink: 0, opacity: 0.3,
          transition: 'transform 0.2s ease',
          transform: expanded ? 'rotate(90deg)' : 'none',
        }}>
          <Icon name="chevronRight" size={13} color={T.ink} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.serif, fontSize: 16, fontWeight: 600,
            color: T.ink, lineHeight: 1.28, letterSpacing: -0.1,
            marginBottom: 5,
          }}>{article.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <CategoryTag tag={article.categoryTag} />
            <span style={{
              fontFamily: T.mono, fontSize: 10, color: T.inkFaint, letterSpacing: 0.3,
            }}>{article.dateLabel.split(' ')[0]}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: synced ? T.positive : 'transparent',
                border: `1.5px solid ${synced ? T.positive : T.inkFaint}`,
                flexShrink: 0, display: 'inline-block',
              }} />
              <span style={{
                fontFamily: T.mono, fontSize: 9, letterSpacing: 0.5,
                color: synced ? T.positive : T.inkFaint, textTransform: 'uppercase',
              }}>{synced ? 'Notion' : '待同步'}</span>
            </span>
            <AskCountMark count={article.askMessageCount} />
          </div>
        </div>
      </div>
      {expanded && (
        <ExpandedBody article={article} onToggleSave={onToggleSave} onAsk={onAsk} variant="saves" />
      )}
    </div>
  )
}

// ─── Expanded body (shared by ArticleRow + SavesRow) ──────────────────────────
function ExpandedBody({ article, onToggleSave, onAsk, variant }: {
  article: UiArticle
  onToggleSave: (a: UiArticle) => void
  onAsk: (a: UiArticle) => void
  variant: 'all' | 'saves'
}) {
  return (
    <div style={{
      padding: '2px 20px 18px 43px',
      borderTop: `1px solid ${RULE_FAINT}`,
      animation: 'libFadeIn 0.15s ease',
    }}>
      <p style={{
        fontFamily: T.serif, fontSize: 15, lineHeight: 1.52,
        fontStyle: 'italic', color: T.inkMuted,
        margin: '12px 0 10px',
      }}>{article.summary}</p>

      <div style={{ height: 1, background: RULE_FAINT, marginBottom: 12 }} />

      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: 700,
          color: T.inkFaint, letterSpacing: 1.5,
          textTransform: 'uppercase', marginBottom: 5,
        }}>Context</div>
        <p style={{
          fontFamily: T.sans, fontSize: 13, lineHeight: 1.6,
          color: T.ink, margin: 0,
        }}>{article.context}</p>
      </div>

      <div style={{
        background: T.bgDeep,
        border: `1.5px solid rgba(242,237,228,0.18)`,
        borderRadius: 2, padding: '12px 14px',
        position: 'relative', marginBottom: 10,
      }}>
        <div style={{
          position: 'absolute', top: -7, left: 10,
          background: T.bg, padding: '0 5px',
          fontFamily: T.mono, fontSize: 8, fontWeight: 700,
          color: T.inkFaint, letterSpacing: 2, textTransform: 'uppercase',
        }}>▸ Engineering Impact</div>
        <p style={{
          fontFamily: T.sans, fontSize: 13, lineHeight: 1.5,
          color: T.ink, margin: 0, fontWeight: 500,
        }}>{article.engineeringImpact}</p>
      </div>

      {article.reason && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14 }}>
          <div style={{ width: 3, height: 12, background: T.accent, marginTop: 2, flexShrink: 0 }} />
          <span style={{
            fontFamily: T.sans, fontSize: 12, fontStyle: 'italic',
            color: T.accent, fontWeight: 500, lineHeight: 1.4,
          }}>{article.reason}</span>
        </div>
      )}

      {article.skillTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          {article.skillTags.map(t => (
            <span key={t} style={{
              fontFamily: T.mono, fontSize: 9, color: T.inkFaint, letterSpacing: 0.3,
            }}>{t}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {variant === 'all' ? (
          <ActionButton
            label={article.saved ? '已收藏' : '收藏'}
            icon="bookmark"
            filled={article.saved}
            active={article.saved}
            onClick={(e) => { e.stopPropagation(); onToggleSave(article) }}
          />
        ) : (
          <ActionButton
            label="移除收藏"
            icon="bookmark"
            tone="negative"
            onClick={(e) => { e.stopPropagation(); onToggleSave(article) }}
          />
        )}
        <ActionButton
          label="追問" icon="chat"
          onClick={(e) => { e.stopPropagation(); onAsk(article) }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation()
            window.open(article.url, '_blank', 'noopener,noreferrer')
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: T.mono, fontSize: 10, fontWeight: 600,
            letterSpacing: 0.5, textTransform: 'uppercase',
            padding: '7px 4px', cursor: 'pointer',
            background: 'transparent', color: T.inkMuted,
            border: 'none',
          }}
        >
          <Icon name="externalLink" size={11} color={T.inkMuted} strokeWidth={2} />
          原文
        </button>
      </div>
    </div>
  )
}

function ActionButton({ label, icon, filled, active, tone, onClick }: {
  label: string
  icon: IconName
  filled?: boolean
  active?: boolean
  tone?: 'negative'
  onClick: (e: React.MouseEvent) => void
}) {
  let color = T.ink
  let borderColor = 'rgba(242,237,228,0.28)'
  let background: string = 'transparent'
  if (active) {
    color = '#fff'
    background = T.accent
    borderColor = T.accent
  } else if (tone === 'negative') {
    color = T.negative
    borderColor = T.negative
  }
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontFamily: T.mono, fontSize: 10, fontWeight: 600,
      letterSpacing: 0.5, textTransform: 'uppercase',
      padding: '7px 12px', borderRadius: 2, cursor: 'pointer',
      background, color, border: `1.5px solid ${borderColor}`,
      transition: 'all 0.15s',
    }}>
      <Icon name={icon} size={11} color={color} strokeWidth={2} filled={filled} />
      {label}
    </button>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Library() {
  const navInset = useNavInset()
  const [tab, setTab] = useState<'all' | 'saves'>('all')
  const [query, setQuery] = useState('')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [activeFeedback, setActiveFeedback] = useState<string[]>([])
  const [articles, setArticles] = useState<UiArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [askArticle, setAskArticle] = useState<Article | null>(null)
  const [askVisible, setAskVisible] = useState(false)
  const askUnmountTimerRef = useRef<number | null>(null)
  const saveInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/library')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<LibraryResponse>
      })
      .then(data => {
        if (cancelled) return
        setArticles(data.articles.map(toUi))
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('無法載入 Library')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  function toggleCategory(cat: string) {
    setActiveCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }
  function toggleFeedback(f: string) {
    setActiveFeedback(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
  }
  function clearAllFilters() {
    setQuery(''); setActiveCategories([]); setActiveFeedback([])
  }

  async function handleToggleSave(article: UiArticle) {
    if (saveInFlightRef.current.has(article.id)) return
    saveInFlightRef.current.add(article.id)
    const next = !article.saved
    // Optimistic update — flip immediately; reconcile on response. notionSynced
    // resets on unsave (no Notion page anymore) and stays false on a new save
    // until the server confirms the Notion call succeeded.
    setArticles(prev => prev.map(a => a.id === article.id
      ? { ...a, saved: next, notionSynced: next ? a.notionSynced : false }
      : a))
    try {
      if (next) {
        const res = await apiFetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id }),
        })
        const data = await res.json().catch(() => ({})) as { ok?: boolean; notionSynced?: boolean }
        if (!data.ok) throw new Error('save failed')
        setArticles(prev => prev.map(a => a.id === article.id
          ? { ...a, notionSynced: !!data.notionSynced }
          : a))
      } else {
        const res = await apiFetch('/api/unsave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id }),
        })
        const data = await res.json().catch(() => ({})) as { ok?: boolean }
        if (!data.ok) throw new Error('unsave failed')
      }
    } catch {
      // Revert on failure so the UI doesn't lie.
      setArticles(prev => prev.map(a => a.id === article.id
        ? { ...a, saved: article.saved, notionSynced: article.notionSynced }
        : a))
    } finally {
      saveInFlightRef.current.delete(article.id)
    }
  }

  function clearAskUnmountTimer() {
    if (askUnmountTimerRef.current === null) return
    clearTimeout(askUnmountTimerRef.current)
    askUnmountTimerRef.current = null
  }

  function openAsk(article: UiArticle) {
    clearAskUnmountTimer()
    setAskArticle(article.asArticle)
    setAskVisible(true)
  }
  function closeAsk() {
    clearAskUnmountTimer()
    setAskVisible(false)
    // delay unmounting to let the sheet animate out
    askUnmountTimerRef.current = window.setTimeout(() => {
      askUnmountTimerRef.current = null
      setAskArticle(null)
    }, 300)
  }
  function handleAskHistorySaved(articleId: string, messageCount: number) {
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, askMessageCount: messageCount } : a))
  }

  const hasAnyFilter = query.length > 0 || activeCategories.length > 0 || activeFeedback.length > 0

  const filteredArticles = useMemo(() => {
    return articles.filter(a => {
      if (!fuzzyMatch(a, query)) return false
      if (activeCategories.length > 0 && !activeCategories.includes(a.categoryTag)) return false
      if (activeFeedback.length > 0) {
        const ok = activeFeedback.some(f =>
          (f === 'up' && a.feedback === 'up') ||
          (f === 'down' && a.feedback === 'down') ||
          (f === 'saved' && a.saved)
        )
        if (!ok) return false
      }
      return true
    })
  }, [articles, query, activeCategories, activeFeedback])

  const groups = useMemo(() => {
    const byDate = new Map<string, { label: string; items: UiArticle[] }>()
    for (const a of filteredArticles) {
      let g = byDate.get(a.briefDate)
      if (!g) { g = { label: a.dateLabel, items: [] }; byDate.set(a.briefDate, g) }
      g.items.push(a)
    }
    return Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredArticles])

  const saves = useMemo(() => articles.filter(a => a.saved), [articles])
  const savesSynced = saves.filter(a => a.notionSynced).length

  // Three-tier sticky stack: chrome → filter bar → date headers. Date headers
  // need to know exact (chromeH + filterH) and that height is dynamic (search
  // input grows the bar by a few px on focus, fonts may shift). Measure on
  // every tab change + on resize. ResizeObserver catches the input-focus delta.
  const chromeRef = useRef<HTMLDivElement | null>(null)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const [chromeH, setChromeH] = useState(108)
  const [filterH, setFilterH] = useState(80)

  useLayoutEffect(() => {
    const measure = () => {
      if (chromeRef.current) setChromeH(chromeRef.current.offsetHeight)
      if (filterRef.current) setFilterH(filterRef.current.offsetHeight)
    }
    measure()
    const ros: ResizeObserver[] = []
    if (chromeRef.current && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(measure)
      ro.observe(chromeRef.current)
      ros.push(ro)
    }
    if (filterRef.current && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(measure)
      ro.observe(filterRef.current)
      ros.push(ro)
    }
    window.addEventListener('resize', measure)
    return () => {
      ros.forEach(ro => ro.disconnect())
      window.removeEventListener('resize', measure)
    }
  }, [tab])

  const stickyTop = chromeH + filterH

  useEffect(() => {
    document.documentElement.style.background = T.bg
    document.body.style.background = T.bg
  }, [])

  useEffect(() => () => clearAskUnmountTimer(), [])

  return (
    <>
      <style>{`
        @keyframes libFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        @keyframes libShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        .lib-skeleton {
          background: linear-gradient(90deg, ${T.card} 25%, #2A2520 50%, ${T.card} 75%);
          background-size: 800px 100%;
          animation: libShimmer 1.4s infinite linear;
          border-radius: 2px;
        }
        .lib-root input::placeholder { color: ${T.inkFaint}; }
        .lib-root ::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="lib-root" style={{
        maxWidth: 720, margin: '0 auto', height: '100%',
        paddingBottom: navInset,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        display: 'flex', flexDirection: 'column',
        background: T.bg, fontFamily: T.sans,
        color: T.ink,
      }}>
        <div ref={chromeRef} style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          background: T.bg, borderBottom: `1px solid ${RULE_MID}`,
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px 12px',
          }}>
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.inkMuted, padding: 0,
                fontFamily: T.mono, fontSize: 10, fontWeight: 600,
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}
            >
              <Icon name="arrowLeft" size={14} color={T.inkMuted} strokeWidth={2} />
              今日
            </button>
            <span style={{
              fontFamily: T.serif, fontSize: 18, fontWeight: 900,
              fontStyle: 'italic', color: T.ink, letterSpacing: -0.3,
            }}>Library</span>
            <div style={{ width: 48 }} />
          </div>

          <div style={{ display: 'flex', borderTop: `1px solid ${RULE_FAINT}` }}>
            {([
              { id: 'all' as const, label: '所有歷史', count: articles.length },
              { id: 'saves' as const, label: '收藏', count: saves.length },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, padding: '10px 0',
                background: 'none', border: 'none',
                borderBottom: tab === t.id ? `2px solid ${T.ink}` : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                letterSpacing: 0.8, textTransform: 'uppercase',
                color: tab === t.id ? T.ink : T.inkFaint,
                transition: 'color 0.15s',
              }}>
                {t.label}
                <span style={{
                  marginLeft: 5, fontFamily: T.mono, fontSize: 9,
                  color: tab === t.id ? T.accent : T.inkFaint,
                }}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {tab === 'all' && (
          <>
            <FilterBar
              query={query} setQuery={setQuery}
              activeCategories={activeCategories} toggleCategory={toggleCategory}
              activeFeedback={activeFeedback} toggleFeedback={toggleFeedback}
              hasAnyFilter={hasAnyFilter} onClearAll={clearAllFilters}
              topOffset={chromeH}
              registerRef={(el) => { filterRef.current = el }}
            />

            <div style={{ flex: 1 }}>
              {loading ? (
                <><SkeletonGroup /><SkeletonGroup /></>
              ) : error ? (
                <div style={{
                  padding: '40px 20px', textAlign: 'center',
                  fontFamily: T.mono, fontSize: 11, color: T.inkFaint, letterSpacing: 1,
                }}>{error}</div>
              ) : articles.length === 0 ? (
                <EmptyState type="noData" />
              ) : groups.length === 0 ? (
                <EmptyState
                  type={hasAnyFilter ? (query ? 'noResults' : 'noFilter') : 'noData'}
                  onClearFilters={clearAllFilters}
                />
              ) : (
                groups.map(([date, group]) => (
                  <div key={date}>
                    <DateGroupHeader label={group.label} count={group.items.length} topOffset={stickyTop} />
                    {group.items.map(a => (
                      <ArticleRow key={a.id} article={a} onToggleSave={handleToggleSave} onAsk={openAsk} />
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'saves' && (
          <div style={{ flex: 1 }}>
            {loading ? (
              <><SkeletonGroup /></>
            ) : saves.length === 0 ? (
              <EmptyState type="noData" />
            ) : (
              <>
                <div style={{
                  padding: '10px 20px', borderBottom: `1px solid ${RULE_FAINT}`,
                  display: 'flex', gap: 28, alignItems: 'baseline',
                }}>
                  {[
                    { label: '已收藏', value: saves.length, color: T.ink },
                    { label: '已同步', value: savesSynced, color: T.positive },
                    { label: '待同步', value: saves.length - savesSynced, color: T.ink },
                  ].map(stat => (
                    <div key={stat.label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{
                        fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: stat.color,
                      }}>{stat.value}</span>
                      <span style={{
                        fontFamily: T.mono, fontSize: 9, color: T.inkFaint,
                        letterSpacing: 1, textTransform: 'uppercase',
                      }}>{stat.label}</span>
                    </div>
                  ))}
                </div>
                {saves.map(a => (
                  <SavesRow key={a.id} article={a} onToggleSave={handleToggleSave} onAsk={openAsk} />
                ))}
              </>
            )}
          </div>
        )}

        {askArticle && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'auto',
          }}>
            <div style={{
              position: 'relative', width: '100%', maxWidth: 720, height: '100%',
            }}>
              <AskSheet
                theme={T}
                article={askArticle}
                visible={askVisible}
                onClose={closeAsk}
                fullScreen
                onHistorySaved={handleAskHistorySaved}
              />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
