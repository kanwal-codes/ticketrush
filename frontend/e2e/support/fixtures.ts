import { expect, test, type Page } from '@playwright/test'
import { createGuest } from './backend'

export { expect, test }

/** Signs a ready-made guest in by giving the page its token, without going through the sign-up form. */
export async function signInAsNewGuest(page: Page): Promise<{ id: number; token: string }> {
  const guest = await createGuest()
  await page.addInitScript((token) => sessionStorage.setItem('tr.token', token), guest.token)
  return guest
}

/** Chooses seats by their position in the first row and holds them. Lands on the checkout page. */
export async function chooseAndHold(page: Page, eventId: number, seatNumbers: number[], row = 'A') {
  await page.goto(`/events/${eventId}/seats`)
  for (const n of seatNumbers) await page.getByRole('button', { name: new RegExp(`Stalls row ${row} seat ${n},`) }).click()
  await page.getByRole('button', { name: /^Hold / }).click()
  await page.waitForURL('**/checkout')
}

export async function payWith(page: Page, cardNumber: string) {
  await page.getByLabel('Card number').fill(cardNumber)
  await page.getByLabel('Expiry').fill('1234')
  await page.getByLabel('Security code').fill('123')
  await page.getByRole('button', { name: /^(Pay|Check and try again)/ }).click()
}

/**
 * Waits for the page's one-off animations to finish. Anything that measures how the page looks (contrast, layout)
 * should do it standing still: mid fade-in, text is partly see-through and measures as low contrast. Endless
 * animations, like a loading shimmer, are left alone.
 */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      const running = document.getAnimations().filter((a) => {
        const t = a.effect?.getComputedTiming()
        return a.playState === 'running' && Number.isFinite(t?.endTime) && Number(t?.endTime) > 20
      })
      if (running.length === 0) return
      await Promise.allSettled(running.map((a) => a.finished))
    }
  })
}
