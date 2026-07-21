# Rockenhaus litigation site (private build repo)

**Public front door:** [https://rockenhaus.net/](https://rockenhaus.net/) (also served at [https://litigation.rockenhaus.net/](https://litigation.rockenhaus.net/))

This private GitHub repository exists only to build and deploy that site. Visitors, search engines, and citations should use **rockenhaus.net** as the canonical URL. The repo is private; there is no public source link on the rendered site.

Maintained pro se by Conrad Alan Rockenhaus for active state-court litigation in Michigan.

Rendered filings and discovery PDFs for each active matter are synced automatically from a separate private source repository on each successful CI build. Other paths (`opposing/`, `orders/`, `filed/Exhibits/`, etc.) are maintained manually.

## Deploy target: Cloudflare Pages

**Canonical domain:** **rockenhaus.net**

**Alias (same site, no redirect):** **litigation.rockenhaus.net**

Each PDF gets a dedicated HTML page with:

- Embedded PDF viewer (PDF.js) and direct download links
- Searchable text excerpts extracted from PDFs at build time (`pdftotext`)
- Case metadata, breadcrumbs, FAQPage/LegalDocument JSON-LD, and keyword-rich descriptions
- Hub pages for parties, disputed domains, false-death domains, and third parties
- Automatic [sitemap](https://rockenhaus.net/sitemap.xml), `robots.txt`, and [llms.txt](https://rockenhaus.net/llms.txt)
- IndexNow pings to Bing after each deploy

On every push to `main`, GitHub Actions runs `scripts/generate_site.py` to index all PDFs, builds Jekyll, deploys `_site` to Cloudflare Pages, pings IndexNow, and purges Cloudflare cache for both hostnames.

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
| `www.rockenhaus.net` | CNAME to apex (optional) |

Do **not** use a dynamic redirect rule from apex to subdomain; both hostnames serve the same build. Canonical tags and the sitemap use `https://rockenhaus.net`.

### Search engine setup

1. **Google Search Console** — Property `https://rockenhaus.net/` is owner-verified via DNS on `rockenhaus.net`. Keep `https://litigation.rockenhaus.net/` as a domain property or URL-prefix alias if already verified.
2. Submit sitemap: `https://rockenhaus.net/sitemap.xml`
3. **Bing Webmaster Tools** — Synced with Search Console; same sitemap (IndexNow runs automatically on deploy).

### Hub pages

| URL | Purpose |
|---|---|
| `/faq/` | FAQ with FAQPage schema (includes “Is Conrad Rockenhaus dead?”) |
| `/is-conrad-rockenhaus-dead/` | Dedicated landing page for false-death domain queries |
| `/disputed-domains/` | rockenhaus.com, skyphusion.com, cannabytes.net, lawflaws.com, conradrockenhausisdead.*; disputed LinkedIn, Instagram, and X profiles |
| `/parties/` | Adrienne Rockenhaus / Blair / Hein / @adezero and Conrad Alan Rockenhaus |
| `/prichards-air-conditioning-neo-nazi/` | **Do not hire** — Prichard's AC neo-Nazi owner (Dustin Brown / Joe Prich) |
| `/joe-prich/` | Joe Prich / Dustin Brown (@JustCallMeJoeP) Nazzy neo-Nazi X evidence |
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
| Rockenhaus v. Rockenhaus (PPO) | Wayne County Circuit Court (Third Judicial Circuit) | 26-102221-PP | Respondent, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Wayne County Circuit Court (Third Judicial Circuit), Hon. Nicole N. Goodson | 26-104594-DO | Defendant, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Washtenaw County Circuit Court (22nd Circuit), Hon. Darlene A. O'Brien | 26-737-DO | Plaintiff, pro se |

## Repository layout

Private build and deploy repo for the public site at rockenhaus.net:

```
├── <case_id>/                          Per-matter directory (e.g. wayne_ppo_26-102221-PP)
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

This repository contains private litigation work product and personal records. No license is granted for redistribution, reuse, or republication of any content. Inadvertent disclosure does not waive privilege.
