# Rockenhaus litigation site (public build repo)

**Public front door:** [https://rockenhaus.net/](https://rockenhaus.net/)  
**Alias (same site, no redirect):** [https://litigation.rockenhaus.net/](https://litigation.rockenhaus.net/)

Visitors, search engines, and citations should use **rockenhaus.net** as the
canonical URL. Maintained pro se by Conrad Alan Rockenhaus for active Michigan
state-court litigation.

**This repository is public** (transferred into `skyphusion-labs` on 2026-07-30).
The private source repo is `rockenhaus-litigation` (markdown filings, privileged
work product, evidence). **Nothing auto-publishes from private to here.**

## What ships from this repo

| Surface | Role |
| --- | --- |
| Case PDFs under `wayne_do_*` / `washtenaw_do_*` | Filed/served court documents |
| Jekyll document pages | PDF viewer + searchable excerpts + LegalDocument JSON-LD |
| `/answers/` | Pre-rendered Q&A with **verified quotations** only |
| `/ask/` | AI Search widget over the court-record corpus (`search.rockenhaus.net`) |
| Hub pages | Parties, disputed domains, death-hoax rebuttals, retractions |

## Publish model (read this first)

1. **Private** builds PDFs and holds sources / evidence.
2. **Human PII review** before any PDF is copied into this repo.
3. **PR on this repo** → required check **`ci`** → merge to `main`.
4. **Deploy** (GitHub Actions → Cloudflare Pages) indexes PDFs, builds Jekyll +
   Astro (`/answers/`, `/evidence/`), deploys `_site`, IndexNow, dual-host cache purge.

Ops detail:

- [docs/ops/publish-runbook.md](docs/ops/publish-runbook.md) -- step checklist
- [docs/ops/publish-matrix.md](docs/ops/publish-matrix.md) -- private↔public status
- [docs/seo/claim-answer-matrix.md](docs/seo/claim-answer-matrix.md) -- claim → filing → URL

**Do not** restore CI auto-open of public PRs from the private repo. That path
was removed deliberately.

## Deploy target: Cloudflare Pages

**Canonical domain:** **rockenhaus.net**  
**Alias:** **litigation.rockenhaus.net**

Each case PDF gets a dedicated HTML page with:

- Embedded PDF viewer (PDF.js) and direct download links
- Searchable text excerpts extracted from PDFs at build time (`pdftotext`)
- Case metadata, breadcrumbs, and LegalDocument JSON-LD
- Hub pages for parties, disputed domains, and false-death domains
- Automatic [sitemap](https://rockenhaus.net/sitemap.xml), `robots.txt`, and [llms.txt](https://rockenhaus.net/llms.txt)
- IndexNow pings to Bing after each deploy

On every push to `main`, GitHub Actions runs `scripts/generate_site.py`, builds
Jekyll, builds Astro, merges, deploys `_site` to Cloudflare Pages, pings IndexNow,
and purges Cloudflare cache for both hostnames.

**GitHub Actions secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Account-owned token **`github-actions-rockenhaus-litigation-pages-deploy`**: **Pages Write** (account) + **Cache Purge** (`rockenhaus.net` zone only) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_ZONE_ID` | Zone ID for `rockenhaus.net` |

Mint a replacement token in Cloudflare Dashboard → **Manage Account** → **Account API tokens** → **Create Token** → **Create Custom Token**, or via API using an account token with **Account API Tokens Write**. Required permission groups:

| Permission | Scope | Resource |
|---|---|---|
| Pages Write | Account | This account |
| Cache Purge | Zone | `rockenhaus.net` |

Label: `github-actions-rockenhaus-litigation-pages-deploy`. Store the token value only in GitHub Actions secret `CLOUDFLARE_API_TOKEN` (never commit it).

### Custom domain DNS (Cloudflare)

Both hostnames are attached to the Cloudflare Pages project `rockenhaus-litigation`. Cloudflare manages DNS records when custom domains are activated in Pages → Custom domains.

| Hostname | Role |
|---|---|
| `rockenhaus.net` | Canonical public URL |
| `litigation.rockenhaus.net` | Alias (same content, no redirect) |
| `www.rockenhaus.net` | **301 → apex** (Cloudflare bulk redirect; path+query preserved) |

Do **not** use a dynamic redirect rule from apex to subdomain; both hostnames serve the same build. Canonical tags and the sitemap use `https://rockenhaus.net`.

### Search engine setup

1. **Google Search Console** -- Property `https://rockenhaus.net/` is owner-verified via DNS on `rockenhaus.net`. Keep `https://litigation.rockenhaus.net/` as a domain property or URL-prefix alias if already verified.
2. Submit sitemap: `https://rockenhaus.net/sitemap.xml`
3. **Bing Webmaster Tools** -- Synced with Search Console; same sitemap (IndexNow runs automatically on deploy).

### Hub pages

| URL | Purpose |
|---|---|
| `/faq/` | FAQ with FAQPage schema (includes “Is Conrad Rockenhaus dead?”) |
| `/is-conrad-rockenhaus-dead/` | Dedicated landing page for false-death domain queries |
| `/is-conrad-rockenhaus-dead/claim-letters/` | Death-hoax claim letter PDFs (VA EMMS best copies) |
| `/ask/` | AI Search over the filed-record corpus |
| `/answers/` | Static answers with verified court-record quotations |
| `/disputed-domains/` | rockenhaus.com, skyphusion.com, cannabytes.net, lawflaws.com, conradrockenhausisdead.*; disputed LinkedIn, Instagram, and X profiles |
| `/parties/` | The parties of record in the published cases |
| `/joe-prich/` | **noindex** related-party public post exhibit index (reachable for questions; not ranked) |
| `/prichards-air-conditioning/` | **404** (HVAC business surface removed; attack SEO) |
| `/prichards-air-conditioning-neo-nazi/` | **404** (retired characterisation slug; do not 301) |
| `/retractions/` | June 30, 2026 retraction demands to Adrienne Rockenhaus and Rob Hein (executed PDFs) |
| `/all-documents/` | HTML index of all document pages (generated at build) |

Party and domain assertions are centralized in `_data/parties.json`.

### Local preview

Requires `poppler-utils` (`pdftotext`) for PDF text extraction:

```bash
sudo apt-get install -y poppler-utils   # or equivalent
python3 scripts/generate_site.py
bundle install
bundle exec jekyll serve
```

Manual deploy to Cloudflare Pages (after build):

```bash
python3 scripts/generate_site.py
bundle exec jekyll build --destination _site
wrangler pages deploy _site --project-name=rockenhaus-litigation --branch=main
```

## Active matters

| Case | Court | Case Number | Role |
|---|---|---|---|
| Rockenhaus v. Rockenhaus (Divorce) | Wayne County Circuit Court (Third Judicial Circuit), Hon. Nicole N. Goodson | 26-104594-DO | Defendant, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Washtenaw County Circuit Court (22nd Circuit), Hon. Darlene A. O'Brien | 26-737-DO | Plaintiff, pro se |

## Repository layout

Private build and deploy repo for the public site at rockenhaus.net:

```
├── <case_id>/                          Per-matter directory (e.g. wayne_do_26-104594-DO)
│   ├── filed/                          Motions, notices, responses authored by Conrad
│   ├── discovery/                      Discovery requests and responses
│   ├── opposing/                       Motions, notices, responses authored by opposing party
│   └── orders/                         Orders from the court
├── scripts/generate_site.py            Generates _documents/, cases/, PDF text, IndexNow list
└── _data/parties.json                  Canonical party/domain assertions for SEO includes
```

Generated at CI build (gitignored): `_documents/`, `cases/`, `all-documents/`, `_data/cases.json`, `_data/pdf_text/`, `_data/indexnow.json`.

The Third Judicial Circuit Case Search Portal is available at [https://cmspublic.3rdcc.org/](https://cmspublic.3rdcc.org/). From there select "Non-Criminal Case Records", solve the captcha, select search by case, type in the case number `26-104594-DO`, press the search button, then select the case to view the Register of Actions.

## License

**This repository is dedicated CC0 1.0 Universal.** See [`LICENSE`](LICENSE), and
[`NOTICE`](NOTICE) for what that dedication can and cannot cover.

Earlier revisions of this section said the opposite: that the repository held
privileged work product and that no license was granted for reuse. That was
wrong on a repository whose `LICENSE` file is a public-domain dedication, and
the two statements contradicted each other on the same public `main`. A reuser
reading one would have been misled whichever they read first.

Privileged litigation work product lives in a separate private repository and
has never been here. Nothing in this repository is offered as privileged, and
nothing here should be read as asserting privilege over published court records.

**The short version of `NOTICE`:** CC0 covers what this project authored or
derived, which is the site code, the build scripts, the text extracted from the
PDFs, and the generated data files. It cannot cover documents authored by other
parties, whose copyright survives their being filed, or third-party material
reproduced inside exhibits. Those are published here as public court records,
and their authors' rights are unaffected by this dedication.
