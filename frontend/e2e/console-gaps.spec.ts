import { buySeats, createEvent, createGuest } from './support/backend'
import { expect, expectAccessible, signInAsOrganizer, test } from './support/fixtures'

test('an organizer edits a draft, publishes it, and guests see the new version', async ({ page }) => {
  await signInAsOrganizer(page)
  const first = `Draft Night ${Date.now()}`
  const second = `${first} (second thoughts)`

  await page.goto('/console/events/new')
  await page.getByLabel('Title').fill(first)
  await page.getByLabel('Artist or company').fill('The Draft Band')
  await page.getByLabel('Venue', { exact: true }).selectOption('new')
  await page.getByLabel('Venue name').fill('Draft Hall')
  await page.getByLabel('City').fill('Montreal')
  await page.getByLabel('Section 1 name').fill('Floor')
  await page.getByLabel('Rows').fill('2')
  await page.getByLabel('Seats per row').fill('5')
  await page.getByLabel(/^Floor \(10 seats\)/).fill('50')
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.getByRole('heading', { level: 1, name: first })).toBeVisible()
  const id = Number(/\/console\/events\/(\d+)/.exec(page.url())![1])

  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue(first)
  await expect(page.getByLabel('Venue', { exact: true })).toBeDisabled()
  await expectAccessible(page, 'the edit form')
  await page.getByLabel('Title').fill(second)
  await page.getByLabel(/^Floor/).fill('75.50')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('heading', { level: 1, name: second })).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByRole('status').filter({ hasText: 'Publish this event?' }).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('link', { name: 'Door scanner' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0) // published events are not edited

  // A guest sees the changed title and the changed price (75.50 plus the 7.5% fee is 81.16).
  await page.goto(`/events/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: second })).toBeVisible()
  await expect(page.getByText('$81.16').first()).toBeVisible()
})

test('cancelling an event refunds the buyers, and they see it', async ({ page, browser }) => {
  await signInAsOrganizer(page)
  const event = await createEvent({ waitingRoom: false })
  const buyer = await createGuest()
  await buySeats(buyer, event.id, event.seatIds.slice(0, 2))

  await page.goto(`/console/events/${event.id}`)
  await expect(page.getByText('2 of 40').first()).toBeVisible()
  await page.getByRole('button', { name: 'Cancel event' }).click()
  await expect(page.getByText(/refunded automatically/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel the event' }).click()

  await expect(page.locator('.status--cancelled')).toBeVisible()
  await expect(page.getByText(/Orders: 1 refunded/)).toBeVisible()
  await expect(page.getByText('$0.00').first()).toBeVisible() // nothing is left of the revenue

  // The buyer's tickets no longer work, and say so.
  const guest = await browser.newContext()
  await guest.addInitScript((token) => sessionStorage.setItem('tr.token', token), buyer.token)
  const guestPage = await guest.newPage()
  await guestPage.goto('/tickets')
  await expect(guestPage.getByText('This event was cancelled')).toBeVisible()
  await expect(guestPage.getByText('Cancelled', { exact: true })).toHaveCount(2)
  await guest.close()
})

test('a long list of events shows a page at a time', async ({ page }) => {
  await signInAsOrganizer(page)
  await Promise.all(Array.from({ length: 21 }, () => createEvent({ waitingRoom: false, rows: 1, perRow: 2 })))

  await page.goto('/console')
  await expect(page.locator('.console__event')).toHaveCount(20)
  await page.getByRole('button', { name: 'Show more events' }).click()
  await expect.poll(() => page.locator('.console__event').count()).toBeGreaterThan(20)
  await expectAccessible(page, 'the events list with more than one page')
})
