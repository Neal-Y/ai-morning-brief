const taipeiDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const briefDateLongFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const briefDateShortFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  month: 'short',
  day: 'numeric',
})

function parseBriefDate(dateString: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  if (!match) return null

  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
}

export function getTaipeiDateString(date = new Date()): string {
  const parts = taipeiDateFormatter.formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Failed to format Taipei date')
  }

  return `${year}-${month}-${day}`
}

export function formatBriefDateLong(dateString: string): string {
  const date = parseBriefDate(dateString)
  if (!date) return dateString
  return briefDateLongFormatter.format(date).toUpperCase().replace(/,/g, ' ·')
}

export function formatBriefDateShort(dateString: string): string {
  const date = parseBriefDate(dateString)
  if (!date) return dateString
  return briefDateShortFormatter.format(date).toUpperCase()
}
