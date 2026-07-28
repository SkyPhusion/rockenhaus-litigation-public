# Rebuild rockenhaus.net from the filings outward

Design only. Nothing here is implemented. Author: Joan (frontend/extraction).
Baseline: `main` at 6ebd1b73, live site checked 2026-07-28 ~06:05 UTC.

## 1. What this is

The site was built as a reputation site about several named private individuals
and is being outranked on Conrad own name. PRs #7, #10 and #12 removed the
third-party pages and the machine-readable assertions. What is left is visible
prose, and it is not an edit job: `/faq/` alone renders 50 entries of which 24
are third-party characterisation questions.

The proposal is to rebuild the site as a canonical public archive of filed
Michigan court documents and nothing else, so those pages do not exist rather
than being edited into acceptability. The 173 filings, the corpus, the OCR work,
the exhibit system and the pre-rendered Q&A are the foundation and all survive.

## 2. What I verified, and where

Every number below is measured against the LIVE artifact at rockenhaus.net, not
against the repo, unless the line says otherwise. Region is stated because the
same page reads very differently in `<head>` than in the body.

### 2.1 The record itself (repo, `_corpus/coverage.json`)

| Metric | Value |
| --- | --- |
| Filed documents | 173 |
| Pages | 959 |
| Pages with text | 928 (96.8%) |
| Native text vs OCR | 851 native, 77 OCR |
| Documents with no text layer at all | 0 |
| Total characters | 2,284,346 |

`_corpus/manifest.json` carries 959 page records, each with `doc_slug`, `title`,
`url`, `pdf_url`, `case_id`, `case_number`, `category`, `filed_date`, `page`,
`total_pages`, `has_text`, `text_source`. That is the whole registry the site
needs. This matters for section 8.

### 2.2 Third-party terms on the live pages

Counted with the `src/lib/guard.ts` denylist, word-boundary matched, split by
region (`<head>` vs everything after `</head>`).

| Live page | HEAD | BODY | noindex |
| --- | ---: | ---: | --- |
| `/faq/` | 0 | 245 | no |
| `/retractions/rob-hein/` | 10 | 21 | no |
| `/retractions/` | 9 | 22 | no |
| `/conrad-rockenhaus-podcast-interviews/` | 4 | 20 | no |
| `/parties/` | 4 | 4 | no |
| `/disputed-domains/` | 3 | 15 | no |
| `/retractions/adrienne-rockenhaus/` | 3 | 11 | no |
| `/` | 0 | 18 | no |
| `/is-conrad-rockenhaus-dead/` | 0 | 14 | no |
| `/evidence/` | 0 | 13 | YES |
| `/rockenhaus-com/` | 0 | 8 | no |
| `/lawflaws-com/` | 0 | 4 | no |
| `/fitspo-net/` | 0 | 3 | no |
| `/skyphusion-com/` | 0 | 3 | no |
| `/all-documents/` | 0 | 2 | no |
| `/answers/` | 0 | 0 | no |

Head hits, which are the serious ones because search engines read them as claims:
`/retractions/rob-hein/` "rob hein" x7 + "qolity" x3; `/retractions/`
"rob hein" x3 + "qolity" x3 + "adezero" x3; `/conrad-rockenhaus-podcast-interviews/`
"sockpuppet" x4; `/parties/` "adezero" x4; `/disputed-domains/` "adezero" x3.

`/answers/` is the only content surface at zero in both regions. That is the
shape the whole site should be.

## 3. Live defects found while inventorying

Reported, not fixed. Four of the five are in the lead integration path or need a
ruling, so they are flagged rather than fix-forwarded. Item 3.4 I can fix inside
this work.

### 3.1 Every unknown path returns HTTP 200 with the homepage

Verified: `GET https://rockenhaus.net/definitely-not-a-real-page-xyz/` returns
`HTTP/2 200` and 29,083 bytes byte-identical to `/`. So do `/joe-prich/`,
`/rob-hein/` and `/prichards-air-conditioning-neo-nazi/`, the three pages PR #7
deleted. This is the Cloudflare Pages single-page-app fallback.

Consequences:
- The deleted accusation URLs never signalled removal. They are soft 404s that
  search engines will drop slowly instead of promptly.
- A mistyped rockenhaus.net citation in a filing resolves silently to the
  homepage instead of erroring. On a court record that is the worse failure.

This is also why "do not break URLs" cannot be verified by checking for 404s on
this site. The redirect map in section 7 has to be explicit.

Fix is a repo-side `_redirects` plus a real `404.html`. Whether the Pages
project SPA setting also has to be turned off in the dashboard is Strummer lane
and a CR, not mine. Flagging, not touching.

### 3.2 Every deploy re-submits the deleted accusation URLs to IndexNow

`_data/indexnow.json` still contains `https://rockenhaus.net/joe-prich/`,
`/rob-hein/` and `/prichards-air-conditioning-neo-nazi/`. `scripts/generate_site.py`
regenerates them from a hardcoded `STATIC_URLS` list that still names those three
paths. `cloudflare-pages.yml` runs `scripts/indexnow_ping.py` on every deploy.

So every push to main actively re-submits the three deleted third-party URLs to
Bing, and each one answers 200 with the homepage per 3.1. The cleanup is being
undone by the deploy on every run.

### 3.3 Two guards, two denylists, and the weaker one covers the bigger half

`src/lib/guard.ts` denylists 15 terms and runs at Astro build time, so it covers
`/evidence/` and `/answers/` only. `scripts/check_indexable_metadata.py` runs over
the merged `_site` and covers everything, but its pattern list is 4 entries:
`neo-nazi`, `neo nazi`, `nazzy`, `do not hire`. No names.

That gap is exactly why `/retractions/rob-hein/` ships "Rob Hein" x7 and "QOLity"
x3 inside its `<head>` with CI green. The stronger guard does not reach the Jekyll
pages and the guard that does reach them does not look for names.

### 3.4 `/answers/` is absent from the sitemap

The live `/sitemap.xml` has 367 `<loc>` entries and none of them are under
`/answers/`. `jekyll-sitemap` only sees Jekyll pages, and `astro.config.mjs`
deliberately ships no sitemap integration to avoid a collision. The result is
that the strongest ranking asset on the site, the one surface measuring zero on
section 2.2, is the one surface not advertised to search engines. Correct as a
transition compromise; a defect now. Section 8 closes it.

### 3.5 `/parties/` renders an empty section heading

`parties/index.html` still emits `<h2>Related third parties</h2>` with no content
under it, left by the PR #7 deletions. Cosmetic, and the page is proposed for
retirement anyway, but it is live.

## 4. The design principle

The site is a projection of the filed record.

Concretely: every page is derived from something in `_corpus` or from a document
that was filed with or served on a court. If a page cannot be derived that way,
it does not exist. This is the same principle I hold on the vivijure planner
(the UI renders from the registry, never a hardcoded per-feature section), and
it is what makes the constraint enforceable rather than aspirational: the
generator has nothing to render an unsourced page FROM.

Conrad framing, which this serves: the claims are true, but the site should not
read as an attack site. "Canonical court record for Rockenhaus v. Rockenhaus" is
also a topic nobody else can compete for, because nobody else has the documents.

## 5. The mechanism: an unsourced claim must be unrepresentable

Hard constraint 1 is that nothing may assert a characterisation of any person in
the site own voice, and that it should be enforced in the build rather than by
review. The existing exhibit and Q&A schemas already do this for their own data.
The redesign generalises it.

### 5.1 The claim type

Every renderable statement about a person becomes a `claim`, and a claim carries
its attribution as a discriminated union:

```ts
const attribution = z.discriminatedUnion("kind", [
  // Quoted from a filing. verify-citations proves the passage is on that page.
  z.object({ kind: z.literal("filing"),        doc_slug: z.string(), page: z.number().int().positive(), quote: z.string().min(20) }),
  // Pointer to a filing page without reproducing its words. For OCR pages,
  // whose transcription interleaves margin text and must never be quoted.
  z.object({ kind: z.literal("filing_reference"), doc_slug: z.string(), page: z.number().int().positive(), note: z.string().min(10) }),
  // Correspondence Conrad served. The fact is the service; the contents are quoted.
  z.object({ kind: z.literal("served_correspondence"), letter_id: z.string(), page: z.number().int().positive(), quote: z.string().min(20) }),
  // What an artifact shows on its face. noindex surfaces only (section 5.3).
  z.object({ kind: z.literal("artifact"),      exhibit_id: z.string() }),
]);
```

There is deliberately no `kind: "site_says"` and no optional attribution. An
unsourced claim is not rejected at review, it is not expressible. That is
strictly stronger than a denylist, because a denylist only catches the words
somebody thought to list.

### 5.2 The renderer enforces it too

A single `<Claim>` component takes `statement` and `attribution` as required
props and renders them as one unit: the statement, then "Source: <link to the
filing, page N>", always, with the quote. There is no code path that renders a
statement without its citation, because they are the same component and the prop
is not optional. A page author cannot forget the citation; they can only fail to
compile.

`scripts/verify-citations.mjs` already proves every quoted passage appears on the
cited page of the cited filing, and already refuses a quoted citation to an OCR
page. It gets extended from the 6 Q&A questions to every claim on the site.

### 5.3 Two tiers of person, because they are not the same case

- **Tier A, non-parties** (Rob Hein, and the third parties removed in #7/#10/#12).
  Never in metadata, never in an indexable body, no page of their own, no
  characterisation anywhere. Their names survive only inside verbatim quotation
  of a filing or an artifact on a noindex surface, if at all.
- **Tier B, the opposing party** (Adrienne Rockenhaus). She is a party. Her name
  belongs in the caption, in metadata, and on document pages, because the case is
  literally named for her. Allegations about her are publishable only as a
  `claim` with `kind: "filing"`, rendered as "the motion filed 2026-07-02 alleges
  X", linked, never in the site voice.

Where Tier B stops is Conrad call, not mine. See ruling R1.

### 5.4 One denylist, one guard, whole site

Defect 3.3 goes away structurally once the whole site is Astro: `guard.ts` runs
in `BaseLayout` for every page, so there is one list and it covers everything.
`check_indexable_metadata.py` stays as an independent post-build check over the
built HTML (a second, differently-implemented reading of the same rule is worth
keeping) but its pattern list is imported from the same source rather than
hand-maintained at 4 entries.

The list itself gets the tier split: Tier A terms are hard-denied in metadata;
the party name and case captions are explicitly allowed, since the site is
supposed to rank for them.

## 6. Page-by-page disposition

"Keep" means the URL and its purpose survive. "Rebuild" means the URL survives
and the content is regenerated from the record. "Retire" means the URL 301s.

### Keep, rebuilt from the corpus, URLs unchanged

| Path | Count | Notes |
| --- | ---: | --- |
| `/documents/<slug>/` | 173 | Now rendered from `_corpus/manifest.json`. Gains full page-level searchable text, with native vs OCR labelled per page. Loses the stuffed titles (section 8.2). |
| `/cases/<case_id>/` | 3 | Docket view per case. |
| `/all-documents/` | 1 | Complete index. |
| `/` | 1 | The record: what the cases are, latest filings, counts, entry points. No characterisations. |
| PDF paths | 173 | Byte-identical URLs. These are what filings cite. |
| `/retractions/*.pdf` | 2 | Served correspondence, as documents. |

### Keep and expand

| Path | Disposition |
| --- | --- |
| `/answers/`, `/answers/<slug>/` | The centre of the redesign. 6 entries today; this absorbs the legitimate half of `/faq/` and grows from there. Every answer is quoted from the record and citation-verified. This is the ranking surface and the replacement for `/faq/`. |
| `/evidence/`, `/evidence/<id>/` | 14 exhibits, 2 identification chains, noindex, unchanged. Stays preserved and citable for filings. |

### Keep, reframed onto the claim mechanism

| Path | Disposition |
| --- | --- |
| `/is-conrad-rockenhaus-dead/` | Conrad best counter-page for the exact query he is losing. Keep the URL exactly; do not move a page that is working. Rebuilt as an answer-shaped page: what he filed, when, the welfare check, his verified profiles. The current body names Adrienne as the creator of those domains in Conrad voice; that becomes a filing-sourced claim or comes out. See ruling R4. |
| `/is-conrad-rockenhaus-dead/aadvantage-account-update/` | Conrad own rebuttal evidence. Keep. |
| `/disputed-domains/` | Defensive and about claims made about him, so it stays. Rebuilt from prose into a provenance table: domain, what is claimed about it, WHERE that claim is made (filing citation), status. The current lead paragraph asserts in the site voice that the opposing party uses infrastructure "to support her neo-Nazi sympathies"; that is the 3 head and 15 body hits in section 2.2 and it does not survive. |
| `/retractions/`, `/retractions/adrienne-rockenhaus/` | Serving a retraction demand is a fact about Conrad own conduct, so it stays, framed as served correspondence: served on this date, by these means, under these statutes, PDF attached. The letter contents are QUOTED as a document, not asserted. Metadata is stripped to the fact of service (fixes 10 and 9 head hits). |

### Retire

| Path | Proposed target | Why |
| --- | --- | --- |
| `/faq/` | 301 to `/answers/` | 245 body hits. 24 of 50 entries are third-party characterisation. The legitimate entries become `/answers/` pages. |
| `/parties/` | 301 to `/` | Party identity belongs in the caption on every case and document page. As a standalone page it is a person-directory, which is the reputation-site shape. Also carries defect 3.5. |
| `/rockenhaus-com/`, `/lawflaws-com/`, `/fitspo-net/`, `/skyphusion-com/` | 301 to `/disputed-domains/` | Four pages whose entire content is characterisation of the opposing party in "Conrad asserts" voice. The defensive value (these domains are not the court record) is fully carried by one `/disputed-domains/` row each. Needs ruling R2. |
| `/conrad-rockenhaus-podcast-interviews/` | 301 to `/answers/` | 4 head and 20 body hits, built around a sockpuppet allegation about a third-party channel. Needs ruling R3. |
| `/retractions/rob-hein/` | see ruling R5 | Rob Hein is Tier A. The service is a fact about Conrad conduct; the page is 10 head and 21 body hits about a non-party. |
| `/joe-prich/`, `/rob-hein/`, `/prichards-air-conditioning-neo-nazi/` | 404, not 301 | Already deleted from the repo but answering 200 per defect 3.1. These should stop resolving. Needs ruling R6 (404 vs 301). |

## 7. URL inventory and redirect map

### 7.1 Inventory (live `/sitemap.xml`, 367 entries, fetched 2026-07-28)

| Class | Count | Preserved |
| --- | ---: | --- |
| `/documents/<slug>/` | 173 | yes, unchanged |
| PDF files under the three case dirs | 173 | yes, unchanged |
| `/cases/<case_id>/` | 3 | yes, unchanged |
| `/retractions/` + 2 letter pages + 2 PDFs | 5 | 3 yes, `/retractions/rob-hein/` pending R5 |
| `/is-conrad-rockenhaus-dead/` + subpage | 2 | yes, unchanged |
| `/disputed-domains/` | 1 | yes, rebuilt |
| `/all-documents/`, `/` | 2 | yes |
| `/faq/`, `/parties/` | 2 | 301 |
| 4 domain hub pages | 4 | 301, pending R2 |
| `/conrad-rockenhaus-podcast-interviews/` | 1 | 301, pending R3 |
| `/assets/evidence/*.pdf` | 1 | yes |
| **Not in the sitemap but live** | | |
| `/answers/` + 6 answer pages | 7 | yes, and ADDED to the sitemap (defect 3.4) |
| `/evidence/` + 14 exhibit pages | 15 | yes, stays out of the sitemap (noindex, correct) |
| `/llms.txt`, `/robots.txt`, `/sitemap.xml`, indexnow key | 4 | yes, `llms.txt` rewritten |

### 7.2 Redirect map (Cloudflare Pages `_redirects`, 301 unless stated)

```
/faq/                                    /answers/            301
/parties/                                /                    301
/rockenhaus-com/                         /disputed-domains/   301
/lawflaws-com/                           /disputed-domains/   301
/fitspo-net/                             /disputed-domains/   301
/skyphusion-com/                         /disputed-domains/   301
/conrad-rockenhaus-podcast-interviews/   /answers/            301
/joe-prich/                              /404.html            404
/rob-hein/                               /404.html            404
/prichards-air-conditioning-neo-nazi/    /404.html            404
/*                                       /404.html            404
```

The trailing catch-all is what replaces the homepage-for-everything behaviour in
defect 3.1. TO VERIFY before implementation: that Cloudflare Pages `_redirects`
takes precedence over the project SPA fallback, and which status codes Pages
accepts (I believe 301/302/303/307/308/404/200 and NOT 410, so the deleted
third-party pages get 404 rather than the more accurate 410). I will confirm
against Pages behaviour on a preview deployment rather than assert it, and if the
fallback wins, this becomes a Strummer CR on the project setting.

### 7.3 What cannot be preserved

**`/faq/#<anchor>` fragment targets.** The FAQ renders 50 `<details id="...">`
blocks, so 50 anchors exist. A server-side redirect cannot read a fragment, so
`/faq/#is-conrad-rockenhaus-dead` lands on `/answers/` without selecting an
answer. Mitigations, in order of preference:

1. The legitimate entries become `/answers/<slug>/` pages whose slugs are carried
   over from the FAQ ids where they are sensible, so the CONTENT is still there
   at a stable, better URL.
2. A tiny inline script on `/answers/` that maps a known legacy fragment to its
   new answer page. Client-side, so it does not help a crawler, but it does help
   a human following a link out of a filing.

I have found no filing citing a `/faq/#anchor` URL, but I have only the public
mirror; the private repo is off-limits to me and I have not searched it. If any
filing cites a fragment, that is worth knowing before `/faq/` moves. Flagging as
a question rather than an assumption.

**Nothing else.** Every other retired URL keeps a 301, and the 173 document
pages, 173 PDFs, 3 case pages and both retraction PDFs are unchanged.

## 8. Build plan: complete the migration off Jekyll

### 8.1 Why this is a requirement and not a preference

There is no Ruby on the crew box. `ruby`, `bundle`: not installed. So today the
Jekyll half cannot be built or checked locally by anyone on this crew, and the
only place it is ever exercised is CI. The Astro half, by contrast, runs
completely here. Measured just now on dischord as joan:

```
vitest            3 files, 23 tests passed
verify-citations  7 quoted citations verified, 2 unquoted references resolved
build-corpus      --check: corpus matches (959 pages)
astro build       22 pages built in 463ms
```

Completing the migration is what makes "check the artifact, not the description
of it" possible for this repo at all.

### 8.2 What replaces `scripts/generate_site.py`

Nothing, structurally. `_corpus/manifest.json` already carries every field the
generator computes (section 2.1), so the 173 document pages, 3 case pages and
`/all-documents/` become Astro content collections over the corpus. Deleting the
generator also deletes, as a side effect rather than an edit:

- `seo_document_keywords()`, which appends `"Adrienne Blair", "Adrienne Hein",
  "@adezero"` to the meta keywords of every one of the 173 document pages;
- `seo_document_title()`, which produces the stuffed
  `"<heading> PDF | Rockenhaus v. <seo_title> Case <n> (<county> <matter>)"`;
- `seo_document_description()`, which appends "Disputed third-party domains:
  /disputed-domains/." to all 173 descriptions;
- the hardcoded `STATIC_URLS` list that is defect 3.2.

Document titles become the document heading plus the case number. That is what a
person searching for a filing types.

### 8.3 The 173 PDFs, 180 MB

Astro copies `public/` into `dist/`. Moving the three case directories into
`public/` would preserve URLs exactly but rewrites 180 MB of history. Proposal:
leave the PDFs where they are and copy them into `dist/` in an `astro:build:done`
hook, which is what the current deploy already does by hand with `cp -r dist/. _site/`.
URLs stay byte-identical either way; this avoids the churn. Open to the lead
preferring the `git mv`.

### 8.4 Sitemap and IndexNow

`@astrojs/sitemap` with a filter that excludes noindex pages, so `/answers/` is
included (defect 3.4) and `/evidence/` stays out. IndexNow submissions are
generated FROM the sitemap instead of a hand-kept list, which is what makes
defect 3.2 unrepeatable rather than merely fixed.

### 8.5 Removed at the end of the migration

`Gemfile`, `Gemfile.lock`, `_config.yml`, `_layouts/`, `_includes/`,
`_plugins/`, `_documents/` (173 generated stubs), `scripts/generate_site.py`,
`scripts/test_generate_site.py`, and the Ruby steps in both workflows.
`check-collisions.mjs` inverts during the transition (Astro owns more prefixes
each step, Jekyll owns fewer) and is deleted with the last Jekyll page. That
check is how each handoff is proven clean, so it is the last thing to go.

## 9. How this gets verified

Aviation grade means the negative test fails before I trust it. For each
mechanism, the test and the negative control:

| Mechanism | Positive | Negative control (must FAIL) |
| --- | --- | --- |
| Claim schema | A claim with a filing attribution builds | A claim object with attribution omitted does not typecheck, and one with an unknown `kind` fails Zod |
| Citation verification | The existing 7 quoted + 2 unquoted pass | A deliberately drifted quote fails `verify-citations`, and a quoted citation pointing at an OCR page is refused |
| Metadata guard | Whole-site build is clean | A Tier A term planted in one page title fails the build, checked at BOTH guards independently |
| URL preservation | Every one of the 367 sitemap URLs resolves after the rebuild | A URL removed on purpose returns 404 and NOT the homepage (this is the one defect 3.1 was hiding) |
| Redirect map | Each mapped path 301s to its target | An unmapped bogus path returns 404, verified on the preview deployment, not assumed |

URL preservation is checked by diffing the built `dist/` path list against the
367 live sitemap entries, so a dropped document page fails CI rather than being
noticed when somebody goes looking for a filing.

## 10. Phasing

Three PRs, so that a content ruling never blocks a build fix and a build fix
never smuggles in a content change.

**PR 1, build migration, no content-policy change.** Astro takes `/documents/`,
`/cases/`, `/all-documents/`, `/`; sitemap and IndexNow move; `_redirects` and a
real `404.html` land; Ruby leaves CI. Provable URL-for-URL against the live site,
and it fixes defects 3.1, 3.2 and 3.4. Needs no ruling.

**PR 2, the claim mechanism.** Schema, `<Claim>` component, extended
verify-citations, unified denylist with the tier split, negative tests from
section 9. Still no content change: the mechanism lands before anything depends
on it. Needs R1 to fix the tier boundary.

**PR 3, content.** Retire `/faq/`, expand `/answers/`, rebuild
`/disputed-domains/` and `/retractions/` onto claims, rewrite `llms.txt`. Gated
on R1 through R6.

## 11. Rulings I want from Conrad, not from the lead

This is his court record during active litigation. Each of these changes what
the site says about a person, so I am surfacing them rather than absorbing them.

**R1. How far does a filing-sourced allegation about the opposing party go?**
She is a party, so the distinction is real, but "sourced to a filing" still spans
a wide range. Three positions:
  (a) any allegation appearing in any filing may be published, quoted and cited;
  (b) only allegations that are the subject of a pending motion;
  (c) parties are named, and allegations appear only on `/documents/` pages,
      where they are the document own text and the site is not restating them.
My recommendation is (b): it is defensible as reporting on live proceedings, it
keeps the site topical, and it does not turn the archive into a running
allegation index. But this is his call and the whole design principle rests on it.

**R2. The four domain hub pages** (`/rockenhaus-com/`, `/lawflaws-com/`,
`/fitspo-net/`, `/skyphusion-com/`). Collapse into `/disputed-domains/` rows with
citations, as proposed, or retire outright? Collapsing keeps the defensive value;
retiring is cleaner. I recommend collapsing.

**R3. `/conrad-rockenhaus-podcast-interviews/`.** Retire? It is built around a
sockpuppet allegation about a third-party YouTube channel, which is the shape we
are removing, but it is also a genuine defensive page for a real search result
naming him. I recommend retiring it and replacing it with an `/answers/` entry
that addresses the podcast results from the record.

**R4. `/is-conrad-rockenhaus-dead/`.** The page currently says, in Conrad voice,
that Adrienne created the two conradrockenhausisdead domains. Is that restated as
"the motion filed <date> alleges X", or is "Conrad asserts X" an acceptable
middle position on his own counter-page? Same question applies to the disputed
domains lead paragraph. Note that "Conrad asserts" is neither the site voice nor
a citation, so the mechanism in section 5 has no slot for it as written; if he
wants it kept there is a fifth attribution kind to add, deliberately.

**R5. `/retractions/rob-hein/`.** Rob Hein is not a party. Serving him a
retraction demand is a fact about Conrad conduct, which argues for keeping it.
The page as it stands is 10 head and 21 body hits about a non-party. Options:
keep the page and strip it to the fact of service; keep the PDF only and drop the
page; noindex the page; retire both. I recommend keeping the PDF and the fact of
service, dropping the standalone page.

**R6. Do the three deleted third-party URLs 404 or 301?** 404 is the honest
signal and asks search engines to drop them. A 301 to `/answers/` would pass
along any residual authority they hold. I recommend 404: whatever authority those
URLs have is authority for the wrong topic.

**R7. Is there anything here Ernst should look at** before PR 3, given active
litigation and that this is a public record site? Not my call and not my lane; I
raise it because publishing a claim-provenance table is a deliberate change in
what the site is doing.

## 12. Dependencies outside my lane

Carried from the lead, listed so the design accounts for them:

- The litigation AI Search target needs `includePaths ["_corpus/"]` before
  anything answers live. Nothing in this design depends on it: every answer page
  is pre-rendered from verified citations, and a client-rendered answer widget
  does not rank, which is why the current architecture pre-renders. Live search
  is additive.
- R2 bucket, AI Search and `SKYPHUSION_TARGETS_JSON` are unprovisioned. Same
  answer: additive, not blocking.
- The Cloudflare Pages SPA fallback setting (defect 3.1) may need a project-level
  change that is Strummer lane and a CR. I will establish on a preview deployment
  whether `_redirects` alone is sufficient before anyone touches the project.
