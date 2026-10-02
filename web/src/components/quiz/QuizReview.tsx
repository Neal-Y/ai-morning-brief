import { THEME_DARK } from '../../theme.ts'
import { describeForAsk, type Quiz } from '../../quiz/types.ts'
import { Q } from './tokens.ts'

const T = THEME_DARK

/** Read-only: unlike QuizCard, this view has no answer/attempt/advance callbacks. */
export function QuizReview({ quiz }: { quiz: Quiz | null }) {
  if (!quiz) {
    return <p style={{ fontSize: 13, lineHeight: 1.6, color: T.inkFaint }}>
      這筆紀錄暫時沒有完整解析。
    </p>
  }

  const { correctAnswer } = describeForAsk(quiz)
  return (
    <article aria-label="題目解析" style={{ color: T.ink, fontFamily: T.sans }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, marginBottom: 8 }}>
        {quiz.category}
      </div>
      <h3 style={{ fontSize: 16, lineHeight: 1.6, fontWeight: 700, margin: '0 0 16px' }}>
        {quiz.prompt}
      </h3>
      <div style={{ background: Q.correctTint, borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ color: Q.correct, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>正確答案</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>{correctAnswer}</div>
      </div>
      <div style={{ color: T.inkMuted, fontSize: 12, fontWeight: 700, margin: '16px 0 6px' }}>解析</div>
      <div style={{ whiteSpace: 'pre-wrap', color: T.inkMuted, fontSize: 14, lineHeight: 1.8 }}>
        {quiz.explanation || '這筆紀錄暫時沒有完整解析。'}
      </div>
    </article>
  )
}
