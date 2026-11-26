// Match scores for Opportunities. Same rules as scripts/opportunities/digest.py (kept in step by tests).
// 0-100: keyword hits + region + type + known deadline/amount, minus excluded words. No AI.

export function haystack(item) {
  return [item.title, item.summary, item.source, item.programme, (item.kinds || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
}

const count = (text, words) => (words || []).filter(w => w && text.includes(String(w).toLowerCase())).length;

export function score(item, profile) {
  if (!profile) return 0;
  if (item.status === 'closed') return 0;
  const text = haystack(item);
  if (count(text, profile.exclude)) return 0;
  let s = Math.min(count(text, profile.strong), 3) * 18 + Math.min(count(text, profile.medium), 3) * 8;
  s += (profile.regions || {})[item.region] ?? 0;
  s += Math.max(0, ...(item.kinds || []).map(k => (profile.kinds || {})[k] ?? 0));
  if (item.deadline) s += 5;
  if (item.amount) s += 3;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function daysLeft(item, today = new Date()) {
  if (!item.deadline) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = item.deadline.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 864e5);
}

export function money(a) {
  if (!a || !a.max) return '';
  const sym = {EUR: '€', GBP: '£', USD: '$'}[a.currency] || a.currency + ' ';
  const v = a.max >= 1e6 ? (a.max / 1e6).toFixed(a.max % 1e6 ? 1 : 0) + 'm' : a.max >= 1e4 ? Math.round(a.max / 1e3) + 'k' : a.max.toLocaleString('en-GB');
  return sym + v;
}

// Calendar file for one or more deadlines (all-day events).
export function ics(items, now = new Date()) {
  const esc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Enrico Policardo//Opportunities//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items.filter(i => i.deadline)) {
    const d = it.deadline.replace(/-/g, '');
    const next = new Date(Date.UTC(...it.deadline.split('-').map((n, i) => i === 1 ? n - 1 : +n)) + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${it.id}@opportunities.enricopolicardo`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc('Deadline: ' + it.title)}`, `DESCRIPTION:${esc([it.source, it.url].filter(Boolean).join('\n'))}`, it.url ? `URL:${it.url}` : '',
      'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${esc('One week left: ' + it.title)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n') + '\r\n';
}
