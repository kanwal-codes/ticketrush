// Takes the screenshots used in the README, from a stack with realistic data. Run it against a database you do not
// mind adding events to, with the backend started under the "dev,loadtest" profiles:
//
//   BACKEND_URL=http://localhost:8080 WEB_URL=http://localhost:5173 ORGANIZER_PASSWORD=... npm run screenshots
//
// It makes three events called Afterlight Tour: one still to go on sale (the home page and event page), one whose
// waiting room is open with a few hundred people in it, and one on sale with part of the hall already sold (the
// seat map, checkout and tickets).
import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { buySeats, createEvent, createGuests, joinQueue, organizerToken, ticketCodesOf } from '../e2e/support/backend.ts'

const WEB = process.env.WEB_URL ?? 'http://localhost:5173'
const OUT = new URL('../../docs/img/screens/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const poster = { style: 'ORBIT', inkOne: '#2B2FD9', inkTwo: '#FF5A36', paperColor: '#FFD9C4' }
const hall = [
  { name: 'Floor', rows: 3, perRow: 14, priceCents: 12800 },
  { name: 'Stalls', rows: 7, perRow: 16, priceCents: 9600 },
  { name: 'Balcony', rows: 4, perRow: 16, priceCents: 6400 },
]
const afterlight = { title: 'Afterlight Tour', artist: 'Mira Okafor', poster, sections: hall, startsInDays: 40 }

const [me] = await createGuests(1)
const browser = await chromium.launch()

async function shoot(name: string, width: number, height: number, run: (page: Page) => Promise<void>, token = me!.token) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 })
  await context.addInitScript((value) => sessionStorage.setItem('tr.token', value), token)
  const page = await context.newPage()
  await run(page)
  await page.screenshot({ path: `${OUT}${name}.png` })
  await context.close()
  console.log('saved', name)
}

/** Chooses the first free seats in a row. Part of the hall is sold, so seats cannot be named in advance. */
async function chooseFree(page: Page, row: string, count: number) {
  const free = page.getByRole('button', { name: new RegExp(`Stalls row ${row} seat \\d+, available`) })
  for (let i = 0; i < count; i++) await free.nth(i).click() // each chosen seat stops matching "available"
}

// The home page and event page come first, while there is only one Afterlight Tour to show.
// It happens soon so it sits on the first page of a database that already holds many events (the list is ordered by date).
const upcoming = await createEvent({ ...afterlight, startsInDays: 2, onSaleInSeconds: 100, waitingRoom: true })

await shoot('discover', 1280, 960, async (page) => {
  await page.goto(`${WEB}/`)
  await page.locator('#hero-title').waitFor()
  await page.waitForTimeout(700)
})

await shoot('event', 1280, 900, async (page) => {
  await page.goto(`${WEB}/events/${upcoming.id}`)
  await page.getByRole('heading', { level: 1, name: 'Afterlight Tour' }).waitFor()
  await page.waitForTimeout(700)
})

// Then the others. The first has a waiting room that is open but a sale an hour away.
const queued = await createEvent({ ...afterlight, onSaleInSeconds: 3600, waitingRoom: true })
const onSale = await createEvent({ ...afterlight, onSaleInSeconds: -300, waitingRoom: false })

// A crowd already in line, so the guest's place is a real one: 312 people ahead.
const crowd = await createGuests(312)
for (let i = 0; i < crowd.length; i += 25) await Promise.all(crowd.slice(i, i + 25).map((g) => joinQueue(g.token, queued.id)))

// Part of the hall already sold, in pairs and trios scattered about, so the map looks lived in.
const buyers = await createGuests(40)
const taken = new Set<number>()
let bought = 0
for (const [i, buyer] of buyers.entries()) {
  const start = (i * 37 + 11) % (onSale.seatIds.length - 3)
  const seats = onSale.seatIds.slice(start, start + 2 + (i % 2)).filter((id) => !taken.has(id))
  if (seats.length < 2) continue
  seats.forEach((id) => taken.add(id))
  await buySeats(buyer, onSale.id, seats)
  bought += seats.length
}
console.log(`pre-sold ${bought} seats so the map looks lived in`)
if (bought === 0) throw new Error('No seats were pre-sold, so the seat map screenshot would be empty')
// The seat map is cached for a couple of seconds on purpose; let it catch up before taking the picture.
await new Promise((resolve) => setTimeout(resolve, 2500))

await shoot('queue', 1280, 820, async (page) => {
  await page.goto(`${WEB}/events/${queued.id}/queue`)
  await page.getByRole('heading', { name: 'You are in the queue.' }).waitFor()
  await page.getByText('312', { exact: true }).waitFor()
})

await shoot('queue-phone', 390, 844, async (page) => {
  await page.goto(`${WEB}/events/${queued.id}/queue`)
  await page.getByText('312', { exact: true }).waitFor()
})

await shoot('seats', 1280, 1000, async (page) => {
  await page.goto(`${WEB}/events/${onSale.id}/seats`)
  await page.getByRole('heading', { name: 'Stalls' }).waitFor()
  await chooseFree(page, 'E', 2)
  await page.getByText('$206.40').first().waitFor()
})

await shoot('checkout', 1280, 800, async (page) => {
  await page.goto(`${WEB}/events/${onSale.id}/seats`)
  await chooseFree(page, 'C', 2)
  await page.getByRole('button', { name: 'Hold these 2 seats' }).click()
  await page.waitForURL('**/checkout')
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByLabel('Expiry').fill('1234')
  await page.getByLabel('Security code').fill('123')
})

await shoot('tickets', 1280, 1000, async (page) => {
  await page.goto(`${WEB}/events/${onSale.id}/checkout`)
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByLabel('Expiry').fill('1234')
  await page.getByLabel('Security code').fill('123')
  await page.getByRole('button', { name: /^Pay / }).click()
  await page.waitForURL('**/tickets')
  await page.locator('img.stub__qr').first().waitFor()
  await page.waitForTimeout(500)
})

await shoot('tickets-phone', 390, 844, async (page) => {
  await page.goto(`${WEB}/tickets`)
  await page.locator('img.stub__qr').first().waitFor()
  await page.waitForTimeout(500)
})

// The organizer's console, on the on-sale event with part of the hall sold.
const boss = await organizerToken()
const [door] = await ticketCodesOf(buyers[0]!.token)

await shoot('console-new', 1280, 1100, async (page) => {
  await page.goto(`${WEB}/console/events/new`)
  await page.getByLabel('Title').fill('Midnight Orchestra')
  await page.getByLabel('Artist or company').fill('The Marais Collective')
  await page.getByLabel('Venue', { exact: true }).selectOption('new')
  await page.getByLabel('Venue name').fill('Théâtre Laurier')
  await page.getByLabel('City').fill('Montreal')
  await page.getByLabel('Style').selectOption('AURORA')
  await page.getByLabel('First ink').fill('#5cf2b0')
  await page.getByLabel('Second ink').fill('#3f6bff')
  await page.getByLabel('Paper').fill('#101b3a')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(700)
}, boss)

await shoot('console-dashboard', 1280, 900, async (page) => {
  await page.goto(`${WEB}/console/events/${onSale.id}`)
  await page.getByText('Seats by section').waitFor()
  await page.waitForTimeout(1200)
}, boss)

await shoot('console-scanner-phone', 390, 844, async (page) => {
  await page.goto(`${WEB}/console/events/${onSale.id}/scan`)
  const box = page.getByLabel('Ticket code')
  await box.fill(door!)
  await box.press('Enter')
  await page.locator('.scanner__headline').waitFor()
  await box.fill('NOTATICKET')
  await box.press('Enter')
  await page.locator('.scanner__scan').nth(1).waitFor()
  await page.waitForTimeout(600)
}, boss)

// What going wrong looks like. Each failure is made on purpose in the browser, the backend is untouched.
await shoot('error-load', 1280, 700, async (page) => {
  await page.route('**/api/events?*', (route) => route.fulfill({ status: 503, contentType: 'application/problem+json', body: '{"title":"Unavailable","status":503}' }))
  await page.goto(`${WEB}/`)
  await page.getByRole('alert').waitFor()
  await page.waitForTimeout(700)
})

await shoot('error-not-found', 1280, 700, async (page) => {
  await page.goto(`${WEB}/events/999999`)
  await page.getByRole('heading', { level: 1, name: 'We could not find that' }).waitFor()
  await page.waitForTimeout(900)
})

await shoot('error-offline-phone', 390, 844, async (page) => {
  await page.goto(`${WEB}/events/${queued.id}/queue`)
  await page.getByText('312', { exact: true }).waitFor()
  await page.context().setOffline(true)
  await page.getByText('You are offline.').waitFor()
  await page.waitForTimeout(500)
})

await browser.close()
