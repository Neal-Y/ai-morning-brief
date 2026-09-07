import { THEME_DARK } from '../../theme.ts'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dimmed'

interface Props {
  letter: string
  text: string
  state: OptionState
  wasSelected: boolean
  disabled: boolean
  onClick: () => void
}

export function OptionRow({ letter, text, state, wasSelected, disabled, onClick }: Props) {
  const p = paletteFor(state)
  // Pop the correct answer, shake a wrong pick — the RN cards' Animated
  // sequences, expressed as one-shot CSS keyframes.
  const animation =
    state === 'correct' ? `quizPop 0.42s cubic-bezier(0.34,1.56,0.64,1) both` :
    state === 'wrong' ? 'quizShake 0.3s ease-in-out both' :
    undefined

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        minHeight: 58, padding: '12px 14px', textAlign: 'left',
        borderRadius: RADIUS.option,
        border: `1.5px solid ${p.border}`,
        background: p.bg,
        opacity: state === 'dimmed' ? 0.55 : 1,
        transform: state === 'correct' && wasSelected ? 'scale(1)' : undefined,
        animation,
        transition: 'background 0.18s, border-color 0.18s, opacity 0.18s',
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
        background: p.badgeBg, color: p.badgeText,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.mono, fontSize: 12, fontWeight: 700,
      }}>{letter}</span>
      <span style={{
        flex: 1, fontFamily: T.sans, fontSize: 15, lineHeight: 1.42, color: p.text,
      }}>{text}</span>
      {state === 'correct' && <span style={{ color: Q.correct, fontWeight: 700 }}>✓</span>}
      {state === 'wrong' && <span style={{ color: Q.wrong, fontWeight: 700 }}>✗</span>}
    </button>
  )
}

function paletteFor(state: OptionState) {
  switch (state) {
    case 'correct':
      return { bg: Q.correctTint, border: Q.correct, badgeBg: Q.correct, badgeText: Q.onSolid, text: T.ink }
    case 'wrong':
      return { bg: Q.wrongTint, border: Q.wrong, badgeBg: Q.wrong, badgeText: Q.onSolid, text: T.ink }
    case 'dimmed':
      return { bg: T.card, border: T.ruleSoft, badgeBg: Q.letterBg, badgeText: Q.letterText, text: T.inkMuted }
    default:
      return { bg: T.card, border: T.ruleSoft, badgeBg: Q.letterBg, badgeText: Q.letterText, text: T.ink }
  }
}
