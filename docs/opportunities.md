# Opportunities

Page: `tools/opportunities.html` · Data: `data/opportunities.json` · Profiles: `data/opportunity-profiles.json` · Sources: `scripts/opportunities/sources.json`

## How it works

- **Every morning (07:23 UTC)** `.github/workflows/opportunities.yml` runs `scripts/opportunities/collect.py`:
  - asks the EU Funding & Tenders Portal's public search API for open and forthcoming calls (culture, heritage, creative, rural, community…), with deadlines and budgets;
  - reads the listing pages in `sources.json` (artist-call sites, residencies, UK/IE/IT/SI funders, foundations), respecting `robots.txt` and pausing between requests to the same site;
  - opens each new lead once (up to 300 a day, shared fairly between sites) to find its deadline, amount, summary and real title; re-reads open leads every 14 days;
  - merges duplicates, closes expired calls, keeps leads that vanish for 60 days, then commits the data and redeploys the site.
- **Every Monday (07:41 UTC)** `.github/workflows/opportunities-digest.yml` emails a summary: new matches for each profile, anything closing within 30 days, sources not answering.
- **Matching** is keyword counting, no AI: strong words 18 points each (max 3), medium 8 (max 3), plus region and type weights, +5 for a known deadline, +3 for a known amount; any excluded word scores 0. `assets/js/opps/score.mjs` (page) and `digest.py` (email) use the same rules; `tests/fixtures/opps-score.json` keeps them in step.
- **Your pipeline** (Shortlist → Preparing → Submitted → Result, with notes) lives in your browser and can sync privately to Dropbox (`Apps/<your app>/opportunities/pipeline.json`) using the same Dropbox app as Cookbook.

## Set up the weekly email (once, about five minutes)

1. Your Google account needs **2-Step Verification** on: myaccount.google.com → Security.
2. Create an **app password**: myaccount.google.com/apppasswords → name it *Opportunities* → copy the 16 characters.
3. In GitHub: the repo → **Settings → Secrets and variables → Actions → New repository secret**, three times:
   - `DIGEST_GMAIL_USER` – the Gmail address that sends
   - `DIGEST_GMAIL_APP_PASSWORD` – the 16 characters
   - `DIGEST_TO` – where to send it (can be the same address)
4. Test it: **Actions → Opportunities - weekly email → Run workflow**.

Changing your Google password cancels app passwords: make a new one and update the secret. Without the secrets the job just prints the digest in its log.

## Add or fix a source

Copy a line in `sources.json`. `kind`: `html` (a listing page), `rss`, `sedia` (EU portal), or `manual` (shown on the page to check by hand: use it for sites that block automated checks). Optional: `include` (regex the link must match), `exclude`, `min_slug` (skip short category links on aggregators), `offsite` (allow links to other sites). Run `python3 scripts/opportunities/collect.py --report "Source name"` to see what a source returns.

## Tests

`python3 -m unittest discover -s tests -p 'test_*.py'` and `node --test tests/*.test.mjs`.
