import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {score, daysLeft, money, ics} from '../assets/js/opps/score.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/opps-score.json', import.meta.url)));
const profiles = JSON.parse(readFileSync(new URL('../data/opportunity-profiles.json', import.meta.url))).profiles;

test('page scores match the weekly email scores exactly', () => {
  for (const p of profiles) for (const it of fx.items) assert.equal(score(it, p), fx.expected[p.id][it.id], `${p.id}/${it.id}`);
});

test('scores rank the obvious cases sensibly', () => {
  const [practice, projects] = profiles;
  const s = id => fx.items.find(i => i.id === id);
  assert.ok(score(s('a'), practice) > score(s('b'), practice), 'photo residency beats rural bando for practice');
  assert.ok(score(s('b'), projects) > score(s('a'), projects), 'rural bando beats photo residency for projects');
  assert.equal(score(s('c'), practice), 0, 'excluded word');
  assert.equal(score(s('f'), practice), 0, 'closed');
});

test('days left, money and calendar export', () => {
  assert.equal(daysLeft({deadline: '2026-12-01'}, new Date('2026-11-26T15:00:00Z')), 5);
  assert.equal(daysLeft({}), null);
  assert.equal(money({max: 200000, currency: 'EUR'}), '€200k');
  assert.equal(money({max: 2500000, currency: 'GBP'}), '£2.5m');
  assert.equal(money({max: 5000, currency: 'GBP'}), '£5,000');
  const cal = ics([{id: 'x1', title: 'Grant; with, commas', deadline: '2026-12-31', source: 'S', url: 'https://s/x'}, {id: 'no-date', title: 'skip'}], new Date('2026-11-26T10:00:00Z'));
  assert.match(cal, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(cal, /SUMMARY:Deadline: Grant\\; with\\, commas/);
  assert.match(cal, /TRIGGER:-P7D/);
  assert.equal((cal.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(cal.endsWith('END:VCALENDAR\r\n'));
});
