// Shared helpers for the k6 scenarios. Everything goes through the real HTTP API, as a browser would.
import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

export const BASE = __ENV.BASE_URL || 'http://localhost:8080';
export const serverErrors = new Counter('server_errors');

/** One request. Anything that is not a clean answer from the app (5xx, no answer) counts as a server error. */
export function call(method, path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  if (opts.admission) headers['X-Admission-Token'] = opts.admission;
  const res = http.request(method, BASE + path, opts.body ? JSON.stringify(opts.body) : null, {
    headers,
    tags: opts.name ? { name: opts.name } : {},
    timeout: opts.timeout || '30s',
  });
  if (res.status === 0 || res.status >= 500) serverErrors.add(1);
  return res;
}

export function organizerLogin() {
  const res = call('POST', '/api/auth/login', {
    body: { email: __ENV.ORGANIZER_EMAIL || 'organizer@ticketrush.dev', password: __ENV.ORGANIZER_PASSWORD },
    name: 'setup',
  });
  if (res.status !== 200) throw new Error('Organizer login failed (' + res.status + '). Is ORGANIZER_PASSWORD set?');
  return res.json('accessToken');
}

/**
 * The guests prepared by loadtest/prepare.sh (ids and tokens). Call this once, at the top level of a script,
 * not inside a function. All virtual users share one copy.
 */
export function sharedGuests() {
  return new SharedArray('guests', () => JSON.parse(open('./results/guests.json')));
}

/**
 * A published event at its own venue: one section "Main" of rows x perRow seats at $96. The sale opens
 * onSaleInMs from now. With queue set, guests have to come through the waiting room.
 */
export function createEvent(organizerToken, { rows, perRow, queue, onSaleInMs, title }) {
  const venue = call('POST', '/api/venues', {
    token: organizerToken, name: 'setup',
    body: { name: 'Load Hall', city: 'Loadville', sections: [{ name: 'Main', rows, seatsPerRow: perRow }] },
  });
  if (venue.status !== 201) throw new Error('Could not create the venue (' + venue.status + '): ' + venue.body);
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const day = 86400000;
  const event = call('POST', '/api/events', {
    token: organizerToken, name: 'setup',
    body: {
      title: title || 'Load Test Drop', artist: 'k6', description: 'Created by the load test.',
      venueId: venue.json('id'),
      startsAt: iso(now + 30 * day), doorsAt: iso(now + 30 * day - 3600000),
      dropOpensAt: iso(now - 60000), onSaleAt: iso(now + onSaleInMs),
      poster: { style: 'ORBIT', inkOne: '#2B2FD9', inkTwo: '#FF5A36', paperColor: '#FFD9C4' },
      prices: [{ sectionId: venue.json('sections.0.id'), priceCents: 9600 }],
      waitingRoom: !!queue,
    },
  });
  if (event.status !== 201) throw new Error('Could not create the event (' + event.status + '): ' + event.body);
  const id = event.json('id');
  const published = call('POST', '/api/events/' + id + '/publish', { token: organizerToken, name: 'setup' });
  if (published.status !== 200) throw new Error('Could not publish the event (' + published.status + ')');
  return { id, saleAt: now + onSaleInMs, seats: rows * perRow };
}

/** Picks two neighbouring free seats from a seat map when there are any, else any two, else nothing. */
export function pickSeats(map, count = 2) {
  const pairs = [];
  const singles = [];
  for (const section of map.sections) {
    for (const row of section.rows) {
      const free = row.seats.filter((s) => s.status === 'AVAILABLE');
      for (let i = 0; i < free.length; i++) {
        singles.push(free[i].id);
        if (i + 1 < free.length && free[i + 1].id === free[i].id + 1) pairs.push([free[i].id, free[i + 1].id]);
      }
    }
  }
  if (count === 2 && pairs.length > 0) return pairs[Math.floor(Math.random() * pairs.length)];
  if (singles.length < count) return [];
  const picked = [];
  while (picked.length < count) {
    const id = singles[Math.floor(Math.random() * singles.length)];
    if (!picked.includes(id)) picked.push(id);
  }
  return picked;
}

export function idempotencyKey() {
  return 'k6-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function jitter(baseSeconds, spreadSeconds) {
  return baseSeconds + (Math.random() * 2 - 1) * spreadSeconds;
}

/** Summary written next to the results. eventTitle tells the verifier which event the run created. */
export function summaryFiles(name, data, meta, textSummary) {
  const out = {};
  out['/loadtest/results/' + name + '-summary.json'] = JSON.stringify({ meta, metrics: data.metrics }, null, 1);
  out.stdout = textSummary(data, { indent: ' ', enableColors: false });
  return out;
}
