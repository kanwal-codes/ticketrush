import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { ScanResult } from '../../api/types'
import { NotFound } from '../../app/RouteError'
import { ConsoleSkeleton } from '../../components/PageSkeletons'
import { Notice } from '../../components/Notice'
import { describeError, type ErrorDescription } from '../../lib/errorCopy'
import { formatTime } from '../../lib/time'
import { useTitle } from '../../lib/useTitle'
import { formatCode } from '../tickets/format'
import { consoleKeys, scanTicket, useScans, useSummary } from './api'
import './console.css'
import './scanner.css'

export function Scanner() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <Door id={id} /> : <NotFound />
}

type Tone = 'ok' | 'warn' | 'bad'

/** What each outcome means to the person holding the phone at the door, in words they can act on at a glance. */
const OUTCOME: Record<ScanResult['outcome'], { tone: Tone; headline: string; detail: (r: ScanResult) => string }> = {
  VALID: { tone: 'ok', headline: 'Let them in', detail: (r) => (r.seat ? `Admitted. ${r.seat}.` : 'Admitted.') },
  ALREADY_USED: {
    tone: 'warn',
    headline: 'Already used',
    detail: (r) => `${r.seat ? `${r.seat}. ` : ''}This ticket was scanned ${r.usedAt ? `at ${formatTime(r.usedAt)}` : 'earlier'}.`,
  },
  WRONG_EVENT: { tone: 'bad', headline: 'Wrong event', detail: () => 'This ticket is for a different event. Do not admit it here.' },
  UNKNOWN: { tone: 'bad', headline: 'Not a ticket', detail: () => 'No ticket has that code. Check it, or ask to see the ticket again.' },
}

const LABEL: Record<string, string> = { VALID: 'Admitted', ALREADY_USED: 'Already used', WRONG_EVENT: 'Wrong event', UNKNOWN: 'Not a ticket' }

function Door({ id }: { id: number }) {
  const summary = useSummary(id)
  const scans = useScans(id)
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<ScanResult | null>(null)
  const [failure, setFailure] = useState<Pick<ErrorDescription, 'tone' | 'title' | 'message'> | null>(null)
  useTitle(`Door · ${summary.data?.title ?? 'Event'}`)

  // The cursor is always in the box, so a keyboard-style scanner (which types the code and presses Enter) just works.
  const loaded = !summary.isPending
  useEffect(() => {
    if (loaded) input.current?.focus()
  }, [loaded])

  if (summary.isPending) return <ConsoleSkeleton />
  if (!summary.data) throw summary.error
  const { door, title } = summary.data

  async function submit(e: FormEvent) {
    e.preventDefault()
    const entered = code.trim()
    if (!entered || busy) return
    setBusy(true)
    setFailure(null)
    try {
      setLast(await scanTicket(entered, id))
      void queryClient.invalidateQueries({ queryKey: consoleKeys.scans(id) })
      void queryClient.invalidateQueries({ queryKey: consoleKeys.summary(id) })
    } catch (error) {
      setLast(null)
      setFailure(describeError(error))
    } finally {
      setBusy(false)
      setCode('')
      input.current?.focus()
    }
  }

  const outcome = last ? OUTCOME[last.outcome] : null

  return (
    <div className="page console scanner">
      <header>
        <p className="label">
          <Link to={`/console/events/${id}`} viewTransition>{title}</Link> / Door
        </p>
        <h1>
          <span className="num">{door.checkedIn.toLocaleString('en-CA')}</span> of <span className="num">{door.issued.toLocaleString('en-CA')}</span> in
        </h1>
      </header>

      <form onSubmit={(e) => void submit(e)} className="scanner__form">
        <label htmlFor="ticket-code">Ticket code</label>
        <div className="scanner__row">
          <input
            id="ticket-code"
            ref={input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="scanner__input num"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            placeholder="Scan or type"
          />
          <button type="submit" className="btn" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>

      <div role="status" aria-live="assertive" className="scanner__result-wrap">
        {last && outcome && (
          <div key={`${last.outcome}-${last.usedAt ?? ''}-${last.seat ?? ''}-${scans.dataUpdatedAt}`} className={`scanner__result scanner__result--${outcome.tone}`}>
            <p className="scanner__headline">{outcome.headline}</p>
            <p>{outcome.detail(last)}</p>
          </div>
        )}
      </div>
      {failure && <Notice tone={failure.tone} title={failure.title}>{failure.message}</Notice>}

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent scans</h2>
        {scans.data && scans.data.length > 0 ? (
          <ul className="scanner__recent">
            {scans.data.map((s, i) => (
              <li key={`${s.at}-${i}`} className="scanner__scan">
                <span className={`scanner__dot scanner__dot--${OUTCOME[s.outcome as ScanResult['outcome']]?.tone ?? 'bad'}`} aria-hidden="true" />
                <span>
                  <strong>{LABEL[s.outcome] ?? s.outcome}</strong>
                  {s.seat ? ` · ${s.seat}` : ''}
                </span>
                <span className="num scanner__code">{formatCode(s.code)}</span>
                <time dateTime={s.at}>{formatTime(s.at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="console__meta">Nothing scanned yet.</p>
        )}
      </section>
    </div>
  )
}
