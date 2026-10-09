import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { createEvent } from './support/backend'
import { chooseAndHold, expect, payWith, settle, signInAsNewGuest, test } from './support/fixtures'

/** Serious and critical problems fail the test; each is listed with where it is, so it can be fixed. */
async function expectAccessible(page: Page, where: string) {
  await settle(page)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id} (${v.impact}): ${v.help} - ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} ${n.html.slice(0, 110)} [${n.any[0]?.message ?? ''}]`).join(' | ')}`),
    `Accessibility problems on ${where}`,
  ).toEqual([])
}

test('every screen of the purchase passes an accessibility scan @mobile', async ({ page }) => {
  await signInAsNewGuest(page)
  const waiting = await createEvent({ onSaleInSeconds: 600, title: `Waiting ${Date.now()}`, poster: { style: 'AURORA', inkOne: '#3F6BFF', inkTwo: '#5CF2B0', paperColor: '#101B3A' } })
  const open = await createEvent({ waitingRoom: false, title: `Open ${Date.now()}`, poster: { style: 'CURTAIN', inkOne: '#0E4D3A', inkTwo: '#F08FA8', paperColor: '#F4CFD8' } })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'On now' })).toBeVisible()
  await expectAccessible(page, 'the home page')

  await page.goto(`/events/${waiting.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page, 'an event with a dark poster (upcoming sale)')

  await page.goto(`/events/${waiting.id}/queue`)
  await expect(page.getByRole('heading', { name: 'You are in the queue.' })).toBeVisible()
  await expectAccessible(page, 'the waiting room')

  await page.goto(`/events/${open.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page, 'an event page that is on sale')

  await page.goto(`/events/${open.id}/seats`)
  await expect(page.getByRole('button', { name: /Stalls row A seat 1,/ })).toBeVisible()
  await expectAccessible(page, 'the seat map')

  await chooseAndHold(page, open.id, [1, 2])
  await expect(page.getByRole('button', { name: /^Pay / })).toBeVisible()
  await expectAccessible(page, 'checkout')
  await payWith(page, '4242424242424242')
  await page.waitForURL('**/tickets')
  await expect(page.locator('img.stub__qr').first()).toBeVisible()
  await expectAccessible(page, 'the ticket wallet')
})

test('sign in and register pass an accessibility scan', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expectAccessible(page, 'sign in')
  await page.getByRole('button', { name: 'Sign in' }).click() // with the errors showing
  await expect(page.getByText('Enter your email')).toBeVisible()
  await expectAccessible(page, 'sign in with validation errors')
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expectAccessible(page, 'register')
})

test('the account recovery pages pass an accessibility scan', async ({ page }) => {
  // The server's answers are stubbed: what is under test here is the pages, in a real browser.
  await page.route('**/api/auth/forgot-password', (route) => route.fulfill({ status: 202 }))
  await page.route('**/api/auth/reset-password', (route) => route.fulfill({ status: 204 }))
  await page.route('**/api/auth/verify-email', (route) => route.fulfill({ status: 204 }))

  await page.goto('/signin')
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await expectAccessible(page, 'forgot password')
  await page.getByLabel('Email').fill('dana@example.org')
  await page.getByRole('button', { name: 'Send the link' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()
  await expectAccessible(page, 'forgot password, sent')

  await page.goto('/reset-password?token=abc')
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expectAccessible(page, 'choose a new password')
  await page.getByLabel('New password').fill('a-brand-new-one')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible()
  await expectAccessible(page, 'password changed')

  await page.goto('/verify-email?token=abc')
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
  await expectAccessible(page, 'email confirmed')
})
