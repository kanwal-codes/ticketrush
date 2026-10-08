// 20 guests, 30 seconds, strict thresholds. Fast enough to run on every push.
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';
import { call, createEvent, createGuest, idempotencyKey, organizerLogin, pickSeats, serverErrors, summaryFiles } from './lib.js';

const paid = new Counter('orders_paid');

export const options = {
  scenarios: {
    smoke: { executor: 'constant-vus', vus: 20, duration: '30s' },
  },
  thresholds: {
    server_errors: ['count==0'],
    checks: ['rate>0.99'],
    'http_req_duration{name:hold}': ['p(95)<500'],
    'http_req_duration{name:pay}': ['p(95)<1000'],
    'http_req_duration{name:seats}': ['p(95)<500'],
  },
};

export function setup() {
  const token = organizerLogin();
  const event = createEvent(token, { rows: 20, perRow: 50, queue: false, onSaleInMs: -60000, title: 'Smoke' });
  return { token, eventId: event.id, seats: event.seats };
}

export default function (data) {
  const guest = createGuest(data.token);
  for (let attempt = 0; attempt < 5; attempt++) {
    const map = call('GET', '/api/events/' + data.eventId + '/seats', { name: 'seats' }).json();
    const seats = pickSeats(map);
    if (seats.length === 0) return;
    const hold = call('POST', '/api/events/' + data.eventId + '/holds', {
      token: guest.token, body: { seatIds: seats }, name: 'hold',
    });
    if (hold.status === 409) continue; // someone else got there first: look again
    if (!check(hold, { 'hold made': (r) => r.status === 201 })) return;
    const order = call('POST', '/api/orders', {
      token: guest.token, name: 'pay', headers: { 'Idempotency-Key': idempotencyKey() },
      body: { holdId: hold.json('id'), paymentToken: 'tok_visa' },
    });
    if (check(order, { 'paid with two tickets': (r) => r.status === 201 && r.json('tickets').length === 2 })) {
      paid.add(1);
    }
    break;
  }
  sleep(1);
}

export function handleSummary(data) {
  return summaryFiles('smoke', data, { scenario: 'smoke', eventTitle: 'Smoke' }, textSummary);
}
