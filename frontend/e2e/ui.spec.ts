import { createEvent } from './support/backend'
import { expect, signInAsNewGuest, test } from './support/fixtures'

test('the featured image and the button on the home page each open the event, and the text beside them does not @mobile', async ({ page }) => {
  await signInAsNewGuest(page)
  await createEvent({ onSaleInSeconds: 45, waitingRoom: true })
  await page.goto('/')
  const banner = page.getByRole('region').filter({ has: page.locator('#hero-title') })
  await expect(banner).toBeVisible()

  for (const where of ['image', 'button'] as const) {
    await page.goto('/')
    // On a phone the banner is taller than the window, so bring the target into view before clicking by coordinates.
    const element = where === 'image' ? banner.locator('.hero__feature') : banner.locator('a.hero__cta')
    await element.scrollIntoViewIfNeeded()
    const box = (await element.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page, `clicking the banner's ${where}`).toHaveURL(/\/events\/\d+$/)
  }

  // The rest of the banner is plain text: no layer sits over it, so it can be selected, and clicking it goes nowhere.
  await page.goto('/')
  const lead = banner.locator('.hero__description')
  await lead.scrollIntoViewIfNeeded()
  const at = await lead.boundingBox().then((b) => ({ x: b!.x + 10, y: b!.y + b!.height / 2 }))
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, at), 'the description is the element under the pointer').toContain('hero__description')
  await page.mouse.click(at.x, at.y)
  await expect(page).toHaveURL(/\/$/)
})

test('the way back stays in view while a long page scrolls, on a laptop and on a phone @mobile', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent({ waitingRoom: false, rows: 20, perRow: 12 })

  // The seat map is long on every screen. The event page can fit a phone's window, and then there is nothing to scroll.
  for (const [path, name, long] of [
    [`/events/${event.id}`, 'Back to all events', false],
    [`/events/${event.id}/seats`, 'Back to the event', true],
  ] as const) {
    await page.goto(path)
    const back = page.getByRole('link', { name })
    await expect(back).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    if (long) await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50)
    await expect(back, `${path} after scrolling to the bottom`).toBeInViewport()
    const box = await back.boundingBox()
    // The header scrolls away on purchase pages; the back-and-progress bar is what stays, at the very top.
    expect(box!.y, 'it sits in the bar at the top of the window').toBeGreaterThanOrEqual(0)
    expect(box!.y, 'and the bar is not pushed down by anything above it').toBeLessThan(40)
  }

  // And it works: back from the event goes home.
  await page.goto(`/events/${event.id}`)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.getByRole('link', { name: 'Back to all events' }).click()
  await expect(page.getByRole('heading', { name: 'What’s on.' })).toBeVisible()
})

test('what is on screen depends on who is looking: no account menu when signed out, a footer at the bottom of short pages', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: /account menu/i })).toHaveCount(0)
  const footer = page.locator('footer.site-footer')
  const viewport = page.viewportSize()!
  const box = (await footer.boundingBox())!
  expect(Math.round(box.y + box.height), 'the footer reaches the bottom of the window on a short page').toBeGreaterThanOrEqual(viewport.height - 1)

  await signInAsNewGuest(page)
  await page.goto('/')
  await page.getByRole('button', { name: /account menu/i }).click()
  await expect(page.getByRole('link', { name: 'My tickets' })).toBeVisible()
})
