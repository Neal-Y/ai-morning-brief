import { useState } from 'react'
import type { SingleChoiceQuiz } from '../../quiz/types.ts'
import { OptionRow, type OptionState } from './OptionRow.tsx'
import { QuizFrame, type AnswerAreaApi, type QuizChromeProps } from './QuizFrame.tsx'

const LETTERS = ['A', 'B', 'C', 'D']

type Props = Omit<QuizChromeProps, 'id' | 'category' | 'prompt' | 'explanation' | 'source'> & {
  quiz: SingleChoiceQuiz
}

export function SingleChoiceCard({ quiz, ...chrome }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <QuizFrame
      id={quiz.id}
      category={quiz.category}
      prompt={quiz.prompt}
      explanation={quiz.explanation}
      source={quiz.source}
      {...chrome}
    >
      {({ resolved, resolve }: AnswerAreaApi) => {
        const pick = (i: number) => {
          if (resolved) return
          setSelected(i)
          resolve(i === quiz.correctIndex)
        }
        const stateOf = (i: number): OptionState => {
          if (!resolved) return 'idle'
          if (i === quiz.correctIndex) return 'correct'
          if (i === selected) return 'wrong'
          return 'dimmed'
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quiz.options.map((opt, i) => (
              <OptionRow
                key={i}
                letter={LETTERS[i] ?? String(i + 1)}
                text={opt}
                state={stateOf(i)}
                wasSelected={i === selected}
                disabled={resolved}
                onClick={() => pick(i)}
              />
            ))}
          </div>
        )
      }}
    </QuizFrame>
  )
}
