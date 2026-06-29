import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { SingleChoiceQuiz } from '../data'
import { OptionRow, type OptionState } from './OptionRow'
import { QuizFrame, type AnswerAreaApi } from './QuizFrame'

const LETTERS = ['A', 'B', 'C', 'D']

interface Props {
  quiz: SingleChoiceQuiz
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  onNext: (correct: boolean) => void
}

export function SingleChoiceCard({ quiz, index, total, streak, xpToday, isLast, onNext }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <QuizFrame
      id={quiz.id}
      category={quiz.category}
      prompt={quiz.prompt}
      explanation={quiz.explanation}
      source={quiz.source}
      index={index}
      total={total}
      streak={streak}
      xpToday={xpToday}
      isLast={isLast}
      onNext={onNext}
    >
      {({ resolved, resolve }: AnswerAreaApi) => {
        const pick = (i: number) => {
          if (resolved) return
          setSelected(i)
          resolve(i === quiz.correctIndex)
        }
        const optionState = (i: number): OptionState => {
          if (!resolved) return 'idle'
          if (i === quiz.correctIndex) return 'correct'
          if (i === selected) return 'wrong'
          return 'dimmed'
        }
        return (
          <View style={styles.options}>
            {quiz.options.map((opt, i) => (
              <OptionRow
                key={i}
                letter={LETTERS[i]}
                text={opt}
                state={optionState(i)}
                wasSelected={i === selected}
                disabled={resolved}
                onPress={() => pick(i)}
              />
            ))}
          </View>
        )
      }}
    </QuizFrame>
  )
}

const styles = StyleSheet.create({
  options: { gap: 10 },
})
