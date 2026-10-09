import { createEvent } from './support/backend'
import { expect, signInAsNewGuest, test } from './support/fixtures'

test('a click anywhere on the home page banner opens the event @mobile', async ({ page }) => {
  await signInAsNewGuest(page)
  await createEvent({ onSaleInSeconds: 45, waitingRoom: true })
  await page.goto('/')
  const banner = page.getByRole('region').filter({ has: page.locator('#hero-title') })
  await expect(banner).toBeVisible()

  // The poster, the empty space and the title all lead to the event, not just the button.
  for (const where of ['poster', 'title', 'corner'] as const) {
    await page.goto('/')
    const box = (await banner.boundingBox())!
    const target =
      where === 'poster'
        ? { x: box.x + 40, y: box.y + 40 }
        : where === 'title'
          ? await page.locator('#hero-title').boundingBox().then((b) => ({ x: b!.x + 10, y: b!.y + b!.height / 2 }))
          : { x: box.x + box.width - 8, y: box.y + 8 }
    await page.mouse.click(target.x, target.y)
    await expect(page, `clicking the banner's ${where}`).toHaveURL(/\/events\/\d+$/)
  }
})

test('the way back stays in view while a long page scrolls, on a laptop and on a phone @mobile', async ({ page }) => {
  await signInAsNewGuest(page)
  const event = await createEvent({ waitingRoom: false, rows: 8, perRow: 12 })

  for (const [path, name] of [
    [`/events/${event.id}`, 'All events'],
    [`/events/${event.id}/seats`, event.title],
  ] as const) {
    await page.goto(path)
    const back = page.getByRole('link', { name })
    await expect(back).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50)
    await expect(back, `${path} after scrolling to the bottom`).toBeInViewport()
    const box = await back.boundingBox()
    expect(box!.y, 'it sits just under the header, not behind it').toBeGreaterThanOrEqual(55)
  }

  // And it works: back from the event goes home.
  await page.goto(`/events/${event.id}`)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.getByRole('link', { name: 'All events' }).click()
  await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()
})

test('what is on screen depends on who is looking: no tickets link when signed out, a footer at the bottom of short pages', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'My tickets' })).toHaveCount(0)
  const footer = page.locator('footer.site-footer')
  const viewport = page.viewportSize()!
  const box = (await footer.boundingBox())!
  expect(Math.round(box.y + box.height), 'the footer reaches the bottom of the window on a short page').toBeGreaterThanOrEqual(viewport.height - 1)

  await signInAsNewGuest(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'My tickets' })).toBeVisible()
})
