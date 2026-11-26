"""Weekly Opportunities email.

Builds a digest from data/opportunities.json and data/opportunity-profiles.json and
sends it through Gmail (SMTP with an app password). Needs three repository secrets:
  DIGEST_GMAIL_USER          the Gmail address that sends (e.g. you@gmail.com)
  DIGEST_GMAIL_APP_PASSWORD  a Gmail app password (16 characters, needs 2-Step Verification)
  DIGEST_TO                  where to send it (can be the same address)
Without them it prints the digest and exits cleanly.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/opportunities.json'
PROFILES = ROOT / 'data/opportunity-profiles.json'
PAGE = 'https://cardopoli.github.io/enricopolicardo.com/tools/opportunities.html'
NEW_DAYS = 7
SOON_DAYS = 30
PER_PROFILE = 12
MIN_SCORE = 30


def haystack(item: dict) -> str:
    return ' '.join(str(x) for x in (item.get('title'), item.get('summary'), item.get('source'), item.get('programme'), ' '.join(item.get('kinds') or [])) if x).lower()


def score(item: dict, profile: dict) -> int:
    """Same rules as assets/js/opps/score.mjs."""
    if item.get('status') == 'closed':
        return 0
    text = haystack(item)
    hits = lambda words: sum(1 for w in words or [] if w and str(w).lower() in text)
    if hits(profile.get('exclude')):
        return 0
    s = min(hits(profile.get('strong')), 3) * 18 + min(hits(profile.get('medium')), 3) * 8
    s += (profile.get('regions') or {}).get(item.get('region'), 0)
    s += max([0] + [(profile.get('kinds') or {}).get(k, 0) for k in item.get('kinds') or []])
    if item.get('deadline'):
        s += 5
    if item.get('amount'):
        s += 3
    return max(0, min(100, round(s)))


def days_left(item: dict, today: dt.date):
    return (dt.date.fromisoformat(item['deadline']) - today).days if item.get('deadline') else None


def money(a) -> str:
    if not a or not a.get('max'):
        return ''
    sym = {'EUR': '€', 'GBP': '£', 'USD': '$'}.get(a.get('currency'), (a.get('currency') or '') + ' ')
    v = a['max']
    return sym + (f'{v / 1e6:.1f}m'.replace('.0m', 'm') if v >= 1e6 else f'{round(v / 1e3)}k' if v >= 1e4 else f'{v:,}')


def build(data: dict, profiles: list, today: dt.date) -> dict:
    items = [i for i in data.get('items', []) if i.get('present', True) and i.get('status') != 'closed']
    since = (today - dt.timedelta(days=NEW_DAYS)).isoformat()
    sections = []
    for p in profiles:
        scored = [(score(i, p), i) for i in items]
        new = sorted([(s, i) for s, i in scored if s >= MIN_SCORE and i.get('first_seen', '')[:10] >= since], key=lambda x: (-x[0], x[1].get('deadline') or '9999'))[:PER_PROFILE]
        soon = sorted([(s, i) for s, i in scored if s >= MIN_SCORE and (days_left(i, today) is not None and 0 <= days_left(i, today) <= SOON_DAYS)], key=lambda x: x[1]['deadline'])[:PER_PROFILE]
        sections.append({'profile': p, 'new': new, 'soon': soon})
    broken = [s for s in data.get('sources', []) if s.get('status') == 'error']
    return {'sections': sections, 'broken': broken, 'total': len(items), 'checked_at': data.get('checked_at', '')}


def line(item: dict, s: int, today: dt.date) -> tuple[str, str]:
    d = days_left(item, today)
    when = f"closes {dt.date.fromisoformat(item['deadline']).strftime('%-d %b')} ({d} days)" if d is not None else ('rolling' if item.get('status') == 'rolling' else 'deadline not found')
    bits = [item.get('source', ''), when, money(item.get('amount'))]
    meta = ' · '.join(b for b in bits if b)
    text = f"- {item['title']}\n  {meta} · match {s}\n  {item['url']}"
    h = (f'<li style="margin:0 0 14px"><a href="{html.escape(item["url"])}" style="color:#111;font-weight:600;text-decoration:none">{html.escape(item["title"])}</a>'
         f'<br><span style="color:#666;font-size:13px">{html.escape(meta)} · match {s}</span></li>')
    return text, h


def render(d: dict, today: dt.date) -> tuple[str, str, str]:
    n_new = sum(len(s['new']) for s in d['sections'])
    n_soon = sum(len(s['soon']) for s in d['sections'])
    subject = f"Opportunities - {n_new} new, {n_soon} closing soon (w/c {today.strftime('%-d %b')})"
    txt = [f'Opportunities this week ({today.isoformat()})', f'{d["total"]} open leads tracked. Full list: {PAGE}', '']
    h = ['<div style="font:15px/1.5 Helvetica,Arial,sans-serif;color:#111;max-width:640px">',
         f'<h1 style="font-size:24px;margin:0 0 4px">Opportunities this week</h1><p style="color:#666;margin:0 0 20px">{d["total"]} open leads tracked · <a href="{PAGE}" style="color:#d88424">open the full list</a></p>']
    for sec in d['sections']:
        name = sec['profile']['name']
        txt.append(f'== {name} ==')
        h.append(f'<h2 style="font-size:19px;border-top:3px solid #111;padding-top:8px;margin:26px 0 8px">{html.escape(name)}</h2>')
        for label, rows in (('New this week', sec['new']), (f'Closing in the next {SOON_DAYS} days', sec['soon'])):
            txt.append(label + ':')
            h.append(f'<h3 style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#d88424;margin:14px 0 8px">{label}</h3>')
            if not rows:
                txt.append('  (nothing)'); h.append('<p style="color:#999;margin:0">Nothing this week.</p>'); continue
            h.append('<ul style="padding-left:18px;margin:0">')
            for s, i in rows:
                t, hh = line(i, s, today); txt.append(t); h.append(hh)
            h.append('</ul>')
        txt.append('')
    if d['broken']:
        names = ', '.join(s['name'] for s in d['broken'][:12])
        txt.append(f'Sources not answering ({len(d["broken"])}): {names}')
        h.append(f'<p style="color:#999;font-size:12px;margin-top:28px;border-top:1px solid #ddd;padding-top:10px">Sources not answering this week ({len(d["broken"])}): {html.escape(names)}</p>')
    txt.append('Listings are leads: check eligibility, deadlines and fees on the funder\'s page.')
    h.append('<p style="color:#999;font-size:12px">Listings are leads: check eligibility, deadlines and fees on the funder\'s page.</p></div>')
    return subject, '\n'.join(txt), ''.join(h)


def send(subject: str, text: str, html_body: str) -> bool:
    user, password, to = (os.environ.get(k, '').strip() for k in ('DIGEST_GMAIL_USER', 'DIGEST_GMAIL_APP_PASSWORD', 'DIGEST_TO'))
    if not (user and password and to):
        print('Email secrets not set; digest printed only.')
        return False
    msg = EmailMessage()
    msg['Subject'], msg['From'], msg['To'] = subject, f'Opportunities <{user}>', to
    msg.set_content(text)
    msg.add_alternative(html_body, subtype='html')
    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as smtp:
        smtp.login(user, password.replace(' ', ''))
        smtp.send_message(msg)
    print(f'Sent to {to}.')
    return True


def main():
    today = dt.datetime.now(dt.timezone.utc).date()
    data = json.loads(DATA.read_text())
    profiles = json.loads(PROFILES.read_text())['profiles']
    subject, text, html_body = render(build(data, profiles, today), today)
    print(subject + '\n\n' + text)
    send(subject, text, html_body)


if __name__ == '__main__':
    sys.exit(main())
