// Browsing: the event list, an event page and its seat map, mostly repeat visits that send If-None-Match.
// These are public, cacheable reads, so this measures how well the cache and 304 paths hold up.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';
import { BASE, serverErrors, summaryFiles } from './lib.js';

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [{ duration: '20s', target: 500 }, { duration: '60s', target: 500 }, { duration: '10s', target: 0 }],
    },
  },
  thresholds: {
    server_errors: ['count==0'],
    checks: ['rate>0.999'],
    'http_req_duration{name:list}': ['p(95)<300'],
    'http_req_duration{name:event}': ['p(95)<300'],
    'http_req_duration{name:seats}': ['p(95)<500'],
  },
};

export function setup() {
  const res = http.get(BASE + '/api/events?size=20');
  const ids = res.json('items').map((e) => e.id);
  if (ids.length === 0) throw new Error('No events to browse. Start the app with the dev profile.');
  return { ids };
}

function get(path, name, etags) {
  const headers = etags[path] ? { 'If-None-Match': etags[path] } : {};
  const res = http.get(BASE + path, { headers, tags: { name } });
  if (res.status === 0 || res.status >= 500) serverErrors.add(1);
  check(res, { [name + ' ok']: (r) => r.status === 200 || r.status === 304 });
  if (res.headers.Etag) etags[path] = res.headers.Etag;
  return res;
}

const etags = {};

export default function (data) {
  const id = data.ids[Math.floor(Math.random() * data.ids.length)];
  get('/api/events', 'list', etags);
  sleep(1 + Math.random() * 2);
  get('/api/events/' + id, 'event', etags);
  sleep(1 + Math.random() * 2);
  get('/api/events/' + id + '/seats', 'seats', etags);
  sleep(2 + Math.random() * 3);
}

export function handleSummary(data) {
  return summaryFiles('browse', data, { scenario: 'browse' }, textSummary);
}
