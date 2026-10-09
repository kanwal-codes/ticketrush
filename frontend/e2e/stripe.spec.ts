import { createEvent, ordersOf } from './support/backend'
import { chooseAndHold, expect, signInAsNewGuest, test } from './support/fixtures'

/**
 * Pays with Stripe's own card form, in Stripe's test mode, then checks with Stripe that the payment and the refund
 * really exist. Only runs when the stack was started with Stripe test keys and STRIPE_TEST_KEY is set here (see docs/deploy.md).
 */
const key = process.env.STRIPE_TEST_KEY ?? ''
test.skip(!key.startsWith('sk_test_'), 'needs STRIPE_TEST_KEY (a Stripe test secret key) and a stack started with the Stripe keys')

async function stripe<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`Stripe ${path} answered ${response.status}`)
  return (await response.json()) as T
}

async function typeCard(page: import('@playwright/test').Page, number: string) {
  const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await frame.locator('input[name="cardnumber"]').fill(number)
  await frame.locator('input[name="exp-date"]').fill('12 / 34')
  await frame.locator('input[name="cvc"]').fill('123')
}

test('pays in Stripe\'s card form, and cancelling the event refunds it at Stripe', async ({ page }) => {
  const event = await createEvent({ title: `Stripe ${Date.now()}` })
  const guest = await signInAsNewGuest(page)
  await chooseAndHold(page, event.id, [1, 2])

  // Stripe's form, not our fields.
  await expect(page.getByLabel('Card number')).toHaveCount(0)
  await expect(page.locator('.stripe-card iframe')).toBeVisible()
  await typeCard(page, '4242424242424242')
  await page.getByRole('button', { name: /^Pay / }).click()
  await page.waitForURL('**/tickets', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'You are going!' })).toBeVisible()

  // Stripe agrees: one succeeded payment for the order's amount, found by the order's key.
  const [order] = await ordersOf(guest.token)
  const found = await stripe<{ data: { id: string; status: string; amount: number; currency: string }[] }>(
    `/v1/payment_intents/search?query=${encodeURIComponent(`metadata['idem']:'order-${order!.id}'`)}`,
  ).catch(() => ({ data: [] }))
  // The search can lag a little behind a new payment.
  for (let i = 0; found.data.length === 0 && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    Object.assign(found, await stripe(`/v1/payment_intents/search?query=${encodeURIComponent(`metadata['idem']:'order-${order!.id}'`)}`))
  }
  expect(found.data).toHaveLength(1)
  expect(found.data[0]).toMatchObject({ status: 'succeeded', amount: 20640, currency: 'cad' })

  // The organizer cancels the event: the guest is refunded, and so is the payment at Stripe.
  const { organizerToken } = await import('./support/backend')
  const cancel = await fetch(`${process.env.BACKEND_URL ?? 'http://localhost:8080'}/api/events/${event.id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await organizerToken()}` },
  })
  expect(cancel.ok).toBe(true)
  const refunds = await stripe<{ data: { status: string; amount: number }[] }>(`/v1/refunds?payment_intent=${found.data[0]!.id}`)
  expect(refunds.data).toHaveLength(1)
  expect(refunds.data[0]).toMatchObject({ amount: 20640 })
  expect(['succeeded', 'pending']).toContain(refunds.data[0]!.status)
  expect((await ordersOf(guest.token))[0]).toMatchObject({ status: 'REFUNDED' })
})

test('a declined card is declined by Stripe, says so, and keeps the seats', async ({ page }) => {
  const event = await createEvent({ title: `Stripe declined ${Date.now()}` })
  await signInAsNewGuest(page)
  await chooseAndHold(page, event.id, [3, 4])

  await typeCard(page, '4000000000000002')
  await page.getByRole('button', { name: /^Pay / }).click()
  await expect(page.getByText('Your card was declined')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Pay / })).toBeEnabled()

  // The next card pays.
  await page.reload()
  await typeCard(page, '4242424242424242')
  await page.getByRole('button', { name: /^Pay / }).click()
  await page.waitForURL('**/tickets', { timeout: 30_000 })
})
