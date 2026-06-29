export interface SingleChoicePayload {
  options: string[]
  correctIndex: number
}

export interface OrderingPayload {
  items: string[] // listed in correct order; client shuffles for display
}

export interface MatchingPayload {
  left: string[]
  right: string[] // right[i] is the correct match for left[i]; client shuffles right for display
}

export interface FillBlankPayload {
  template: string // e.g. "{{0}} 把流量分散到一群 {{1}} 伺服器"
  blanks: string[] // correct answer per blank, in template order
  wordBank: string[] // blanks' answers + distractors, shuffled client-side
}

export type QuizType = 'single_choice' | 'ordering' | 'matching' | 'fill_blank'

export type QuizPayload =
  | { type: 'single_choice'; payload: SingleChoicePayload }
  | { type: 'ordering'; payload: OrderingPayload }
  | { type: 'matching'; payload: MatchingPayload }
  | { type: 'fill_blank'; payload: FillBlankPayload }
