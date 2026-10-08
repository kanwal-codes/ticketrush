import type { Page } from '@playwright/test'
import { buySeats, createEvent, createGuest, seatIdsOf, ticketCodesOf } from './support/backend'
import { expect, expectAccessible, signInAsNewGuest, signInAsOrganizer, test } from './support/fixtures'

/** The browser's own "datetime-local" format, for a time this many minutes from now. */
const local = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

async function noSidewaysScroll(page: Page, where: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over, `${where} scrolls sideways`).toBeLessThanOrEqual(0)
}

test('an organizer runs an event end to end: create, publish, sell, watch, scan', async ({ page }) => {
  await signInAsOrganizer(page)
  const title = `Console Night ${Date.now()}`

  // Create it, laying out a new venue, with the sale already open so a guest can buy straight away.
  await page.goto('/console')
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
  await expectAccessible(page, 'the console events list')
  await page.getByRole('link', { name: 'Create an event' }).click()
  await expect(page.getByRole('heading', { name: 'Create an event' })).toBeVisible()

  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Artist or company').fill('The Console Band')
  await page.getByLabel('Venue', { exact: true }).selectOption('new')
  await page.getByLabel('Venue name').fill('Console Hall')
  await page.getByLabel('City').fill('Montreal')
  await page.getByLabel('Section 1 name').fill('Floor')
  await page.getByLabel('Rows').fill('2')
  await page.getByLabel('Seats per row').fill('5')
  await page.getByLabel(/^Floor \(10 seats\)/).fill('96')
  await page.getByLabel('Style').selectOption('SUN')
  await page.getByLabel('Waiting room opens').fill(local(-90))
  await page.getByLabel('Tickets go on sale').fill(local(-60))
  await expect(page.getByRole('complementary', { name: 'Poster preview' })).toBeVisible()
  await expectAccessible(page, 'the create-event form')
  await page.getByRole('button', { name: 'Save as draft' }).click()

  // It starts as a draft: nothing sold, and publishing asks first.
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  const eventId = Number(/\/console\/events\/(\d+)/.exec(page.url())![1])
  await expect(page.getByText('0 of 10').first()).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByRole('alert').or(page.getByRole('status').filter({ hasText: 'Publish this event?' })).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('link', { name: 'Door scanner' })).toBeVisible()

  // A guest buys two seats; the dashboard shows the sale to the cent.
  const guest = await createGuest()
  const seats = await seatIdsOf(eventId)
  await buySeats(guest, eventId, seats.slice(0, 2))
  await page.reload()
  await expect(page.getByText('2 of 10').first()).toBeVisible()
  await expect(page.getByText('$206.40')).toBeVisible() // 2 x $96.00 + 7.5% fee
  await expect(page.getByText('$192.00 tickets + $14.40 fees')).toBeVisible()
  await expect(page.getByRole('img', { name: '2 sold, 0 held, 8 available of 10' })).toBeVisible()
  await expectAccessible(page, 'the event dashboard')

  // At the door.
  const [code] = await ticketCodesOf(guest.token)
  await page.getByRole('link', { name: 'Door scanner' }).click()
  const box = page.getByLabel('Ticket code')
  await expect(box).toBeFocused()
  await expectAccessible(page, 'the door scanner')
  await box.fill(code!)
  await box.press('Enter')
  await expect(page.locator('.scanner__headline')).toHaveText('Let them in')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('1 of 2 in')
  await expect(box).toBeFocused()
  await box.fill(code!.toLowerCase())
  await box.press('Enter')
  await expect(page.locator('.scanner__headline')).toHaveText('Already used')
  await box.fill('NOTATICKET')
  await box.press('Enter')
  await expect(page.locator('.scanner__headline')).toHaveText('Not a ticket')
  await expect(page.getByText('Recent scans')).toBeVisible()
  await expect(page.locator('.scanner__scan')).toHaveCount(3)
})

test('a guest is refused the console, and the organizer API refuses them too', async ({ page }) => {
  const guest = await signInAsNewGuest(page)
  await page.goto('/console')
  await expect(page.getByRole('heading', { level: 1, name: 'This part of TicketRush is for organizers' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Console' })).toHaveCount(0)
  await expectAccessible(page, 'the organizers-only screen')

  const response = await page.request.get('/api/organizer/events', { headers: { Authorization: `Bearer ${guest.token}` } })
  expect(response.status()).toBe(403)
  expect((await page.request.get('/api/organizer/events')).status()).toBe(401)
})

test('the console works at phone width, and the door scanner is usable one-handed @mobile', async ({ page }) => {
  await signInAsOrganizer(page)
  const event = await createEvent({ waitingRoom: false })

  await page.goto('/console')
  await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
  await noSidewaysScroll(page, 'the events list')

  await page.goto('/console/events/new')
  await expect(page.getByRole('heading', { name: 'Create an event' })).toBeVisible()
  await page.getByLabel('Venue', { exact: true }).selectOption('new')
  await noSidewaysScroll(page, 'the create form with a new venue')

  await page.goto(`/console/events/${event.id}`)
  await expect(page.getByRole('heading', { level: 1, name: event.title })).toBeVisible()
  await noSidewaysScroll(page, 'the dashboard')

  await page.goto(`/console/events/${event.id}/scan`)
  await expect(page.getByLabel('Ticket code')).toBeFocused()
  await noSidewaysScroll(page, 'the door scanner')
  const box = await page.getByRole('button', { name: 'Check' }).boundingBox()
  expect(box!.height, 'the Check button is a comfortable thumb target').toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'the door scanner on a phone')
})
