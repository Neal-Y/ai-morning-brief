import { useEffect, useRef, useState } from 'react'
import { THEME_DARK } from '../../theme.ts'
import { shuffleWithOrigin, type OrderingQuiz } from '../../quiz/types.ts'
import { QuizFrame, PrimaryButton, type AnswerAreaApi, type QuizChromeProps } from './QuizFrame.tsx'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

type Props = Omit<QuizChromeProps, 'id' | 'category' | 'prompt' | 'explanation' | 'source'> & {
  quiz: OrderingQuiz
}

type RowState = 'idle' | 'selected' | 'right' | 'wrong'

export function OrderingCard({ quiz, ...chrome }: Props) {
  const [arrangement, setArrangement] = useState(() => shuffleWithOrigin(quiz.items))

  return (
    <QuizFrame
      id={quiz.id}
      category={quiz.category}
      prompt={quiz.prompt}
      explanation={quiz.explanation}
      source={quiz.source}
      {...chrome}
    >
      {({ resolved, resolve }: AnswerAreaApi) => (
        <div>
          {!resolved && (
            <p style={{
              margin: '0 0 12px', fontFamily: T.mono, fontSize: 11, color: T.inkMuted,
            }}>按住拖曳，排出正確順序</p>
          )}

          <DragList items={arrangement} resolved={resolved} onReorder={setArrangement} />

          {!resolved && (
            <div style={{ marginTop: 16 }}>
              <PrimaryButton
                label="確認順序"
                onClick={() => resolve(arrangement.every((it, pos) => it.originalIndex === pos))}
                arrow={false}
              />
            </div>
          )}
        </div>
      )}
    </QuizFrame>
  )
}

type Item = { value: string; originalIndex: number }

const GAP = 10
// Movement before a press counts as a drag, so a plain tap doesn't lift a row.
const DRAG_SLOP = 6

interface DragSession {
  pointerId: number
  from: number
  startY: number
  active: boolean
  // Row midpoints and the lifted row's height, measured once at drag start.
  // Rows wrap to different heights, so nothing assumes a fixed row size.
  mids: number[]
  height: number
  over: number
}

/**
 * Press-and-drag reorder built on Pointer Events (no dependency). Rows use
 * `touch-action: none`, so a finger on a row always drags and never scrolls
 * the QuizFrame — the list is capped at 5 items (quiz/generate.ts validator),
 * so it fits on screen and the prompt area still scrolls.
 *
 * Per frame, the lifted row follows the finger through a direct DOM transform;
 * React only re-renders when the target slot changes, which slides the other
 * rows out of the way.
 */
function DragList({ items, resolved, onReorder }: {
  items: Item[]
  resolved: boolean
  onReorder: (next: Item[]) => void
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const session = useRef<DragSession | null>(null)
  const [drag, setDrag] = useState<{ from: number; over: number; height: number } | null>(null)
  // On drop the rows swap DOM positions and their shift transforms reset in the
  // same render; animating that reset would slide them a second slot. Skip
  // transitions for that one frame.
  const [settling, setSettling] = useState(false)
  useEffect(() => {
    if (!settling) return
    const id = requestAnimationFrame(() => setSettling(false))
    return () => cancelAnimationFrame(id)
  }, [settling])

  const end = (commit: boolean) => {
    const s = session.current
    session.current = null
    if (!s) return
    const el = rowRefs.current[s.from]
    if (el) el.style.transform = ''
    if (s.active && commit && s.over !== s.from) {
      const next = [...items]
      const [moved] = next.splice(s.from, 1)
      next.splice(s.over, 0, moved!)
      setSettling(true)
      onReorder(next)
    }
    setDrag(null)
  }

  const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (resolved || session.current) return // one finger at a time
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rects = rowRefs.current.map(r => r?.getBoundingClientRect())
    session.current = {
      pointerId: e.pointerId,
      from: i,
      startY: e.clientY,
      active: false,
      mids: rects.map(r => (r ? r.top + r.height / 2 : 0)),
      height: rects[i]?.height ?? 0,
      over: i,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = session.current
    if (!s || e.pointerId !== s.pointerId) return
    const dy = e.clientY - s.startY
    if (!s.active) {
      if (Math.abs(dy) < DRAG_SLOP) return
      s.active = true
    }
    const el = rowRefs.current[s.from]
    if (el) el.style.transform = `translateY(${dy}px) scale(1.02)`

    // Target slot = how many other rows' midpoints the lifted row's centre has passed.
    const centre = s.mids[s.from]! + dy
    let over = 0
    s.mids.forEach((m, j) => { if (j !== s.from && m < centre) over++ })
    if (!drag || s.over !== over || drag.over !== over) {
      s.over = over
      setDrag({ from: s.from, over, height: s.height })
    }
  }

  // Where each non-lifted row slides to while a drag is in progress.
  const shiftFor = (j: number): number => {
    if (!drag || j === drag.from) return 0
    const step = drag.height + GAP
    if (drag.from < drag.over && j > drag.from && j <= drag.over) return -step
    if (drag.over < drag.from && j >= drag.over && j < drag.from) return step
    return 0
  }

  // Slot number shown in the badge — previews the position the row will land in.
  const slotFor = (j: number): number => {
    if (!drag) return j
    if (j === drag.from) return drag.over
    if (drag.from < drag.over && j > drag.from && j <= drag.over) return j - 1
    if (drag.over < drag.from && j >= drag.over && j < drag.from) return j + 1
    return j
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
      {items.map((item, i) => {
        const lifted = drag?.from === i
        const state: RowState = resolved
          ? (item.originalIndex === i ? 'right' : 'wrong')
          : lifted ? 'selected' : 'idle'
        const p = paletteFor(state)
        return (
          <div
            key={item.originalIndex}
            ref={el => { rowRefs.current[i] = el }}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={e => { if (e.pointerId === session.current?.pointerId) end(true) }}
            // iOS sends cancel (not up) when a system gesture or call interrupts:
            // drop the row back where it was instead of leaving it stuck lifted.
            onPointerCancel={e => { if (e.pointerId === session.current?.pointerId) end(false) }}
            onLostPointerCapture={e => { if (e.pointerId === session.current?.pointerId) end(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              minHeight: 52, padding: '12px 14px', boxSizing: 'border-box',
              borderRadius: RADIUS.option,
              border: `1.5px solid ${p.border}`,
              background: p.bg,
              boxShadow: lifted ? '0 14px 28px rgba(0,0,0,0.5)' : state === 'idle' ? T.highlight : 'none',
              position: 'relative',
              zIndex: lifted ? 2 : undefined,
              touchAction: resolved ? 'auto' : 'none',
              cursor: resolved ? 'default' : lifted ? 'grabbing' : 'grab',
              transform: lifted ? undefined : `translateY(${shiftFor(i)}px)`,
              transition: settling ? 'none' : lifted
                ? 'background 0.18s, border-color 0.18s, box-shadow 0.18s'
                : 'transform 0.2s cubic-bezier(0.2,0.8,0.2,1), background 0.18s, border-color 0.18s',
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: 9, flexShrink: 0,
              background: p.slotBg, color: p.slotText,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.mono, fontSize: 13, fontWeight: 700,
            }}>{slotFor(i) + 1}</span>
            <span style={{
              flex: 1, fontFamily: T.sans, fontSize: 15, lineHeight: 1.42, color: p.text,
            }}>{item.value}</span>
            {!resolved && <GripIcon color={lifted ? T.accent : T.inkFaint} />}
            {state === 'right' && <span style={{ color: Q.correct, fontWeight: 700 }}>✓</span>}
            {state === 'wrong' && (
              // Name the right slot — a bare ✗ says "wrong" but not what right looks like.
              <span style={{
                flexShrink: 0, fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: Q.wrong,
                whiteSpace: 'nowrap',
              }}>✗ 應為 {item.originalIndex + 1}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function GripIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
      {[4, 8, 12].map(y => (
        <line key={y} x1="3" x2="13" y1={y} y2={y} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      ))}
    </svg>
  )
}

function paletteFor(state: RowState) {
  switch (state) {
    case 'selected':
      // Neutral lift, not a coloured fill: the shadow and the accent ring carry
      // the "picked up" read, so it never looks like a right/wrong verdict.
      return { bg: Q.lift, border: T.accent, slotBg: T.accent, slotText: Q.onSolid, text: T.ink }
    case 'right':
      return { bg: Q.correctTint, border: Q.correct, slotBg: Q.correct, slotText: Q.onSolid, text: T.ink }
    case 'wrong':
      return { bg: Q.wrongTint, border: Q.wrong, slotBg: Q.wrong, slotText: Q.onSolid, text: T.ink }
    default:
      return { bg: T.card, border: T.ruleSoft, slotBg: Q.letterBg, slotText: Q.letterText, text: T.ink }
  }
}
