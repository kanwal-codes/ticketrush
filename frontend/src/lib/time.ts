/**
 * Time on this page is the server's time, not the laptop's. A countdown to a sale must not be fooled by a clock
 * that is wrong, so every response that carries `serverTime` teaches us how far off this machine is.
 */
let offsetMs = 0

export function syncServerTime(serverTimeIso: string, receivedAt: number = Date.now()): void {
  const server = Date.parse(serverTimeIso)
  if (Number.isFinite(server)) offsetMs = server - receivedAt
}

export function serverNow(): number {
  return Date.now() + offsetMs
}

/** For tests. */
export function resetServerTime(): void {
  offsetMs = 0
}

/** "21:42:10" for under a day, "2d 03:14:05" beyond. Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${clock}` : clock
}

/** "08:41" for a hold timer. */
export function formatMinutes(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const dayMonth = new Intl.DateTimeFormat('en-CA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const time = new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' })
const monthDay = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' })

/** "Fri, Nov 14, 2026" */
export function formatDate(iso: string): string {
  return dayMonth.format(new Date(iso))
}

const weekdayMonthDay = new Intl.DateTimeFormat('en-CA', { weekday: 'short', day: 'numeric', month: 'short' })

/** "Fri, Oct 9", with the year ("Fri, Jan 8, 2027") only when it is not the current one, on the server's clock. */
export function formatDateShort(iso: string): string {
  const date = new Date(iso)
  return date.getFullYear() === new Date(serverNow()).getFullYear() ? weekdayMonthDay.format(date) : dayMonth.format(date)
}

/** "8:00 p.m." */
export function formatTime(iso: string): string {
  return time.format(new Date(iso))
}

/** The small date chip on a poster card: "OCT 23". */
export function formatChip(iso: string): { month: string; day: string } {
  const [month = '', day = ''] = monthDay.format(new Date(iso)).toUpperCase().replace('.', '').split(' ')
  return { month, day }
}
