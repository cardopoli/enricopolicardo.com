"""Check the tracker's public source pages. New links are leads, not verified calls."""
import concurrent.futures
import datetime as dt
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import urllib.request
import urllib.parse
import urllib.robotparser

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/tender-updates.json'
AGENT = 'TenderTracker/1.0 (public creative opportunity monitor)'
KEYWORDS = re.compile(r'band[oi]|grant|open.call|fund|contribut|residen|award|premi|finanziament|cooperat|call.for|opportunit|contest|competit|concors|commission|tender|appalt|incaric|exhibit|mostr|fellow|bursar|research|fotograf|photograph|festival|training', re.I)

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.current = None; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('nav','header','footer','script','style'): self.skip += 1
        if tag == 'a' and not self.skip: self.current = [dict(attrs).get('href', ''), []]
    def handle_data(self, value):
        if self.current: self.current[1].append(value)
    def handle_endtag(self, tag):
        if tag in ('nav','header','footer','script','style'): self.skip = max(0,self.skip-1)
        if tag == 'a' and self.current:
            self.links.append((self.current[0], ' '.join(' '.join(self.current[1]).split())))
            self.current = None

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=20) as response:
        if 'text/html' not in response.headers.get('Content-Type', ''): raise ValueError('Not an HTML page')
        return response.read(3_000_000).decode(response.headers.get_content_charset() or 'utf-8', errors='replace'), response.url

def source_list(html):
    sources = []
    for block in html.split('<div class="source-card">')[1:]:
        name = re.search(r'class="source-name">([^<]+)', block)
        url = re.search(r'<a href="([^"]+)"', block)
        if name and url and not any(s['url']==url[1] for s in sources):
            sources.append({'name':name[1], 'url':url[1]})
    return sources

def check(source):
    try:
        parts = urllib.parse.urlsplit(source['url'])
        robots_url = urllib.parse.urlunsplit((parts.scheme,parts.netloc,'/robots.txt','',''))
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(robots_url,headers={'User-Agent':AGENT})
            with urllib.request.urlopen(req,timeout=10) as r: rp.parse(r.read(200_000).decode('utf-8',errors='replace').splitlines())
            if not rp.can_fetch(AGENT, source['url']): raise ValueError('Source disallows automated checks')
        except urllib.error.HTTPError as e:
            if e.code not in (404,410): raise
        html, final = fetch(source['url'])
        if re.search(r'verify you are human|just a moment|checking your browser',html,re.I): raise ValueError('Source requires browser verification')
        parser = Links(); parser.feed(html)
        found = {}
        for href, title in parser.links:
            url = urllib.parse.urljoin(final,href)
            parts = urllib.parse.urlsplit(url)
            if parts.scheme not in ('http','https') or parts.hostname != urllib.parse.urlsplit(final).hostname: continue
            url = urllib.parse.urlunsplit((parts.scheme,parts.netloc,parts.path,parts.query,''))
            if len(title)<12 or not KEYWORDS.search(title): continue
            if re.search(r'archivio|bandi.chiusi|graduator|bandi.di.concorso|bandi.gara|pubblica.amministrazione|sovvenzioni,.contributi|privacy|cookie',title,re.I): continue
            if re.fullmatch(r'(all |our |open |current )?(funding|grants|funds|open calls|bandi|bandi in corso|progetti e bandi|opportunit[aà])',title,re.I): continue
            if url.rstrip('/') == final.rstrip('/'): continue
            if title.lower() in ('privacy policy','terms and conditions'): continue
            found[url] = {'title':title[:300], 'url':url, 'source':source['name'], 'source_url':source['url']}
        return source, list(found.values())[:100], None
    except Exception as e:
        return source, [], str(e)[:200]

def main():
    html = (ROOT/'tools/tender_tool.html').read_text()
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    old_sources = {s['url']:s for s in previous.get('sources',[])}
    current_sources=source_list(html)
    valid_urls={s['url'] for s in current_sources}
    old_items = {i['id']:dict(i,present=i.get('present',True) and i['source_url'] in valid_urls) for i in previous.get('items',[])}
    items = dict(old_items); sources=[]; successes=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for source, links, error in pool.map(check, current_sources):
            old = old_sources.get(source['url'],{})
            result = dict(source, checked_at=now, status='error' if error else 'ok', error=error, last_success=old.get('last_success'))
            if not error:
                successes+=1; result['last_success']=now
                active=set()
                for link in links:
                    key=hashlib.sha256((source['url']+'|'+link['url']).encode()).hexdigest()[:20];active.add(key)
                    old=items.get(key,{})
                    items[key]=dict(link,id=key,first_seen=old.get('first_seen',now),last_seen=now,present=True)
                for key,item in items.items():
                    if item['source_url']==source['url'] and key not in active: item['present']=False
            result['listings']=len(links);sources.append(result)
    # Keep failures visible and previous leads available; never silently erase them.
    output={'schema':1,'checked_at':now,'successful_sources':successes,'sources':sources,'items':sorted(items.values(),key=lambda i:i['first_seen'],reverse=True)[:1500]}
    OUTPUT.parent.mkdir(exist_ok=True);OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(f'Checked {len(sources)} sources: {successes} successful; {len(items)} leads stored')
    if not successes: raise SystemExit('No source checks succeeded; previous listings preserved')

if __name__=='__main__': main()

