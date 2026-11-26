"""Opportunities collector: checks public funding and open-call sources daily.

Reads scripts/opportunities/sources.json, writes data/opportunities.json.
Standard library only. Respects robots.txt, waits between requests to the same site,
and opens each new lead once to find its deadline, amount and summary.
Listings are leads, not verified calls: always check the funder's page.
"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import hashlib
import html as htmllib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import uuid
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / 'scripts/opportunities/sources.json'
OUTPUT = ROOT / 'data/opportunities.json'
AGENT = 'EnricoPolicardoOpportunities/2.0 (+https://cardopoli.github.io/enricopolicardo.com/tools/opportunities.html)'
MAX_DETAILS = 160          # detail pages opened per run
MAX_PER_HOST = 25          # detail pages per site per run
HOST_DELAY = 1.5           # seconds between requests to the same site
RECHECK_DAYS = 14          # re-read open leads this often (deadlines change)
KEEP_GONE_DAYS = 60        # keep leads no longer listed this long
KEEP_CLOSED_DAYS = 45      # keep closed calls this long after their deadline
MAX_ITEMS = 3000
DEBUG: dict[str, dict] = {}   # filled with --report: what each listing page looked like

OPP = re.compile(r"band[oi]\b|grant|open[\s-]?call|call for|calls? for (?:proposals|applications|artists|entries)|fund(?:ing|s)?\b|contribut|residen|rezidenc|award|prize|premi[oa]?\b|nagrad|finanziament|competition|concors|natečaj|razpis|commission|tender|appalt|fellowship|bursar|stipend|sovvenzion|sostegno|opportunit|programme for|application", re.I)
NOISE = re.compile(r"archivi|archive|closed calls|bandi chiusi|graduatori|esiti|results? of|winners? announced|privacy|cookie|log ?in|sign ?in|newsletter|contatt|contact us|faq|terms|accessibil|chi siamo|about us|careers|lavora con noi|job|vacanc", re.I)
GENERIC = re.compile(r"^(all |our |open |current |view all |see all |more |read more|find out more|scopri di più|leggi tutto|vedi tutti|tutti i bandi|apply now|apply|funding|grants?|funds|open calls|bandi|bandi (aperti|in corso)|progetti e bandi|opportunit(y|ies|à)|razpisi|javni razpisi)\.?$", re.I)

KINDS = [
    ('residency', re.compile(r'residen|rezidenc|retreat|artist[- ]in[- ]residence|air\b', re.I)),
    ('prize', re.compile(r'prize|award|premio|premi\b|nagrad|competition|concors|contest|natečaj', re.I)),
    ('fellowship', re.compile(r'fellowship|bursar|stipend|borsa di studio|štipendij|scholarship', re.I)),
    ('commission', re.compile(r'commission|incaric|naroč', re.I)),
    ('tender', re.compile(r'tender|appalt|gara\b|procurement|javno naročilo', re.I)),
    ('open_call', re.compile(r'open[\s-]?call|call for (artists|entries|submissions|works)|exhibition|mostra|razstav|submission', re.I)),
    ('training', re.compile(r'training|workshop|course|corso|formazion|izobraževanj|masterclass|mentoring', re.I)),
    ('grant', re.compile(r'grant|fund|band[oi]|contribut|finanziament|sovvenzion|razpis|sostegno|support', re.I)),
]

MONTHS = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6, 'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'dicembre': 12,
    'januar': 1, 'februar': 2, 'marec': 3, 'maj': 5, 'junij': 6, 'julij': 7, 'avgust': 8, 'oktober': 10,
    'januarja': 1, 'februarja': 2, 'marca': 3, 'aprila': 4, 'maja': 5, 'junija': 6, 'julija': 7, 'avgusta': 8, 'septembra': 9, 'oktobra': 10, 'novembra': 11, 'decembra': 12,
}
MONTH_RE = '|'.join(sorted(MONTHS, key=len, reverse=True))
DATE_PATTERNS = [
    (re.compile(r'\b(20\d\d)-(\d{1,2})-(\d{1,2})\b'), 'ymd'),
    (re.compile(r'\b(\d{1,2})(?:[./-]|\.\s)(\d{1,2})(?:[./-]|\.\s)(20\d\d)\b'), 'dmy'),
    (re.compile(r'\b(\d{1,2})(?:st|nd|rd|th|°|º)?\.?\s+(' + MONTH_RE + r')\.?,?\s+(20\d\d)\b', re.I), 'd_month_y'),
    (re.compile(r'\b(' + MONTH_RE + r')\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b', re.I), 'month_d_y'),
]
DEADLINE_WORDS = re.compile(r"deadline|closing date|closes|close[sd]? on|apply by|submission[s]? (?:deadline|by|until|close)|applications? (?:close|due|by|until)|due date|due by|until|entro (?:il|le ore)|scadenza|termine|chiusura|presentazione delle domande|fino al|rok za|rok oddaje|do vključno|zaključek", re.I)
ROLLING = re.compile(r"rolling (?:basis|deadline|programme|applications)|open all year|no deadline|ongoing (?:basis|programme)|apply at any time|sempre aperto|a sportello|senza scadenza|stalno odprt|odprt do porabe", re.I)
CLOSED = re.compile(r"applications? (?:are |is )?(?:now )?closed|this (?:call|opportunity|fund|programme) (?:is|has) (?:now )?closed|call closed|closed for applications|no longer accepting|bando (?:chiuso|scaduto)|termini scaduti|domande chiuse|razpis je zaprt|razpis je zaključen", re.I)
AMOUNT = re.compile(r"(?:(?P<pre>€|£|\$|EUR|GBP|USD)\s?(?P<n1>\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)(?:\s?(?P<k1>k|m|million|milioni?|mio)\b)?)|(?:(?P<n2>\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s?(?P<k2>k|m|million|milioni?|mio)?\s?(?P<post>€|£|EUR|GBP|euro|eur)\b)", re.I)
CURRENCY = {'€': 'EUR', 'eur': 'EUR', 'euro': 'EUR', '£': 'GBP', 'gbp': 'GBP', '$': 'USD', 'usd': 'USD'}


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def clean(s) -> str:
    return re.sub(r'\s+', ' ', htmllib.unescape(str(s or ''))).strip()


def norm_title(s: str) -> str:
    s = re.sub(r'[^\w\s]', ' ', clean(s).lower())
    s = re.sub(r'\b(20\d\d|open call|call for|the|a|an|il|la|lo|di|del|della|per|e|and|of|for)\b', ' ', s)
    return ' '.join(s.split()[:9])


def item_id(source_url: str, url: str) -> str:
    return hashlib.sha256((source_url + '|' + url).encode()).hexdigest()[:20]


class Page(HTMLParser):
    """Collects links (outside nav/header/footer) and visible text."""
    SKIP = {'nav', 'header', 'footer', 'script', 'style', 'noscript', 'aside', 'form', 'svg', 'template'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.text: list[str] = []
        self.meta: dict[str, str] = {}
        self.title = ''
        self._a = None
        self._skip = 0
        self._in_title = False
        self._ld: list[str] = []
        self._in_ld = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'script' and (a.get('type') or '').lower() == 'application/ld+json':
            self._in_ld = True; self._ld.append(''); return
        if tag in self.SKIP:
            self._skip += 1
        if tag == 'meta':
            k = (a.get('property') or a.get('name') or '').lower()
            if k in ('og:description', 'description', 'og:title', 'twitter:description') and a.get('content'):
                self.meta.setdefault(k, clean(a['content']))
        if tag == 'title':
            self._in_title = True
        if tag == 'a' and not self._skip:
            self._a = [a.get('href') or '', []]
        if tag in ('p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'div', 'tr', 'td', 'dt', 'dd'):
            self.text.append('\n')

    def handle_endtag(self, tag):
        if tag == 'script' and self._in_ld:
            self._in_ld = False; return
        if tag in self.SKIP:
            self._skip = max(0, self._skip - 1)
        if tag == 'title':
            self._in_title = False
        if tag == 'a' and self._a:
            self.links.append((self._a[0], clean(' '.join(self._a[1]))))
            self._a = None

    def handle_data(self, data):
        if self._in_ld:
            self._ld[-1] += data; return
        if self._in_title:
            self.title += data
        if self._a is not None:
            self._a[1].append(data)
        if not self._skip:
            self.text.append(data)

    def visible_text(self) -> str:
        t = ''.join(self.text)
        t = re.sub(r'[ \t ]+', ' ', t)
        return re.sub(r'\s*\n\s*', '\n', t).strip()

    def json_ld(self) -> list:
        out = []
        for raw in self._ld:
            try:
                out.append(json.loads(raw))
            except Exception:
                pass
        return out


def parse_page(html: str) -> Page:
    p = Page()
    try:
        p.feed(html)
    except Exception:
        pass
    return p


def listing_links(html: str, base: str, source: dict) -> list[dict]:
    """Opportunity links from a listing page."""
    page = parse_page(html)
    include = re.compile(source['include'], re.I) if source.get('include') else None
    exclude = re.compile(source['exclude'], re.I) if source.get('exclude') else None
    base_host = urllib.parse.urlsplit(base).hostname or ''
    found: dict[str, dict] = {}
    DEBUG[source.get('url', base)] = {'anchors': len(page.links), 'sample': [t for _, t in page.links if len(t) >= 10][:12], 'page_title': clean(page.title)[:80]}
    for href, title in page.links:
        if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
            continue
        url = urllib.parse.urljoin(base, href)
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ('http', 'https'):
            continue
        if not source.get('offsite') and (parts.hostname or '').removeprefix('www.') != base_host.removeprefix('www.'):
            continue
        url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ''))
        if url.rstrip('/') == base.rstrip('/'):
            continue
        if exclude and exclude.search(url):
            continue
        title = clean(title)
        if len(title) < 10 or len(title) > 300 or GENERIC.match(title) or NOISE.search(title):
            continue
        if re.search(r'\.(jpe?g|png|gif|webp|zip|docx?|xlsx?)$', parts.path, re.I):
            continue
        if include:
            if not include.search(url):
                continue
        elif not OPP.search(title):
            continue
        found.setdefault(url, {'title': title[:300], 'url': url})
    return list(found.values())[:150]


def rss_items(xml_text: str, source: dict) -> list[dict]:
    out = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return out
    for node in root.iter():
        tag = node.tag.split('}')[-1]
        if tag not in ('item', 'entry'):
            continue
        def child(name):
            for c in node:
                if c.tag.split('}')[-1] == name:
                    return c
            return None
        t = child('title'); l = child('link'); d = child('description')
        if d is None:
            d = child('summary')
        title = clean(t.text if t is not None else '')
        link = (l.get('href') if l is not None and l.get('href') else (l.text if l is not None else '')) or ''
        desc = clean(re.sub(r'<[^>]+>', ' ', d.text or '')) if d is not None else ''
        if not title or not link.startswith('http'):
            continue
        if not OPP.search(title + ' ' + desc[:400]):
            continue
        out.append({'title': title[:300], 'url': link.strip(), 'summary': desc[:400]})
    return out[:150]


def to_date(y: int, m: int, d: int):
    try:
        return dt.date(y, m, d)
    except ValueError:
        return None


def find_dates(text: str) -> list[tuple[int, dt.date]]:
    """All dates in text with their positions."""
    out = []
    for rx, kind in DATE_PATTERNS:
        for m in rx.finditer(text):
            g = m.groups()
            if kind == 'ymd':
                d = to_date(int(g[0]), int(g[1]), int(g[2]))
            elif kind == 'dmy':
                d = to_date(int(g[2]), int(g[1]), int(g[0]))
            elif kind == 'd_month_y':
                d = to_date(int(g[2]), MONTHS[g[1].lower().rstrip('.')], int(g[0]))
            else:
                d = to_date(int(g[2]), MONTHS[g[0].lower().rstrip('.')], int(g[1]))
            if d:
                out.append((m.start(), d))
    return sorted(out)


def find_deadline(text: str, today: dt.date) -> tuple[dt.date | None, str]:
    """The date that follows a deadline word most closely. Prefers future dates."""
    best = None
    for m in DEADLINE_WORDS.finditer(text):
        window = text[m.start(): m.end() + 170]
        dates = [d for _, d in find_dates(window) if today - dt.timedelta(days=400) <= d <= today + dt.timedelta(days=900)]
        if not dates:
            continue
        future = [d for d in dates if d >= today]
        pick = min(future) if future else max(dates)
        snippet = clean(window)[:140]
        if best is None or (pick >= today and (best[0] < today or pick < best[0])):
            best = (pick, snippet)
    return best if best else (None, '')


def amount_value(m) -> tuple[float, str] | None:
    raw = m.group('n1') or m.group('n2') or ''
    mult = (m.group('k1') or m.group('k2') or '').lower()
    cur = CURRENCY.get((m.group('pre') or m.group('post') or '').lower())
    if not cur:
        return None
    s = raw.replace(' ', '')
    if re.fullmatch(r'\d{1,3}([.,]\d{3})+', s):
        s = re.sub(r'[.,]', '', s)
    else:
        s = s.replace(',', '.')
    try:
        v = float(s)
    except ValueError:
        return None
    if mult in ('k',):
        v *= 1000
    elif mult in ('m', 'million', 'milione', 'milioni', 'mio'):
        v *= 1_000_000
    if v < 50:
        return None
    return v, cur


def find_amount(text: str) -> dict | None:
    best = None
    for m in AMOUNT.finditer(text[:60000]):
        got = amount_value(m)
        if not got:
            continue
        v, cur = got
        if best is None or v > best['max']:
            best = {'max': round(v), 'currency': cur, 'text': clean(text[max(0, m.start() - 50): m.end() + 30])[:120]}
    return best


def classify(text: str) -> list[str]:
    kinds = [k for k, rx in KINDS if rx.search(text)]
    if 'grant' in kinds and len(kinds) > 1 and not re.search(r'grant|bando|contribut|finanziament|razpis', text, re.I):
        kinds.remove('grant')
    return kinds[:3] or ['other']


def details_from_html(html: str, url: str, today: dt.date) -> dict:
    page = parse_page(html)
    text = page.visible_text()
    summary = page.meta.get('og:description') or page.meta.get('description') or page.meta.get('twitter:description') or ''
    if len(summary) < 60:
        paras = [p for p in text.split('\n') if 80 <= len(p) <= 800]
        if paras:
            summary = paras[0]
    deadline, snippet = find_deadline(text, today)
    for node in page.json_ld():
        for n in (node if isinstance(node, list) else node.get('@graph', [node]) if isinstance(node, dict) else []):
            if isinstance(n, dict) and not deadline:
                for k in ('validThrough', 'applicationDeadline', 'endDate'):
                    v = n.get(k)
                    if isinstance(v, str) and re.match(r'20\d\d-\d\d-\d\d', v):
                        deadline = to_date(*map(int, v[:10].split('-'))); snippet = f'{k}: {v[:10]}'
    head = text[:20000]
    return {
        'summary': clean(summary)[:400],
        'deadline': deadline.isoformat() if deadline else None,
        'deadline_text': snippet,
        'rolling': bool(ROLLING.search(head)) and not deadline,
        'closed_notice': bool(CLOSED.search(head)),
        'amount': find_amount(text),
        'kinds_text': classify(clean(page.meta.get('og:title') or page.title) + ' ' + summary + ' ' + head[:3000]),
        'detail_checked': today.isoformat(),
    }


# ---------- network ----------

class Net:
    def __init__(self, agent=AGENT, delay=HOST_DELAY):
        self.agent = agent; self.delay = delay
        self.robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self.last: dict[str, float] = {}

    def _wait(self, host):
        gap = time.monotonic() - self.last.get(host, 0)
        if gap < self.delay:
            time.sleep(self.delay - gap)
        self.last[host] = time.monotonic()

    def allowed(self, url) -> bool:
        """robots.txt: missing (4xx) allows all, server error (5xx) blocks, unreachable allows (the page fetch will fail anyway)."""
        p = urllib.parse.urlsplit(url)
        key = p.scheme + '://' + p.netloc
        if key not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                req = urllib.request.Request(key + '/robots.txt', headers={'User-Agent': self.agent})
                with urllib.request.urlopen(req, timeout=12) as r:
                    rp.parse(r.read(300_000).decode('utf-8', 'replace').splitlines())
                self.robots[key] = rp
            except urllib.error.HTTPError as e:
                if e.code >= 500:
                    rp.disallow_all = True
                    self.robots[key] = rp
                else:
                    self.robots[key] = None
            except Exception:
                self.robots[key] = None
        rp = self.robots[key]
        return True if rp is None else rp.can_fetch(self.agent, url)

    def get(self, url, accept='text/html,application/xhtml+xml', data=None, headers=None, check_robots=True, limit=4_000_000):
        if check_robots and not self.allowed(url):
            raise PermissionError('robots.txt disallows automated checks')
        host = urllib.parse.urlsplit(url).netloc
        self._wait(host)
        h = {'User-Agent': self.agent, 'Accept': accept, 'Accept-Language': 'en,it;q=0.8,sl;q=0.6'}
        h.update(headers or {})
        req = urllib.request.Request(url, data=data, headers=h)
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(limit)
            charset = r.headers.get_content_charset() or 'utf-8'
            return body.decode(charset, 'replace'), r.geturl(), r.headers.get('Content-Type', '')


def sedia_budget(raw: str) -> dict | None:
    """Per-project maximum if the EU states one, else the topic budget."""
    try:
        bo = json.loads(raw or '{}')
    except Exception:
        return None
    per_grant, totals = [], []
    for actions in (bo.get('budgetTopicActionMap') or {}).values():
        for a in actions or []:
            for k in ('maxContribution', 'minContribution'):
                try:
                    if a.get(k):
                        per_grant.append(float(a[k]))
                except (TypeError, ValueError):
                    pass
            try:
                totals.append(sum(float(v) for v in (a.get('budgetYearMap') or {}).values()))
            except (TypeError, ValueError):
                pass
    if per_grant:
        return {'max': round(max(per_grant)), 'currency': 'EUR', 'text': 'EU maximum per project'}
    if totals and max(totals) > 0:
        return {'max': round(max(totals)), 'currency': 'EUR', 'text': 'EU budget for the whole topic'}
    return None


def sedia_items(net: Net, source: dict, today: dt.date) -> list[dict]:
    """EU Funding & Tenders Portal search API (public, no key)."""
    query = {'bool': {'must': [{'terms': {'type': ['1', '2', '8']}}, {'terms': {'status': ['31094501', '31094502']}}]}}
    found: dict[str, dict] = {}
    for q in source.get('queries', ['culture']):
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in (('query', query), ('languages', ['en']), ('sort', {'field': 'sortStatus', 'order': 'ASC'})):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="blob"\r\nContent-Type: application/json\r\n\r\n{json.dumps(value)}\r\n')
        body = (''.join(parts) + f'--{boundary}--\r\n').encode()
        url = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?' + urllib.parse.urlencode({'apiKey': 'SEDIA', 'text': q, 'pageSize': 50, 'pageNumber': 1})
        text, _, _ = net.get(url, accept='application/json', data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}, check_robots=False)
        for r in json.loads(text).get('results', []):
            md = r.get('metadata') or {}
            first = lambda k: (md.get(k) or [''])[0]
            ident = first('identifier') or first('callIdentifier')
            title = clean(first('title') or r.get('summary') or r.get('content') or '')
            if not ident or not title:
                continue
            dl = first('deadlineDate')[:10]
            budget = sedia_budget(first('budgetOverview'))
            programme = clean(first('frameworkProgramme') or first('programmePeriod') or '')
            found.setdefault(ident, {
                'title': f'{title} ({ident})'[:300],
                'url': f'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/{urllib.parse.quote(ident.lower())}',
                'summary': clean(re.sub(r'<[^>]+>', ' ', first('descriptionByte') or r.get('summary') or ''))[:400],
                'deadline': dl if re.match(r'20\d\d-\d\d-\d\d', dl) else None,
                'deadline_text': f'EU portal deadline {dl}' if dl else '',
                'amount': budget,
                'kinds_text': ['grant'],
                'detail_checked': today.isoformat(),
                'programme': programme,
            })
    return list(found.values())


def collect_source(net: Net, source: dict, today: dt.date):
    try:
        if source['kind'] == 'sedia':
            return source, sedia_items(net, source, today), None
        text, final, ctype = net.get(source['url'], accept='application/rss+xml,application/xml,text/xml,text/html' if source['kind'] == 'rss' else 'text/html,application/xhtml+xml')
        if re.search(r'verify you are human|just a moment\.\.\.|checking your browser|cf-browser-verification|captcha', text[:20000], re.I):
            raise RuntimeError('site asks for a browser check')
        if source['kind'] == 'rss':
            return source, rss_items(text, source), None
        if 'html' not in ctype and '<html' not in text[:2000].lower():
            raise RuntimeError('not a web page')
        return source, listing_links(text, final, source), None
    except urllib.error.HTTPError as e:
        return source, [], f'HTTP {e.code}'
    except Exception as e:
        return source, [], (str(e) or e.__class__.__name__)[:160]


# ---------- merging ----------

def status_of(item: dict, today: dt.date) -> str:
    if item.get('closed_notice'):
        return 'closed'
    d = item.get('deadline')
    if d:
        return 'closed' if dt.date.fromisoformat(d) < today else 'open'
    return 'rolling' if item.get('rolling') else 'unknown'


def merge(previous: dict, results: list, today: dt.date, now_iso: str) -> tuple[dict, list[dict]]:
    """Fold today's results into the stored leads. Returns (items by id, source health)."""
    items = {i['id']: dict(i) for i in previous.get('items', [])}
    old_sources = {s['url']: s for s in previous.get('sources', [])}
    health = []
    for source, links, error in results:
        old = old_sources.get(source['url'], {})
        h = {k: source.get(k) for k in ('name', 'url', 'kind', 'region')}
        h.update(checked_at=now_iso, status='error' if error else 'ok', error=error, last_success=now_iso if not error else old.get('last_success'), listings=len(links), new=0)
        if error:
            health.append(h); continue
        seen = set()
        for link in links:
            key = item_id(source['url'], link['url'])
            seen.add(key)
            prev = items.get(key)
            base = prev or {'id': key, 'first_seen': now_iso, 'source': source['name'], 'source_url': source['url'], 'region': source.get('region', ''), 'lang': source.get('lang', '')}
            if not prev:
                h['new'] += 1
            merged = {**base, **{k: v for k, v in link.items() if v not in (None, '')}, 'last_seen': now_iso, 'present': True}
            items[key] = merged
        for key, it in items.items():
            if it.get('source_url') == source['url'] and key not in seen:
                it['present'] = False
        health.append(h)
    return items, health


def finalise(items: dict, today: dt.date) -> list[dict]:
    out = []
    by_title: dict[str, dict] = {}
    for it in sorted(items.values(), key=lambda i: i.get('first_seen', '')):
        it['kinds'] = sorted(set(classify(it.get('title', '') + ' ' + it.get('summary', '')) + [k for k in it.get('kinds_text', []) if k != 'other'])) or ['other']
        if len(it['kinds']) > 1 and 'other' in it['kinds']:
            it['kinds'].remove('other')
        it['status'] = status_of(it, today)
        last_seen = dt.date.fromisoformat(it.get('last_seen', today.isoformat())[:10])
        if not it.get('present', True) and (today - last_seen).days > KEEP_GONE_DAYS:
            continue
        if it.get('deadline') and (today - dt.date.fromisoformat(it['deadline'])).days > KEEP_CLOSED_DAYS:
            continue
        nt = norm_title(it.get('title', ''))
        twin = by_title.get(nt) if len(nt) > 12 else None
        if twin and twin['source'] != it['source']:
            also = twin.setdefault('also_on', [])
            if not any(a['url'] == it['url'] for a in also):
                also.append({'source': it['source'], 'url': it['url']})
            for k in ('deadline', 'deadline_text', 'amount', 'summary'):
                if not twin.get(k) and it.get(k):
                    twin[k] = it[k]
            continue
        if len(nt) > 12:
            by_title[nt] = it
        out.append(it)
    out.sort(key=lambda i: i.get('first_seen', ''), reverse=True)
    return out[:MAX_ITEMS]


def needs_details(it: dict, today: dt.date) -> bool:
    if not it.get('present', True) or it.get('status') == 'closed':
        return False
    checked = it.get('detail_checked')
    return not checked or (today - dt.date.fromisoformat(checked)).days >= RECHECK_DAYS


def enrich(net: Net, items: dict, today: dt.date, budget=MAX_DETAILS, per_host=MAX_PER_HOST) -> int:
    todo = [i for i in items.values() if needs_details(i, today)]
    todo = sorted(todo, key=lambda i: (bool(i.get('detail_checked')), i.get('first_seen', '')))[:budget]  # never-read leads first
    hosts: dict[str, list] = {}
    for it in todo:
        hosts.setdefault(urllib.parse.urlsplit(it['url']).netloc, []).append(it)
    done = 0

    def run(batch):
        n = 0
        for it in batch[:per_host]:
            try:
                html, _, ctype = net.get(it['url'])
                if 'html' in ctype or '<html' in html[:2000].lower():
                    it.update(details_from_html(html, it['url'], today))
                else:
                    it['detail_checked'] = today.isoformat()
                n += 1
            except Exception as e:
                it['detail_checked'] = today.isoformat(); it['detail_error'] = (str(e) or e.__class__.__name__)[:120]
        return n

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for n in pool.map(run, hosts.values()):
            done += n
    return done


def report(final: list, health: list):
    """Diagnostics for tuning sources (printed in the job log)."""
    errs: dict[str, int] = {}
    for i in final:
        if i.get('detail_error'):
            errs[i['detail_error'][:60]] = errs.get(i['detail_error'][:60], 0) + 1
    print('\nDetail errors:', sorted(errs.items(), key=lambda x: -x[1])[:10])
    for h in health:
        mine = [i for i in final if i.get('source') == h['name']]
        with_dl = sum(1 for i in mine if i.get('deadline'))
        read = sum(1 for i in mine if i.get('detail_checked') and not i.get('detail_error'))
        print(f"\n## {h['name']} [{h['status']}] listings={h['listings']} read={read} deadlines={with_dl}")
        dbg = DEBUG.get(h['url'])
        if dbg and not h['listings']:
            print(f"   page '{dbg['page_title']}' anchors={dbg['anchors']} sample={dbg['sample']}")
        for i in mine[:4]:
            print(f"   - {i['title'][:90]} | {i.get('deadline') or '-'} | {i['url'][:90]}")


def main(argv=None):
    argv = argv or sys.argv[1:]
    today = now_utc().date()
    now_iso = now_utc().isoformat(timespec='seconds')
    sources = [s for s in json.loads(SOURCES.read_text())['sources'] if s['kind'] != 'manual']
    only = [a for a in argv if not a.startswith('-')]
    if only:
        sources = [s for s in sources if any(o.lower() in s['name'].lower() for o in only)]
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    net = Net()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda s: collect_source(net, s, today), sources))
    items, health = merge(previous, results, today, now_iso)
    if only:
        keep_urls = {s['url'] for s in sources}
        health += [s for s in previous.get('sources', []) if s['url'] not in keep_urls]
    for it in items.values():
        it['status'] = status_of(it, today)
    opened = 0 if '--no-details' in argv else enrich(net, items, today)
    final = finalise(items, today)
    ok = sum(1 for h in health if h['status'] == 'ok')
    out = {'schema': 2, 'checked_at': now_iso, 'sources_ok': ok, 'sources_total': len(health), 'details_opened': opened, 'sources': sorted(health, key=lambda h: (h['status'] != 'error', h['name'])), 'items': final}
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    counts = {}
    for i in final:
        counts[i['status']] = counts.get(i['status'], 0) + 1
    print(f'{ok}/{len(health)} sources answered; {len(final)} leads ({counts}); {opened} detail pages read')
    if '--report' in argv:
        report(final, health)
    for h in health:
        print(f"  {'OK ' if h['status'] == 'ok' else 'ERR'} {h['listings']:4} new {h['new']:3}  {h['name']}" + (f"  - {h['error']}" if h['error'] else ''))
    if not ok:
        raise SystemExit('No source answered; previous leads kept.')


if __name__ == '__main__':
    main()
