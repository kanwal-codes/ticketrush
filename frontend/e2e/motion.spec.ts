import type { Page } from '@playwright/test'
import { createEvent } from './support/backend'
import { chooseAndHold, expect, payWith, signInAsNewGuest, test } from './support/fixtures'

/** Adds a recorder for layout shift, and for what the View Transitions API is asked to do. Runs before the app does. */
async function instrument(page: Page, options: { withoutViewTransitions?: boolean } = {}) {
  await page.addInitScript((without) => {
    const w = window as unknown as Record<string, unknown>
    w.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) w.__cls = (w.__cls as number) + entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })

    w.__vtStarted = 0
    w.__vtPseudos = [] as string[]
    const doc = document as unknown as { startViewTransition?: (cb?: () => unknown) => { ready: Promise<void> } }
    if (without) {
      delete doc.startViewTransition
      Object.defineProperty(doc, 'startViewTransition', { value: undefined, configurable: true })
      return
    }
    const original = doc.startViewTransition?.bind(document)
    if (original) {
      doc.startViewTransition = (cb) => {
        w.__vtStarted = (w.__vtStarted as number) + 1
        const transition = original(cb)
        transition.ready
          .then(() => {
            for (const a of document.getAnimations()) {
              const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement
              if (pseudo) (w.__vtPseudos as string[]).push(pseudo)
            }
          })
          .catch(() => undefined)
        return transition
      }
    }
  }, options.withoutViewTransitions ?? false)
}

const read = <T>(page: Page, key: string) => page.evaluate((k) => (window as unknown as Record<string, unknown>)[k] as T, key)

test('no screen shifts its layout while it loads', async ({ page }) => {
  await instrument(page)
  await signInAsNewGuest(page)
  const event = await createEvent({ waitingRoom: false, title: `Shift ${Date.now()}` })

  const screens: [string, string, () => Promise<unknown>][] = [
    ['home', '/', () => expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()],
    ['event page', `/events/${event.id}`, () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
    ['seat map', `/events/${event.id}/seats`, () => expect(page.getByRole('button', { name: /Stalls row A seat 1,/ })).toBeVisible()],
  ]
  for (const [name, url, ready] of screens) {
    await page.goto(url)
    await ready()
    await page.waitForTimeout(800) // fonts and late data have had their chance to shift things
    expect(await read<number>(page, '__cls'), `layout shift on the ${name}`).toBeLessThan(0.02)
  }

  await chooseAndHold(page, event.id, [1, 2])
  await expect(page.getByRole('button', { name: /^Pay / })).toBeVisible()
  await page.waitForTimeout(800)
  expect(await read<number>(page, '__cls'), 'layout shift on checkout').toBeLessThan(0.02)
  await payWith(page, '4242424242424242')
  await page.waitForURL('**/tickets')
  await expect(page.locator('img.stub__qr').first()).toBeVisible()
  await page.waitForTimeout(800)
  expect(await read<number>(page, '__cls'), 'layout shift on the tickets').toBeLessThan(0.02)
})

test('moving to an event is a view transition, and the poster glides from the card to the page', async ({ page }) => {
  await instrument(page)
  const event = await createEvent({ waitingRoom: false, title: `Glide ${Date.now()}` })
  await page.goto(`/?q=${encodeURIComponent(event.title)}`)
  const card = page.getByRole('link', { name: new RegExp(event.title) })
  await expect(card).toBeVisible()
  // The poster on the card carries the name that the poster on the next page will carry too.
  expect(await card.locator('.card__poster').evaluate((el) => getComputedStyle(el).viewTransitionName)).toBe(`poster-${event.id}`)

  await card.click()
  await page.waitForURL(`**/events/${event.id}`)
  await expect(page.getByRole('heading', { level: 1, name: event.title })).toBeVisible()

  expect(await read<number>(page, '__vtStarted')).toBeGreaterThanOrEqual(1)
  const pseudos = await read<string[]>(page, '__vtPseudos')
  expect(pseudos.some((p) => p.includes(`poster-${event.id}`)), `animated pseudo-elements: ${pseudos.join(', ')}`).toBe(true)
  expect(await page.locator('.event__poster').evaluate((el) => getComputedStyle(el).viewTransitionName)).toBe(`poster-${event.id}`)
})

test('after moving to a new page, keyboard focus is on its heading', async ({ page }) => {
  const event = await createEvent({ waitingRoom: false, title: `Focus ${Date.now()}` })
  await page.goto(`/?q=${encodeURIComponent(event.title)}`)
  await page.getByRole('link', { name: new RegExp(event.title) }).click()
  await expect(page.getByRole('heading', { level: 1, name: event.title })).toBeFocused()
  await page.getByRole('link', { name: 'All events' }).click()
  await expect(page.locator('main h1')).toBeFocused()
})

test('without the View Transitions API pages still change, and still rise in', async ({ page }) => {
  await instrument(page, { withoutViewTransitions: true })
  const event = await createEvent({ waitingRoom: false, title: `Fallback ${Date.now()}` })
  await page.goto(`/?q=${encodeURIComponent(event.title)}`)
  expect(await page.evaluate(() => typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition)).toBe('undefined')

  await page.getByRole('link', { name: new RegExp(event.title) }).click()
  await expect(page.getByRole('heading', { level: 1, name: event.title })).toBeVisible()
  expect(await page.locator('main > *').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('rise-in')
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing travels or loops when the guest asks for less motion', async ({ page }) => {
    const event = await createEvent({ waitingRoom: false, title: `Calm ${Date.now()}` })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()

    const describe = (page: Page, only: 'looping' | 'running') =>
      page.evaluate((kind) => {
        return document
          .getAnimations()
          // Under reduced motion every duration is cut to 0.01 ms, which is instant; anything longer than a frame is real.
          .filter((a) => Number(a.effect?.getComputedTiming().endTime ?? 0) > 20)
          .filter((a) => (kind === 'looping' ? (a.effect?.getComputedTiming().iterations ?? 1) === Infinity : a.playState === 'running'))
          .map((a) => `${(a as CSSAnimation).animationName ?? 'animation'} on ${String((a.effect as KeyframeEffect | null)?.target?.className ?? '?')}${(a.effect as KeyframeEffect | null)?.pseudoElement ?? ''}`)
      }, only)
    expect(await describe(page, 'looping'), 'looping animations on the home page').toEqual([])
    expect(await page.locator('main > *').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')

    await page.goto(`/events/${event.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await describe(page, 'running'), 'animations running on the event page').toEqual([])
  })
})
