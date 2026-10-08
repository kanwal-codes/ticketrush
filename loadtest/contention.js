// Many guests go for the same seat at the same moment. Exactly one may get it; everyone else must be told
// quickly. MODE=pairs makes 1,000 guests chase 20 seats in pairs instead (at most 10 holds can exist).
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';
import { call, createEvent, organizerLogin, serverErrors, sharedGuests, summaryFiles } from './lib.js';

const GUESTS = Number(__ENV.GUESTS || 1000);
const guests = sharedGuests();
const PAIRS = __ENV.MODE === 'pairs';
const won = new Counter('holds_won');
const lost = new Counter('holds_lost');

export const options = {
  scenarios: {
    contention: { executor: 'per-vu-iterations', vus: GUESTS, iterations: 1, maxDuration: '3m' },
  },
  thresholds: {
    server_errors: ['count==0'],
    checks: ['rate>0.999'],
    holds_won: PAIRS ? ['count>=1', 'count<=10'] : ['count==1'],
    'http_req_duration{name:hold}': ['p(99)<1500'],
  },
};

export function setup() {
  const token = organizerLogin();
  const event = createEvent(token, { rows: 2, perRow: 10, queue: false, onSaleInMs: -60000, title: 'Contention' });
  const map = call('GET', '/api/events/' + event.id + '/seats', { name: 'setup' }).json();
  const ids = [];
  for (const section of map.sections) for (const row of section.rows) for (const seat of row.seats) ids.push(seat.id);
  // Everyone starts together: every virtual user waits for this moment.
  return { token, eventId: event.id, seatIds: ids, goAt: Date.now() + 10000 };
}

export default function (data) {
  const guest = guests[__VU - 1];
  const wait = (data.goAt - Date.now()) / 1000;
  if (wait > 0) sleep(wait);

  const seatIds = PAIRS
    ? twoOf(data.seatIds.slice(0, 20))
    : [data.seatIds[0]];
  const res = call('POST', '/api/events/' + data.eventId + '/holds', {
    token: guest.token, body: { seatIds }, name: 'hold',
  });
  check(res, { 'held or told the seats are taken': (r) => r.status === 201 || r.status === 409 });
  if (res.status === 201) won.add(1);
  if (res.status === 409) lost.add(1);
}

function twoOf(seats) {
  const a = Math.floor(Math.random() * seats.length);
  let b = Math.floor(Math.random() * seats.length);
  while (b === a) b = Math.floor(Math.random() * seats.length);
  return [seats[a], seats[b]];
}

export function handleSummary(data) {
  return summaryFiles('contention', data, { scenario: 'contention', mode: PAIRS ? 'pairs' : 'single', eventTitle: 'Contention' }, textSummary);
}
