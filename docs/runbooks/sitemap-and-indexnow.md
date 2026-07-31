# Sitemap and IndexNow

How rockenhaus.net decides which URLs it publishes, and how it tells search
engines about them. Read this before changing anything that emits a page.

## The rule

**Neither list is maintained. Both are derived from the built artifact.**

```
Jekyll build ─┐
              ├─ merge ─> _site/ ─> build-sitemap.mjs ─> _site/sitemap.xml
Astro build ──┘                                              │
                                                             v
                                          build-indexnow.mjs ─> _data/indexnow.json
                                                             │
                                                             v
                                                   indexnow_ping.py
```

Every arrow points one way. A page that is not built cannot be listed, and a
page that is built cannot be forgotten. There is no list of URLs anywhere in the
repository that a person is expected to keep in step with reality.

## Why, in one paragraph each

**The sitemap ran too early.** `jekyll-sitemap` runs inside the Jekyll build,
which happens before the Astro output is merged in. It therefore could not see
`/answers/`, and never listed it: the live sitemap carried 367 entries and not
one of them was under the only content surface built to be quoted by an answer
engine. Running the generator after the merge is the whole fix; it sees the tree
that is actually uploaded.

**Every lastmod was a lie.** All 349 `<lastmod>` values on the live sitemap were
the identical string `2026-07-28T03:43:22+00:00`, because they came from file
mtimes in a fresh CI checkout. That tells a search engine the entire court
record changed at one instant, on every deploy. `lastmod` now comes from the
filing date in the record, so it is either true or absent: 111 of the 173
documents carry a filed date, and the other 62, mostly exhibits, get no
`lastmod` rather than a fabricated one.

**The submission list drifted from the site in both directions.** It came from a
hardcoded `STATIC_URLS` array in `scripts/generate_site.py`. It still named the
three pages deleted in PR #7, so every deploy re-submitted three deleted pages
to Bing for three weeks, and because the site answered 200 with the homepage for
every unknown path they looked alive from the outside. It also named
`/robots.txt` and `/sitemap.xml`, which are not content, and omitted all 173
filed PDFs, which are the record. Deriving it from the sitemap makes that class
of defect unreachable rather than fixed.

## What decides whether a page is listed

The page does, through the `robots` meta it already carries. Both halves of the
site emit one: Jekyll through `_includes/seo-extras.html`, Astro through
`BaseLayout.astro`. `noindex` keeps a page out of the sitemap; no directive at
all means indexable, which is the correct default.

That is why the 15 `/evidence/` pages are absent from the sitemap without being
named anywhere: they declare themselves `noindex`, which is the same declaration
that keeps them out of search results. One statement, one place, two effects.

Three other exclusions are explicit, and are printed in the build log with a
count and a reason:

| Reason | What it covers |
| --- | --- |
| `noindex` | The page asked not to be indexed. |
| `retired` | Listed in `_data/retired_urls.json`. |
| `not content` | `404.html`, which is a file the build emits and not a URL the site publishes. |

## Retiring a URL

Three files have to agree, and a test enforces that they do.

1. Add the path to `_data/retired_urls.json` with a reason and the PR that
   retired it.
2. Add a rule to `public/_redirects`. A retirement is `404`; a move is `301`.
3. Leave `_data/sitemap_baseline.txt` alone. The baseline is the history of what
   was published, not a list of what is current. Removing a line there hides the
   retirement instead of recording it.

`tests/sitemap.test.ts` fails if a retired path has no redirect rule, and also
if a `404` rule has no retired entry, so neither file can lead the other.

## The baseline gate

`_data/sitemap_baseline.txt` holds the 367 URLs the live site published on
2026-07-31. On every CI run and every deploy:

```
node scripts/build-sitemap.mjs _site --baseline _data/sitemap_baseline.txt
```

fails the build if any of those URLs is neither emitted by the build nor listed
as retired. `/documents/<slug>/` URLs are cited inside filed court documents, so
a page dropped by a template change is a broken citation in a court record. It
should stop the build, not wait to be discovered by somebody going looking for a
filing.

URLs the build publishes that are NOT in the baseline are reported but never
failed on: `/answers/` is exactly such an addition. They are printed because a
sitemap that silently grows is the same class of defect as one that silently
shrinks, and on a court record the additions are the half worth reading.

## What is proven where

This distinction matters more than the green tick, because the two halves of the
site are not verifiable in the same place.

| Claim | Proven by | Where |
| --- | --- | --- |
| `/answers/` reaches the sitemap; `/evidence/` does not | `tests/sitemap.test.ts` against the real `dist/` | Local and CI |
| `noindex` is read correctly out of minified single-line HTML | Same, reading the shipped evidence page | Local and CI |
| The submission list is exactly the sitemap | `tests/submission-urls.test.ts` | Local and CI |
| All 367 previously published URLs survive | `build-sitemap.mjs --baseline` over the merged `_site` | **CI only** |

The last row is CI only and cannot be otherwise: Jekyll owns 360 of the 367
URLs, and there is no Ruby on the crew box, so the merged tree cannot be built
anywhere else. The unit tests exercise the generator on the Astro half and on
fixtures, which proves the decision path and nothing about the merged artifact.
Do not read a green local run as evidence about the merged site.

## Running it by hand

```
npm run build                                  # Astro half into dist/
npm run sitemap  -- dist                       # sitemap over one half only
npm run indexnow -- dist                       # submission list from that sitemap
```

Over a merged tree, add the baseline:

```
npm run sitemap -- _site --baseline _data/sitemap_baseline.txt
```

Both scripts refuse to write an empty list rather than emitting one, so a build
that collapsed fails loudly instead of publishing a sitemap with nothing in it.
`indexnow_ping.py` reads `_data/indexnow.json` and is unchanged; it is the only
step that talks to the outside, and it runs after the deploy.
