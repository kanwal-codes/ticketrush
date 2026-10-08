import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, settle, test } from './support/fixtures'

async function expectAccessible(page: Page, where: string) {
  await settle(page)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.help}`), `Accessibility problems on ${where}`).toEqual([])
}

const problem = (status: number, title: string, headers: Record<string, string> = {}) => ({
  status,
  headers: { 'content-type': 'application/problem+json', ...headers },
  body: JSON.stringify({ title, status }),
})

test('when the events cannot be loaded, the guest is told and can try again @mobile', async ({ page }) => {
  let failing = true
  await page.route('**/api/events?*', (route) => (failing ? route.fulfill(problem(503, 'Unavailable')) : route.continue()))
  await page.goto('/')

  const notice = page.getByRole('alert')
  await expect(notice).toContainText('We could not load the events')
  await expect(notice).toContainText('not something you did')
  await expectAccessible(page, 'the events failure notice')

  failing = false
  await notice.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('an unknown page or event gets a designed screen with a way home', async ({ page }) => {
  await page.goto('/events/999999')
  await expect(page.getByRole('heading', { level: 1, name: 'We could not find that' })).toBeVisible()
  await expectAccessible(page, 'the not-found screen')
  await page.getByRole('link', { name: 'See what is on' }).click()
  await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()

  await page.goto('/no/such/page')
  await expect(page.getByRole('heading', { level: 1, name: 'We could not find that page' })).toBeVisible()
  await page.getByText('Details').click()
  await expect(page.getByText(/^Reference TR-ERR-/)).toBeVisible()
})

test('a rate limit shows how long to wait and unlocks the button by itself', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.fulfill(problem(429, 'Too many requests', { 'retry-after': '3' })))
  await page.goto('/signin')
  await page.getByLabel('Email').fill('ana@example.org')
  await page.getByLabel('Password').fill('a-password-here')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toContainText('Slow down a moment')
  const button = page.getByRole('button', { name: /^Try again in \d+ s$/ })
  await expect(button).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 6000 })
})

test('going offline says so, says nothing is lost, and announces the return', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByText('You are offline.')).toBeVisible()
  await expect(page.getByText(/place in line/)).toBeVisible()
  await expectAccessible(page, 'the offline bar')

  await context.setOffline(false)
  await expect(page.getByText('You are back online.')).toBeVisible()
  await expect(page.getByText('You are back online.')).toBeHidden({ timeout: 6000 })
})
