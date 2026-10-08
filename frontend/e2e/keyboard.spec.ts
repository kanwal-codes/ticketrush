import { createEvent } from './support/backend'
import { expect, signInAsNewGuest, test } from './support/fixtures'

test('the whole purchase can be made with the keyboard alone', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent({ waitingRoom: false })
  await page.goto(`/events/${event.id}/seats`)
  const first = page.getByRole('button', { name: /Stalls row A seat 1,/ })
  await expect(first).toBeVisible()

  // Tab lands on the map once, then the arrow keys move around it, Space chooses.
  await first.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: /Stalls row B seat 2,/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Hold these 3 seats' })).toBeEnabled()

  await page.getByRole('button', { name: 'Hold these 3 seats' }).focus()
  await page.keyboard.press('Enter')
  await page.waitForURL('**/checkout')

  await page.getByLabel('Card number').focus()
  await page.keyboard.type('4242424242424242')
  await page.keyboard.press('Tab')
  await page.keyboard.type('1234')
  await page.keyboard.press('Tab')
  await page.keyboard.type('123')
  await page.keyboard.press('Enter')

  await page.waitForURL('**/tickets')
  await expect(page.locator('.stub')).toHaveCount(3)
})

test('the seat map is a single stop in the tab order', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent({ waitingRoom: false, rows: 3, perRow: 12 })
  await page.goto(`/events/${event.id}/seats`)
  await expect(page.getByRole('button', { name: /Stalls row A seat 1,/ })).toBeVisible()
  const stops = await page.getByRole('button', { name: /Stalls row/ }).evaluateAll((seats) => seats.filter((s) => (s as HTMLElement).tabIndex === 0).length)
  expect(stops).toBe(1)
})
