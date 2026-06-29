const taipeiDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

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

/** Day-of-year (1-based) in Taipei timezone. */
export function getTaipeiDayOfYear(date = new Date()): number {
  const taipeiDateStr = getTaipeiDateString(date)
  const [year, month, day] = taipeiDateStr.split('-').map(Number) as [number, number, number]
  const start = new Date(year, 0, 0)
  const current = new Date(year, month - 1, day)
  const diff = current.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}
