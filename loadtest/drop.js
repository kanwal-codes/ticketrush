// A flash sale, start to finish. Every virtual user is one guest: they arrive over the first 40 seconds, join
// the waiting room, watch their place, get let in once the sale opens, pick seats from the seat map, hold
// them and pay. Some behave badly on purpose: abandon the hold, use a declined card, hit a payment provider
// error, or submit the payment twice at once.
//
// Defaults: 1,500 guests for 1,000 seats. Override with GUESTS, ROWS, PER_ROW.
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';
import http from 'k6/http';
import { call, createEvent, idempotencyKey, jitter, organizerLogin, pickSeats, serverErrors, sharedGuests, summaryFiles } from './lib.js';

const GUESTS = Number(__ENV.GUESTS || 1500);
const guests = sharedGuests();
const ROWS = Number(__ENV.ROWS || 25);
const PER_ROW = Number(__ENV.PER_ROW || 40);
const SALE_OPENS_IN_MS = 25000;
const ARRIVE_OVER_SECONDS = 40;
const BANDS = Math.ceil(GUESTS / 100);

const paid = new Counter('orders_paid');
const declined = new Counter('orders_declined_then_paid');
const unknownOutcome = new Counter('orders_unknown_outcome');
const doubleSubmitted = new Counter('double_submits');
const abandoned = new Counter('holds_abandoned');
const soldOutSeen = new Counter('guests_seeing_sold_out');
const seatsTaken = new Counter('hold_conflicts');
const gaveUp = new Counter('guests_gave_up_waiting');
const joinPosition = new Trend('join_position');
const admitWait = new Trend('admit_wait', true);

const thresholds = {
  server_errors: ['count==0'],
  checks: ['rate>0.99'],
  guests_gave_up_waiting: ['count==0'],
  'http_req_duration{name:join}': ['p(95)<1000'],
  'http_req_duration{name:place}': ['p(95)<1000'],
  'http_req_duration{name:seats}': ['p(95)<1500'],
  'http_req_duration{name:hold}': ['p(95)<2000'],
  'http_req_duration{name:pay}': ['p(95)<3000'],
};
// One sub-metric per band of 100 places in line, so the summary shows when each band got in. Never fails.
for (let b = 0; b < BANDS; b++) thresholds['admit_wait{band:' + b + '}'] = ['max>=0'];

export const options = {
  scenarios: {
    drop: { executor: 'per-vu-iterations', vus: GUESTS, iterations: 1, maxDuration: '8m' },
  },
  thresholds,
};

export function setup() {
  const token = organizerLogin();
  const event = createEvent(token, { rows: ROWS, perRow: PER_ROW, queue: true, onSaleInMs: SALE_OPENS_IN_MS, title: 'Drop' });
  return { token, eventId: event.id, saleAt: event.saleAt, seats: event.seats };
}

export default function (data) {
  const guest = guests[__VU - 1];
  sleep(Math.random() * ARRIVE_OVER_SECONDS);

  // 1. Join the waiting room.
  const queue = '/api/events/' + data.eventId + '/queue';
  let joined = call('POST', queue, { token: guest.token, name: 'join' });
  while (joined.status === 429) {
    sleep(Number(joined.headers['Retry-After'] || 2));
    joined = call('POST', queue, { token: guest.token, name: 'join' });
  }
  if (!check(joined, { 'joined the waiting room': (r) => r.status === 200 })) return;
  const position = joined.json('position');
  if (position !== null) joinPosition.add(position);

  // 2. Watch the place until let in.
  let admission = null;
  const deadline = Date.now() + 6 * 60000;
  while (Date.now() < deadline) {
    const status = call('GET', queue, { token: guest.token, name: 'place' });
    if (status.status === 429) {
      sleep(Number(status.headers['Retry-After'] || 2));
      continue;
    }
    if (status.status === 200 && status.json('state') === 'ADMITTED') {
      admission = status.json('admissionToken');
      break;
    }
    sleep(jitter(2, 0.5));
  }
  if (admission === null) {
    gaveUp.add(1);
    return;
  }
  if (position !== null) admitWait.add(Date.now() - data.saleAt, { band: String(Math.floor((position - 1) / 100)) });

  // 3. Pick seats from the seat map and hold them. If someone got there first, look again.
  let hold = null;
  for (let attempt = 0; attempt < 8 && hold === null; attempt++) {
    const map = call('GET', '/api/events/' + data.eventId + '/seats', { name: 'seats' }).json();
    const seats = pickSeats(map);
    if (seats.length === 0) {
      soldOutSeen.add(1);
      call('DELETE', queue, { token: guest.token, name: 'leave' }); // a real page frees the place when it says "sold out"
      return;
    }
    const res = call('POST', '/api/events/' + data.eventId + '/holds', {
      token: guest.token, admission, body: { seatIds: seats }, name: 'hold',
    });
    if (res.status === 201) hold = res.json();
    else if (res.status === 409) { seatsTaken.add(1); sleep(jitter(0.5, 0.2)); }
    else { check(res, { 'hold made or seats taken': () => false }); return; }
  }
  if (hold === null) return;

  // 4. Some guests wander off.
  const roll = Math.random();
  if (roll < 0.10) {
    abandoned.add(1);
    return;
  }

  // 5. Type in card details, then pay.
  sleep(3 + Math.random() * 5);
  const holdId = hold.id;
  if (roll < 0.15) {
    // Declined card first, then a good one with a new key.
    const bad = pay(guest, holdId, 'tok_declined', idempotencyKey());
    check(bad, { 'declined card is a 402': (r) => r.status === 402 });
    sleep(2);
    const good = pay(guest, holdId, 'tok_visa', idempotencyKey());
    if (check(good, { 'second card paid': (r) => r.status === 201 })) { paid.add(1); declined.add(1); }
  } else if (roll < 0.18) {
    // The provider is down: nothing is known, the order stays pending, the seats stay held.
    const res = pay(guest, holdId, 'tok_error', idempotencyKey());
    check(res, { 'unknown outcome is a 202': (r) => r.status === 202 });
    unknownOutcome.add(1);
  } else if (roll < 0.23) {
    // Double click: two identical requests at the same moment.
    const key = idempotencyKey();
    const body = JSON.stringify({ holdId, paymentToken: 'tok_visa' });
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + guest.token, 'Idempotency-Key': key };
    const res = http.batch([
      ['POST', BASE_URL + '/api/orders', body, { headers, tags: { name: 'pay' } }],
      ['POST', BASE_URL + '/api/orders', body, { headers, tags: { name: 'pay' } }],
    ]);
    doubleSubmitted.add(1);
    const statuses = res.map((r) => r.status).sort();
    check(statuses, {
      'double submit pays once': (s) => (s[0] === 200 && s[1] === 201) || (s[0] === 201 && s[1] === 201 && res[0].json('id') === res[1].json('id')),
    });
    if (statuses.includes(201)) paid.add(1);
    res.forEach((r) => { if (r.status >= 500 || r.status === 0) serverErrors.add(1); });
  } else {
    const res = pay(guest, holdId, 'tok_visa', idempotencyKey());
    if (check(res, { 'paid with two tickets': (r) => r.status === 201 && r.json('tickets').length === 2 })) paid.add(1);
  }
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

function pay(guest, holdId, paymentToken, key) {
  return call('POST', '/api/orders', {
    token: guest.token, name: 'pay', headers: { 'Idempotency-Key': key }, body: { holdId, paymentToken },
  });
}

export function handleSummary(data) {
  return summaryFiles('drop', data, { scenario: 'drop', eventTitle: 'Drop', guests: GUESTS, seats: ROWS * PER_ROW }, textSummary);
}
