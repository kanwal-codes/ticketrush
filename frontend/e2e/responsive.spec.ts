import type { Page } from '@playwright/test'
import { createEvent } from './support/backend'
import { chooseAndHold, expect, payWith, signInAsNewGuest, test } from './support/fixtures'

const widths = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
]

/** How far the page is wider than the screen, and, if it is, which elements stick out. */
const sidewaysScroll = (page: Page) =>
  page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth
    const wide =
      over > 0
        ? [...document.querySelectorAll('body *')]
            .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
            .slice(0, 5)
            .map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className)} (right edge at ${Math.round(e.getBoundingClientRect().right)})`)
        : []
    return { over, wide }
  })

const expectNoSidewaysScroll = async (page: Page, where: string) => {
  const { over, wide } = await sidewaysScroll(page)
  expect(over, `${where}: ${wide.join('; ')}`).toBeLessThanOrEqual(0)
}

test('no screen of the purchase scrolls sideways at phone, tablet or laptop width', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent({ waitingRoom: false, rows: 6, perRow: 24 }) // wide rows, the likeliest to overflow

  for (const size of widths) {
    await page.setViewportSize({ width: size.width, height: size.height })
    const screens: [string, () => Promise<void>][] = [
      ['home', async () => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible() }],
      ['event page', async () => { await page.goto(`/events/${event.id}`); await expect(page.getByRole('heading', { level: 1 })).toBeVisible() }],
      ['seat map', async () => { await page.goto(`/events/${event.id}/seats`); await expect(page.getByRole('button', { name: /Stalls row A seat 1,/ })).toBeVisible() }],
    ]
    for (const [name, open] of screens) {
      await open()
      await expectNoSidewaysScroll(page, `${name} at ${size.name} width`)
    }
  }

  // Checkout and tickets need a purchase.
  await chooseAndHold(page, event.id, [1, 2])
  for (const size of widths) {
    await page.setViewportSize({ width: size.width, height: size.height })
    await expect(page.getByRole('button', { name: /^Pay / })).toBeVisible()
    await expectNoSidewaysScroll(page, `checkout at ${size.name} width`)
  }
  await payWith(page, '4242424242424242')
  await page.waitForURL('**/tickets')
  await expect(page.locator('img.stub__qr').first()).toBeVisible()
  for (const size of widths) {
    await page.setViewportSize({ width: size.width, height: size.height })
    await expectNoSidewaysScroll(page, `tickets at ${size.name} width`)
  }
})

/**
 * Between the full desktop layout and the 560px phone layout, there is not always room for every nav item on one
 * line. The nav must wrap as whole items onto a second line there, never split a single link's own words in two
 * (found at 600px: "My tickets" and "Sign out" each broke across two lines).
 */
test('a nav item never splits its own words across lines, at any width between phone and desktop', async ({ page }) => {
  await signInAsNewGuest(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'My tickets' })).toBeVisible()

  for (const width of [561, 600, 650, 700, 750, 850, 1024]) {
    await page.setViewportSize({ width, height: 700 })
    // "Events" is one word: it can never wrap, so its height is what a genuine single line looks like here.
    const oneLine = (await page.getByRole('link', { name: 'Events' }).boundingBox())!.height
    for (const label of ['My tickets', 'Sign out']) {
      const box = await page.getByRole('link', { name: label }).or(page.getByRole('button', { name: label })).boundingBox()
      expect(box?.height, `"${label}" at ${width}px wide (height ${box?.height}, one line is ${oneLine})`).toBeLessThanOrEqual(oneLine + 1)
    }
  }
})
