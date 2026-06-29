import type { Quiz } from '../data'
import { SingleChoiceCard } from './SingleChoiceCard'
import { OrderingCard } from './OrderingCard'
import { MatchingCard } from './MatchingCard'
import { FillBlankCard } from './FillBlankCard'

interface Props {
  quiz: Quiz
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  onNext: (correct: boolean) => void
}

/** Dispatches to the right card by quiz type. */
export function QuizCard({ quiz, ...rest }: Props) {
  switch (quiz.type) {
    case 'single_choice':
      return <SingleChoiceCard quiz={quiz} {...rest} />
    case 'ordering':
      return <OrderingCard quiz={quiz} {...rest} />
    case 'matching':
      return <MatchingCard quiz={quiz} {...rest} />
    case 'fill_blank':
      return <FillBlankCard quiz={quiz} {...rest} />
  }
}
