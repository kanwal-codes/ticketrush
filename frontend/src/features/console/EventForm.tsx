import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/errors'
import type { OrganizerEvent, VenueView } from '../../api/types'
import { BackBar } from '../../components/BackBar'
import { Field } from '../../components/Field'
import { Notice } from '../../components/Notice'
import { ConsoleSkeleton } from '../../components/PageSkeletons'
import { Poster } from '../../components/Poster'
import { useToast } from '../../components/Toast'
import { contrast } from '../../lib/color'
import { eventTheme } from '../../lib/eventTheme'
import { describeError, type ErrorDescription } from '../../lib/errorCopy'
import { useTitle } from '../../lib/useTitle'
import { consoleKeys, createEvent, createVenue, updateEvent, useEventToEdit, useMyVenues } from './api'
import {
  clearDraft,
  draftFromEvent,
  emptyDraft,
  eventRequest,
  loadDraft,
  MAX_VENUE_SEATS,
  POSTER_STYLES,
  saveDraft,
  tiersOf,
  totalSeats,
  validateDraft,
  venueRequest,
  type Draft,
  type Errors,
  type PosterStyle,
} from './eventDraft'
import './console.css'
import './eventForm.css'

const NEW_VENUE = 'new'

/** The poster shows the date while the field may be half typed or empty; fall back to a month out rather than throw. */
function previewDate(local: string): string {
  const t = new Date(local)
  return (Number.isNaN(t.getTime()) ? new Date(Date.now() + 30 * 86_400_000) : t).toISOString()
}

/** Create an event, or (at /console/events/:id/edit) change a draft. */
export function EventForm() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <EditEvent id={id} /> : <CreateEvent />
}

function CreateEvent() {
  useTitle('Create an event · TicketRush')
  const venuesQuery = useMyVenues()
  if (venuesQuery.isPending) return <ConsoleSkeleton />
  if (venuesQuery.error) throw venuesQuery.error
  return <Form venues={venuesQuery.data} />
}

function EditEvent({ id }: { id: number }) {
  useTitle('Edit event · TicketRush')
  const source = useEventToEdit(id)
  if (source.isPending) return <ConsoleSkeleton />
  if (!source.data) throw source.error
  const { event, venue } = source.data
  return <Form venues={[venue]} editing={{ id, initial: draftFromEvent(event, venue), status: event.status }} />
}

interface Editing {
  id: number
  initial: Draft
  status: OrganizerEvent['status']
}

function Form({ venues, editing }: { venues: VenueView[]; editing?: Editing }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [restored] = useState(() => !editing && loadDraft() !== null)
  const [draft, setDraft] = useState<Draft>(() => {
    if (editing) return editing.initial
    const saved = loadDraft() ?? emptyDraft()
    // A venue the organizer has none of yet means laying one out; one they have means choosing it.
    return venues.length === 0 && saved.venueMode === 'existing' ? { ...saved, venueMode: 'new' } : saved
  })
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<Pick<ErrorDescription, 'tone' | 'title' | 'message'> | null>(null)
  const [busy, setBusy] = useState(false)

  // Kept as the organizer types, so a refresh or a sign-in when the token runs out does not lose the form.
  useEffect(() => {
    if (!editing) saveDraft(draft)
  }, [draft, editing])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const text = (key: keyof Draft) => ({
    value: draft[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
    error: errors[key],
  })

  const tiers = tiersOf(draft, venues)
  const seats = totalSeats(tiers)
  const venue = draft.venueMode === 'existing' ? venues.find((v) => String(v.id) === draft.venueId) : undefined
  const city = venue?.city ?? draft.venueCity
  const poster = { style: draft.posterStyle, inkOne: draft.inkOne, inkTwo: draft.inkTwo, paperColor: draft.paperColor }
  const lowContrast = contrast(draft.inkOne, draft.paperColor) < 3

  const setSection = (i: number, patch: Partial<Draft['sections'][number]>) =>
    set('sections', draft.sections.map((s, n) => (n === i ? { ...s, ...patch } : s)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFailure(null)
    const problems = validateDraft(draft, venues)
    setErrors(problems)
    if (Object.keys(problems).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      let chosen = venue
      if (!editing && draft.venueMode === 'new') {
        chosen = await createVenue(venueRequest(draft))
        const made = chosen
        // From here the venue exists. If the event then fails, a retry must reuse it, not make a second one.
        queryClient.setQueryData<VenueView[]>(consoleKeys.venues, (old = []) => [...old, made])
        setDraft((d) => ({ ...d, venueMode: 'existing', venueId: String(made.id) }))
      }
      const request = eventRequest(draft, chosen!)
      const ref = editing ? await updateEvent(editing.id, request) : await createEvent(request)
      if (!editing) clearDraft()
      void queryClient.invalidateQueries({ queryKey: ['console'] })
      toast(editing ? { tone: 'success', title: 'Changes saved' } : { tone: 'success', title: 'Draft saved', message: 'Check it over, then publish when you are ready.' })
      void navigate(`/console/events/${ref.id}`, { viewTransition: true })
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const known = new Set(['title', 'artist', 'description'])
        setErrors(Object.fromEntries(Object.entries(error.fieldErrors).filter(([k]) => known.has(k))))
        setFailure({ tone: 'error', title: 'The server did not accept that', message: Object.values(error.fieldErrors).join(' ') })
      } else {
        setFailure(describeError(error))
      }
    }
  }

  return (
    <div className="page console eventform">
      <BackBar to={editing ? `/console/events/${editing.id}` : '/console'}>{editing ? 'Back to the event' : 'Your events'}</BackBar>
      <header>
        <p className="label">{editing ? 'Edit event' : 'New event'}</p>
        <h1>{editing ? 'Edit event' : 'Create an event'}</h1>
        <p className="console__meta">{editing ? 'Only a draft can be edited. Guests see nothing until you publish.' : 'It is saved as a draft. Guests see nothing until you publish.'}</p>
      </header>

      {restored && <Notice tone="info" title="We kept your draft" compact>The form is as you left it.</Notice>}

      <form onSubmit={(e) => void submit(e)} noValidate className="eventform__layout">
        <div className="eventform__fields">
          <fieldset>
            <legend>The show</legend>
            <Field label="Title" {...text('title')} maxLength={160} />
            <Field label="Artist or company" {...text('artist')} maxLength={120} />
            <Field as="textarea" label="Description" hint="Optional." {...text('description')} maxLength={4000} />
          </fieldset>

          <fieldset>
            <legend>Venue and seats</legend>
            <Field
              as="select"
              label="Venue"
              value={draft.venueMode === 'new' ? NEW_VENUE : draft.venueId}
              error={errors.venueId}
              disabled={!!editing}
              hint={editing ? 'The venue of a draft cannot be changed. Cancel it and create a new event to use another.' : undefined}
              onChange={(e) => (e.target.value === NEW_VENUE ? set('venueMode', 'new') : setDraft((d) => ({ ...d, venueMode: 'existing', venueId: e.target.value })))}
            >
              <option value="">Choose a venue…</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}, {v.city} ({v.totalSeats.toLocaleString('en-CA')} seats)
                </option>
              ))}
              <option value={NEW_VENUE}>Lay out a new venue…</option>
            </Field>

            {draft.venueMode === 'new' && (
              <div className="eventform__venue">
                <Field label="Venue name" {...text('venueName')} maxLength={120} />
                <Field label="City" {...text('venueCity')} maxLength={80} />
                {draft.sections.map((s, i) => (
                  <div key={i} className="eventform__section">
                    <Field label={`Section ${i + 1} name`} value={s.name} onChange={(e) => setSection(i, { name: e.target.value })} maxLength={60} />
                    <Field label="Rows" inputMode="numeric" value={s.rows} onChange={(e) => setSection(i, { rows: e.target.value })} />
                    <Field label="Seats per row" inputMode="numeric" value={s.seatsPerRow} onChange={(e) => setSection(i, { seatsPerRow: e.target.value })} />
                    {draft.sections.length > 1 && (
                      <button type="button" className="btn btn--quiet" onClick={() => set('sections', draft.sections.filter((_, n) => n !== i))}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {errors.sections && <p className="field__error" role="alert">{errors.sections}</p>}
                <p className="eventform__count num" aria-live="polite">
                  {seats.toLocaleString('en-CA')} of {MAX_VENUE_SEATS.toLocaleString('en-CA')} seats
                </p>
                {draft.sections.length < 20 && (
                  <button type="button" className="btn btn--quiet" onClick={() => set('sections', [...draft.sections, { name: '', rows: '10', seatsPerRow: '20' }])}>
                    Add a section
                  </button>
                )}
              </div>
            )}
          </fieldset>

          {tiers.length > 0 && (
            <fieldset>
              <legend>Prices</legend>
              <p className="console__meta">Face value in dollars. Guests see this plus the 7.5% fee, as one final price.</p>
              {tiers.map((t) => (
                <Field
                  key={t.name}
                  label={`${t.name || 'Section'} (${t.seats.toLocaleString('en-CA')} seats)`}
                  inputMode="decimal"
                  placeholder="96.00"
                  value={draft.prices[t.name] ?? ''}
                  error={errors[`price:${t.name}`]}
                  onChange={(e) => set('prices', { ...draft.prices, [t.name]: e.target.value })}
                />
              ))}
            </fieldset>
          )}

          <fieldset>
            <legend>When</legend>
            <Field type="datetime-local" label="Event starts" {...text('startsAt')} />
            <Field type="datetime-local" label="Doors open" {...text('doorsAt')} />
            <Field type="datetime-local" label="Tickets go on sale" {...text('onSaleAt')} />
            <Field type="datetime-local" label="Waiting room opens" hint="Only used if you turn the waiting room on." {...text('dropOpensAt')} />
            <label className="check">
              <input type="checkbox" checked={draft.waitingRoom} onChange={(e) => set('waitingRoom', e.target.checked)} />
              Use a waiting room: guests queue by arrival time and are let in at a steady pace
            </label>
          </fieldset>

          <fieldset>
            <legend>Poster</legend>
            <Field as="select" label="Style" value={draft.posterStyle} onChange={(e) => set('posterStyle', e.target.value as PosterStyle)}>
              {POSTER_STYLES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Field>
            <div className="eventform__colors">
              <Field type="color" label="First ink" value={draft.inkOne} onChange={(e) => set('inkOne', e.target.value)} />
              <Field type="color" label="Second ink" value={draft.inkTwo} onChange={(e) => set('inkTwo', e.target.value)} />
              <Field type="color" label="Paper" value={draft.paperColor} onChange={(e) => set('paperColor', e.target.value)} />
            </div>
            {lowContrast && (
              <Notice tone="warning" title="The ink and the paper are close in colour" compact>
                The poster will nudge the lettering to stay readable, but a stronger difference looks better.
              </Notice>
            )}
          </fieldset>

          {failure && (
            <Notice tone={failure.tone} title={failure.title}>
              {failure.message}
            </Notice>
          )}
          <p className="eventform__actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save as draft'}
            </button>
            <Link to={editing ? `/console/events/${editing.id}` : '/console'} className="btn btn--quiet">Cancel</Link>
          </p>
        </div>

        <aside className="eventform__preview" aria-label="Poster preview" style={eventTheme(poster)}>
          <p className="label">Preview</p>
          <div className="eventform__poster">
            <Poster {...poster} title={draft.title || 'Your title here'} artist={draft.artist || 'Artist'} city={city || 'City'} startsAt={previewDate(draft.startsAt)} seed={1} />
          </div>
        </aside>
      </form>
    </div>
  )
}
