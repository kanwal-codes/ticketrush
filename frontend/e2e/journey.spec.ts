import { createEvent, ordersOf, providerCharges, scanTicket, seatStatuses } from './support/backend'
import { chooseAndHold, expect, payWith, signInAsNewGuest, test } from './support/fixtures'

test('a guest signs up, waits in the queue, picks seats, pays and gets tickets with QR codes @mobile', async ({ page }) => {
  const event = await createEvent({ title: `Afterlight ${Date.now()}` })

  // Signs up through the real form.
  await page.goto('/register')
  await page.getByLabel('Your name').fill('Ana Journey')
  await page.getByLabel('Email').fill(`journey-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`)
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  // The event page leads to the waiting room, which lets the guest in and goes to the seats.
  await page.goto(`/events/${event.id}`)
  await page.getByRole('link', { name: 'Join the waiting room' }).click()
  await page.waitForURL(`**/events/${event.id}/seats`)

  await page.getByRole('button', { name: /Stalls row B seat 3,/ }).click()
  await page.getByRole('button', { name: /Stalls row B seat 4,/ }).click()
  await expect(page.getByText('$206.40')).toBeVisible() // two $96 seats plus fees, before any hold
  await page.getByRole('button', { name: 'Hold these 2 seats' }).click()

  await page.waitForURL('**/checkout')
  await expect(page.getByRole('button', { name: 'Pay $206.40' })).toBeVisible() // the same total, now from the server
  await expect(page.locator('.hold-timer')).toBeVisible()
  await payWith(page, '4242 4242 4242 4242')

  await page.waitForURL('**/tickets')
  await expect(page.getByRole('heading', { name: 'You are going!' })).toBeVisible()
  const qrs = page.locator('img.stub__qr')
  await expect(qrs).toHaveCount(2)
  await expect(qrs.first()).toHaveJSProperty('complete', true)
  expect(await qrs.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  // The organizer scans a ticket at the door; the guest's wallet then shows it used.
  const code = (await page.locator('.stub__code').first().innerText()).replace(/\s/g, '')
  expect(await scanTicket(code, event.id)).toMatchObject({ outcome: 'VALID' })
  await page.reload()
  await expect(page.getByText('Used')).toBeVisible()
  expect(await scanTicket(code, event.id)).toMatchObject({ outcome: 'ALREADY_USED' })
})

test('a declined card keeps the seats, and the next card pays', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent()
  await chooseAndHold(page, event.id, [1, 2])

  await payWith(page, '4000 0000 0000 0002')
  await expect(page.getByRole('alert')).toContainText('Your card was declined')
  await expect(page.locator('.hold-timer')).toBeVisible() // the seats are still held

  await payWith(page, '4242 4242 4242 4242')
  await page.waitForURL('**/tickets')
  await expect(page.locator('.stub')).toHaveCount(2)
})

test('an unknown outcome says not to pay again, and nobody is charged', async ({ page }) => {
  const guest = await signInAsNewGuest(page)
  const event = await createEvent()
  await chooseAndHold(page, event.id, [1])

  await payWith(page, '4000 0000 0000 0119') // the provider answers with an error: no one knows if it went through
  await expect(page.getByRole('heading', { name: 'Confirming your payment' })).toBeVisible()
  await expect(page.getByText('Please do not pay again.')).toBeVisible()
  await page.getByRole('button', { name: 'Check now' }).click()
  await expect(page.getByRole('heading', { name: 'Confirming your payment' })).toBeVisible()

  // Judged on this guest's own order: other tests pay at the same time, so the provider's total is not ours to read.
  const [order] = await ordersOf(guest.token)
  expect(order?.status).toBe('PENDING_PAYMENT')
  expect((await providerCharges()).chargedKeys).not.toContain(`order-${order!.id}`)
})

test('refreshing keeps the guest\'s place in the queue and their hold', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent({ onSaleInSeconds: 25 })

  await page.goto(`/events/${event.id}/queue`)
  await expect(page.getByRole('heading', { name: 'You are in the queue.' })).toBeVisible()
  await expect(page.getByText('#1')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'You are in the queue.' })).toBeVisible()
  await expect(page.getByText('#1')).toBeVisible()

  // The sale opens, the guest is let in without doing anything, and a refresh on the seats finds the hold.
  await page.waitForURL(`**/events/${event.id}/seats`, { timeout: 45_000 })
  await page.getByRole('button', { name: /Stalls row A seat 1,/ }).click()
  await page.getByRole('button', { name: 'Hold this seat' }).click()
  await page.waitForURL('**/checkout')
  await page.goto(`/events/${event.id}/seats`)
  await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeVisible()
  // The seat map is cached for a couple of seconds on purpose, so look until it has caught up.
  await expect.poll(() => seatStatuses(event.id)).toMatchObject({ HELD: 1 })
})

test('two guests go for the same seats: one holds them, the other is told and picks others', async ({ browser }) => {
  const event = await createEvent({ waitingRoom: false })
  const [a, b] = await Promise.all([browser.newContext(), browser.newContext()])
  const [pageA, pageB] = [await a.newPage(), await b.newPage()]
  await Promise.all([signInAsNewGuest(pageA), signInAsNewGuest(pageB)])

  for (const page of [pageA, pageB]) {
    await page.goto(`/events/${event.id}/seats`)
    await page.getByRole('button', { name: /Stalls row A seat 1,/ }).click()
    await page.getByRole('button', { name: /Stalls row A seat 2,/ }).click()
  }

  await pageA.getByRole('button', { name: 'Hold these 2 seats' }).click()
  await pageA.waitForURL('**/checkout')

  // B tries for the same two seats a moment later: none are held, and B is told which were taken.
  await pageB.getByRole('button', { name: 'Hold these 2 seats' }).click()
  await expect(pageB.getByRole('alert')).toContainText('A1 and A2 were just taken')
  await expect(pageB.getByRole('button', { name: /Stalls row A seat 1,/ })).toHaveAttribute('aria-disabled', 'true')

  await pageB.getByRole('button', { name: /Stalls row A seat 3,/ }).click()
  await pageB.getByRole('button', { name: /Stalls row A seat 4,/ }).click()
  await pageB.getByRole('button', { name: 'Hold these 2 seats' }).click()
  await pageB.waitForURL('**/checkout')

  await Promise.all([payWith(pageA, '4242424242424242'), payWith(pageB, '4242424242424242')])
  await Promise.all([pageA.waitForURL('**/tickets'), pageB.waitForURL('**/tickets')])

  // Four different seats were sold, none twice.
  await expect.poll(() => seatStatuses(event.id)).toMatchObject({ SOLD: 4 })
  const seatsOf = async (page: typeof pageA) => (await page.locator('.stub__seat').allInnerTexts()).sort()
  const all = [...(await seatsOf(pageA)), ...(await seatsOf(pageB))]
  expect(new Set(all).size).toBe(4)
  await Promise.all([a.close(), b.close()])
})
