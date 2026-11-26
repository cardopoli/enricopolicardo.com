"""Tests for the Opportunities collector. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/opportunities'))
import collect as c  # noqa: E402

TODAY = dt.date(2026, 11, 26)
NOW = '2026-11-26T07:23:00+00:00'

LISTING = """<html><head><title>Bandi</title></head><body>
<nav><a href="/grants/nav-grant-should-be-skipped">Grants for artists in the menu</a></nav>
<main>
 <a href="/bandi/contributi-festival-2027">Bando contributi per festival culturali 2027</a>
 <a href="/opportunities/photo-residency">Photography residency in the Alps - open call</a>
 <a href="/news/team">Our new team member joins the office</a>
 <a href="/grants">Grants</a>
 <a href="/bandi/contributi-festival-2027">Read more</a>
 <a href="https://elsewhere.example/grant">Offsite grant for artists programme</a>
 <a href="/privacy">Privacy policy and grant data</a>
 <a href="/files/bando.docx">Bando allegato modulo domanda 2027</a>
</main><footer><a href="/bandi/footer">Bando in the footer area</a></footer></body></html>"""

DETAIL_EN = """<html><head><meta property="og:description" content="A residency for lens-based artists working with landscape and archives, with a stipend and accommodation."></head>
<body><h1>Alpine photo residency</h1><p>We offer a stipend of up to £5,000 plus travel.</p>
<p>Deadline for applications: 15 January 2027, 17:00 GMT.</p><p>Results announced 1 March 2027.</p></body></html>"""

DETAIL_IT = """<html><body><h1>Bando cultura 2027</h1><p>Il contributo massimo è di € 200.000 per progetto.</p>
<p>Le domande devono essere presentate entro il 31/01/2027 alle ore 12:00.</p><p>Pubblicato il 01/11/2026.</p></body></html>"""

DETAIL_SL = """<html><body><h1>Javni razpis za kulturne projekte</h1><p>Skupna višina sredstev: 80.000 EUR.</p>
<p>Rok za oddajo vlog: 15. 2. 2027.</p></body></html>"""

DETAIL_CLOSED = """<html><body><h1>Prize</h1><p>Applications are now closed. Deadline was 1 October 2026.</p></body></html>"""
DETAIL_ROLLING = """<html><body><h1>Small grants</h1><p>We accept applications on a rolling basis. Grants of up to £10k.</p></body></html>"""

RSS = """<?xml version="1.0"?><rss><channel>
<item><title>Open call: photography commission 2027</title><link>https://feed.example/a</link><description>&lt;p&gt;Deadline 20 March 2027&lt;/p&gt;</description></item>
<item><title>Exhibition opening tonight</title><link>https://feed.example/b</link><description>Drinks and talks</description></item>
</channel></rss>"""


class Listing(unittest.TestCase):
    def test_keeps_real_calls_and_drops_menus_generic_offsite_and_files(self):
        got = c.listing_links(LISTING, 'https://site.example/bandi', {'name': 'S'})
        urls = [g['url'] for g in got]
        self.assertEqual(urls, ['https://site.example/bandi/contributi-festival-2027', 'https://site.example/opportunities/photo-residency'])

    def test_include_pattern_accepts_titles_without_keywords(self):
        html = '<a href="/opportunities/so-they-say">SO THEY SAY - SaveArtSpace bus shelters</a><a href="/about/so-they-say-team">SO THEY SAY team and people</a>'
        got = c.listing_links(html, 'https://site.example/opportunities', {'include': '/opportunities/'})
        self.assertEqual([g['title'] for g in got], ['SO THEY SAY - SaveArtSpace bus shelters'])

    def test_rss_filters_to_opportunities(self):
        got = c.rss_items(RSS, {})
        self.assertEqual([g['url'] for g in got], ['https://feed.example/a'])
        self.assertIn('Deadline 20 March 2027', got[0]['summary'])
        self.assertEqual(c.rss_items('not xml', {}), [])


class ListingRules(unittest.TestCase):
    def test_generic_link_text_takes_title_from_slug_then_page(self):
        html = '<a href="/it/contributi/linee-guida-per-i-festival-partecipativi-2027">SCOPRI IL BANDO</a><a href="/it/contributi/x">Scopri il bando</a>'
        got = c.listing_links(html, 'https://csp.example/it/contributi/', {})
        self.assertEqual(got, [{'title': 'Linee guida per i festival partecipativi 2027', 'url': 'https://csp.example/it/contributi/linee-guida-per-i-festival-partecipativi-2027', 'title_from_page': True}])
        d = c.details_from_html('<html><head><meta property="og:title" content="Festival partecipativi: il bando 2027 | Compagnia"></head><body><h1>x</h1></body></html>', 'u', TODAY)
        self.assertEqual(d['page_title'], 'Festival partecipativi: il bando 2027')

    def test_filters_on_the_same_page_categories_and_jobs_are_dropped(self):
        html = ('<a href="/news?f%5B0%5D=category%3A7">Residencies (28)</a>'
                '<a href="/opportunities/residencies">Residencies open calls</a>'
                '<a href="/opportunities/darkroom-residency-programme-2027">Darkroom residency programme 2027</a>'
                '<a href="/jobs/studio-programme-manager">Studio Programme Manager for the residency</a>'
                '<a href="/results-of-the-2026-prize">Results of the 2026 prize</a>')
        got = c.listing_links(html, 'https://agg.example/news', {'min_slug': 16, 'offsite': False})
        self.assertEqual([g['url'] for g in got], ['https://agg.example/opportunities/darkroom-residency-programme-2027'])

    def test_links_inside_forms_are_read(self):
        html = '<form><ul><li><a href="/grants/woodland-creation-planning-grant">Woodland Creation Planning Grant</a></li></ul></form>'
        self.assertEqual(len(c.listing_links(html, 'https://gov.example/grants', {'include': '/grants/[a-z0-9-]+$'})), 1)


class Enrichment(unittest.TestCase):
    def test_budget_is_shared_between_sites(self):
        class FakeNet:
            def __init__(self): self.calls = []
            def get(self, url, **kw):
                self.calls.append(url)
                return '<html><body><p>Deadline: 1 March 2027</p></body></html>', url, 'text/html'
        items = {}
        for host, n in (('big.example', 50), ('a.example', 2), ('b.example', 2)):
            for k in range(n):
                items[f'{host}{k}'] = {'id': f'{host}{k}', 'url': f'https://{host}/{k}', 'present': True, 'first_seen': NOW}
        net = FakeNet()
        done = c.enrich(net, items, TODAY, budget=10, per_host=25)
        self.assertEqual(done, 10)
        hosts = [u.split('/')[2] for u in net.calls]
        self.assertEqual(hosts.count('a.example'), 2)
        self.assertEqual(hosts.count('b.example'), 2)
        self.assertEqual(items['a.example0']['deadline'], '2027-03-01')


class Details(unittest.TestCase):
    def test_english_deadline_amount_summary(self):
        d = c.details_from_html(DETAIL_EN, 'https://x/a', TODAY)
        self.assertEqual(d['deadline'], '2027-01-15')
        self.assertEqual(d['amount'], {'max': 5000, 'currency': 'GBP', 'text': d['amount']['text']})
        self.assertIn('lens-based', d['summary'])
        self.assertIn('residency', d['kinds_text'])
        self.assertFalse(d['rolling'])

    def test_italian(self):
        d = c.details_from_html(DETAIL_IT, 'https://x/b', TODAY)
        self.assertEqual(d['deadline'], '2027-01-31')
        self.assertEqual(d['amount']['max'], 200000)
        self.assertEqual(d['amount']['currency'], 'EUR')

    def test_slovenian(self):
        d = c.details_from_html(DETAIL_SL, 'https://x/c', TODAY)
        self.assertEqual(d['deadline'], '2027-02-15')
        self.assertEqual(d['amount']['max'], 80000)

    def test_closed_and_rolling(self):
        closed = c.details_from_html(DETAIL_CLOSED, 'https://x/d', TODAY)
        self.assertTrue(closed['closed_notice'])
        self.assertEqual(c.status_of(closed, TODAY), 'closed')
        rolling = c.details_from_html(DETAIL_ROLLING, 'https://x/e', TODAY)
        self.assertTrue(rolling['rolling'])
        self.assertEqual(rolling['amount']['max'], 10000)
        self.assertEqual(c.status_of(rolling, TODAY), 'rolling')

    def test_deadline_prefers_the_next_future_date(self):
        d, _ = c.find_deadline('Deadline: 1 October 2026 (first round) and 1 March 2027 (second round)', TODAY)
        self.assertEqual(d, dt.date(2027, 3, 1))
        d, _ = c.find_deadline('Published 3 December 2026. No dates here for applying.', TODAY)
        self.assertIsNone(d)

    def test_dates_in_many_forms(self):
        found = [d.isoformat() for _, d in c.find_dates('2027-02-01, 3.4.2027, 5 maggio 2027, June 6th, 2027, 7. julija 2027, 31/02/2027')]
        self.assertEqual(found, ['2027-02-01', '2027-04-03', '2027-05-05', '2027-06-06', '2027-07-07'])

    def test_amounts(self):
        self.assertEqual(c.find_amount('Up to €2.5m available')['max'], 2_500_000)
        self.assertEqual(c.find_amount('fino a 15.000 euro')['max'], 15000)
        self.assertEqual(c.find_amount('Entry fee £25 per image'), None)
        self.assertEqual(c.find_amount('no money here'), None)

    def test_classify(self):
        self.assertEqual(c.classify('Artist residency in Ljubljana'), ['residency'])
        self.assertIn('prize', c.classify('Photography award 2027'))
        self.assertEqual(c.classify('Bando contributi cultura'), ['grant'])
        self.assertEqual(c.classify('Something unrelated'), ['other'])


class Merging(unittest.TestCase):
    def setUp(self):
        self.src_a = {'name': 'A', 'url': 'https://a.example/calls', 'kind': 'html', 'region': 'UK'}
        self.src_b = {'name': 'B', 'url': 'https://b.example/calls', 'kind': 'html', 'region': 'EU'}

    def test_new_leads_and_health(self):
        items, health = c.merge({}, [(self.src_a, [{'title': 'Open call photography 2027', 'url': 'https://a.example/1'}], None), (self.src_b, [], 'HTTP 403')], TODAY, NOW)
        self.assertEqual(len(items), 1)
        it = next(iter(items.values()))
        self.assertEqual((it['region'], it['first_seen'], it['present']), ('UK', NOW, True))
        self.assertEqual([(h['name'], h['status'], h['new']) for h in health], [('A', 'ok', 1), ('B', 'error', 0)])

    def test_failed_source_keeps_old_leads_and_gone_leads_are_marked(self):
        first, _ = c.merge({}, [(self.src_a, [{'title': 'Grant one for artists', 'url': 'https://a.example/1'}, {'title': 'Grant two for artists', 'url': 'https://a.example/2'}], None)], TODAY, NOW)
        prev = {'items': list(first.values())}
        again, _ = c.merge(prev, [(self.src_a, [], 'HTTP 500')], TODAY, NOW)
        self.assertTrue(all(i['present'] for i in again.values()))
        later, _ = c.merge(prev, [(self.src_a, [{'title': 'Grant one for artists', 'url': 'https://a.example/1'}], None)], TODAY, NOW)
        self.assertEqual(sorted(i['present'] for i in later.values()), [False, True])

    def test_finalise_merges_twins_and_drops_stale(self):
        items = {
            'x': {'id': 'x', 'title': 'Open Call: Darkroom Residencies 2027', 'url': 'https://a/1', 'source': 'A', 'first_seen': '2026-11-01T00:00:00+00:00', 'last_seen': NOW, 'present': True},
            'y': {'id': 'y', 'title': 'Darkroom residencies 2027', 'url': 'https://b/1', 'source': 'B', 'first_seen': '2026-11-05T00:00:00+00:00', 'last_seen': NOW, 'present': True, 'deadline': '2027-01-10'},
            'old': {'id': 'old', 'title': 'Gone grant from long ago', 'url': 'https://a/2', 'source': 'A', 'first_seen': '2026-05-01T00:00:00+00:00', 'last_seen': '2026-07-01T00:00:00+00:00', 'present': False},
            'past': {'id': 'past', 'title': 'Prize that closed in summer', 'url': 'https://a/3', 'source': 'A', 'first_seen': '2026-05-01T00:00:00+00:00', 'last_seen': NOW, 'present': True, 'deadline': '2026-08-01'},
            'recent': {'id': 'recent', 'title': 'Prize that closed last week', 'url': 'https://a/4', 'source': 'A', 'first_seen': '2026-05-01T00:00:00+00:00', 'last_seen': NOW, 'present': True, 'deadline': '2026-11-19'},
        }
        out = c.finalise(items, TODAY)
        ids = [i['id'] for i in out]
        self.assertEqual(sorted(ids), ['recent', 'x'])
        twin = next(i for i in out if i['id'] == 'x')
        self.assertEqual(twin['also_on'], [{'source': 'B', 'url': 'https://b/1'}])
        self.assertEqual(twin['deadline'], '2027-01-10')
        self.assertEqual(twin['kinds'], ['open_call', 'residency'])
        self.assertEqual(next(i for i in out if i['id'] == 'recent')['status'], 'closed')

    def test_needs_details(self):
        self.assertTrue(c.needs_details({'present': True}, TODAY))
        self.assertFalse(c.needs_details({'present': True, 'detail_checked': '2026-11-20'}, TODAY))
        self.assertTrue(c.needs_details({'present': True, 'detail_checked': '2026-11-01'}, TODAY))
        self.assertFalse(c.needs_details({'present': False}, TODAY))
        self.assertFalse(c.needs_details({'present': True, 'status': 'closed'}, TODAY))


class Robustness(unittest.TestCase):
    def test_accented_urls_are_encoded(self):
        self.assertEqual(c.safe_url('https://x.it/bandi/attività 2027?a=è'), 'https://x.it/bandi/attivit%C3%A0%202027?a=%C3%A8')

    def test_old_years_without_deadline_count_as_closed(self):
        self.assertEqual(c.status_of({'title': 'Bando Officine Cultura 2025'}, TODAY), 'closed')
        self.assertEqual(c.status_of({'title': 'Residency 2026-2027'}, TODAY), 'unknown')
        self.assertEqual(c.status_of({'title': 'Bando 2025', 'deadline': '2027-01-01'}, TODAY), 'open')

    def test_http_and_https_twins_merge(self):
        html = '<a href="http://x.example/files/bando-cultura-2027.pdf">Bando cultura 2027 contributi</a><a href="https://x.example/files/bando-cultura-2027.pdf">Bando cultura 2027 contributi</a>'
        self.assertEqual(len(c.listing_links(html, 'https://x.example/bandi', {})), 1)

    def test_procurement_and_news_are_noise(self):
        html = '<a href="/a/servizio-di-gestione-piattaforma-2027">Servizio di gestione e manutenzione della piattaforma bando</a><a href="/latest-news/grant-2025">Overview of our grant funding in 2025</a>'
        self.assertEqual(c.listing_links(html, 'https://x.example/bandi', {}), [])


class EU(unittest.TestCase):
    def test_budget_prefers_per_project_maximum(self):
        raw = json.dumps({'budgetTopicActionMap': {'1': [{'budgetYearMap': {'2027': 5000000}, 'maxContribution': 200000, 'minContribution': 50000}]}})
        self.assertEqual(c.sedia_budget(raw), {'max': 200000, 'currency': 'EUR', 'text': 'EU maximum per project'})
        raw = json.dumps({'budgetTopicActionMap': {'1': [{'budgetYearMap': {'2027': 5000000}}]}})
        self.assertEqual(c.sedia_budget(raw)['max'], 5_000_000)
        self.assertIsNone(c.sedia_budget('not json'))
        self.assertIsNone(c.sedia_budget(''))


class Sources(unittest.TestCase):
    def test_sources_file_is_valid(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'scripts/opportunities/sources.json').read_text())
        names = set()
        for s in data['sources']:
            self.assertIn(s['kind'], ('html', 'rss', 'sedia', 'manual'))
            self.assertTrue(s['url'].startswith('https://'), s['url'])
            self.assertNotIn(s['name'], names)
            names.add(s['name'])
        self.assertGreaterEqual(len(data['sources']), 55)
        self.assertGreaterEqual(sum(1 for s in data['sources'] if s['kind'] != 'manual'), 25)


if __name__ == '__main__':
    unittest.main()


import digest as dg  # noqa: E402


class Digest(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        self.fx = json.loads((root / 'tests/fixtures/opps-score.json').read_text())
        self.profiles = json.loads((root / 'data/opportunity-profiles.json').read_text())['profiles']

    def test_scores_match_the_page(self):
        for p in self.profiles:
            for it in self.fx['items']:
                self.assertEqual(dg.score(it, p), self.fx['expected'][p['id']][it['id']], f"{p['id']}/{it['id']}")

    def test_sections(self):
        items = [dict(i, present=True, first_seen='2026-11-24T07:00:00+00:00' if i['id'] in 'ab' else '2026-10-01T07:00:00+00:00') for i in self.fx['items']]
        data = {'items': items, 'sources': [{'name': 'Broken site', 'status': 'error'}, {'name': 'Fine', 'status': 'ok'}], 'checked_at': NOW}
        d = dg.build(data, self.profiles, TODAY)
        practice, projects = d['sections']
        self.assertEqual([i['id'] for _, i in practice['new']], ['a'])
        self.assertEqual([i['id'] for _, i in practice['soon']], ['d'])
        self.assertEqual([i['id'] for _, i in projects['new']], ['b'])
        self.assertEqual([s['name'] for s in d['broken']], ['Broken site'])
        subject, text, html = dg.render(d, TODAY)
        self.assertEqual(subject, 'Opportunities - 2 new, 1 closing soon (w/c 26 Nov)')
        self.assertIn('Photography residency in Slovenia 2027', text)
        self.assertIn('closes 20 Dec (24 days)', text)
        self.assertIn('Broken site', html)
        self.assertNotIn('Prize that has closed', text)

    def test_no_secrets_means_no_send(self):
        import os
        for k in ('DIGEST_GMAIL_USER', 'DIGEST_GMAIL_APP_PASSWORD', 'DIGEST_TO'):
            os.environ.pop(k, None)
        self.assertFalse(dg.send('s', 't', '<p>h</p>'))

    def test_money(self):
        self.assertEqual(dg.money({'max': 200000, 'currency': 'EUR'}), '€200k')
        self.assertEqual(dg.money({'max': 2500000, 'currency': 'GBP'}), '£2.5m')
        self.assertEqual(dg.money({'max': 5000, 'currency': 'GBP'}), '£5,000')
        self.assertEqual(dg.money(None), '')
