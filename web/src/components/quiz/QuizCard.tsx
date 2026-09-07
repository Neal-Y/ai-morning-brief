import type { Quiz } from '../../quiz/types.ts'
import type { QuizChromeProps } from './QuizFrame.tsx'
import { SingleChoiceCard } from './SingleChoiceCard.tsx'
import { OrderingCard } from './OrderingCard.tsx'
import { MatchingCard } from './MatchingCard.tsx'
import { FillBlankCard } from './FillBlankCard.tsx'

type Props = Omit<QuizChromeProps, 'id' | 'category' | 'prompt' | 'explanation' | 'source'> & {
  quiz: Quiz
}

/** Dispatches to the right answer card by quiz type. */
export function QuizCard({ quiz, ...chrome }: Props) {
  switch (quiz.type) {
    case 'single_choice': return <SingleChoiceCard quiz={quiz} {...chrome} />
    case 'ordering': return <OrderingCard quiz={quiz} {...chrome} />
    case 'matching': return <MatchingCard quiz={quiz} {...chrome} />
    case 'fill_blank': return <FillBlankCard quiz={quiz} {...chrome} />
  }
}
