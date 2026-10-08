/** How long to wait, in words a person would say. The server's number is an estimate and this says so. */
export function waitText(seconds: number): string {
  if (seconds < 60) return 'Under a minute'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `About ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `About ${hours} h` : `About ${hours} h ${rest} min`
}

/** "312 people ahead of you", "1 person ahead of you", or "You are next". */
export function aheadText(ahead: number): string {
  if (ahead <= 0) return 'You are next'
  return `${ahead.toLocaleString('en-CA')} ${ahead === 1 ? 'person' : 'people'} ahead of you`
}
