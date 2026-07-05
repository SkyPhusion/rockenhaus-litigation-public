# Rockenhaus litigation site (private build repo)

**Public front door:** [https://litigation.rockenhaus.net/](https://litigation.rockenhaus.net/)

This private GitHub repository exists only to build and deploy that site. Visitors, search engines, and citations should use **litigation.rockenhaus.net**, not GitHub. The repo is private (GitHub Pro Pages); there is no public source link on the rendered site.

Maintained pro se by Conrad Alan Rockenhaus for active state-court litigation in Michigan.

Rendered filings and discovery PDFs for each active matter are synced automatically from a separate private source repository on each successful CI build. Other paths (`opposing/`, `orders/`, `filed/Exhibits/`, etc.) are maintained manually.

## Deploy target: litigation.rockenhaus.net

Custom domain: **litigation.rockenhaus.net** (this is the canonical public record)

Each PDF gets a dedicated HTML page with:

- Embedded PDF viewer (PDF.js) and direct download links
- Searchable text excerpts extracted from PDFs at build time (`pdftotext`)
- Case metadata, breadcrumbs, FAQPage/LegalDocument JSON-LD, and keyword-rich descriptions
- Hub pages for parties, disputed domains, false-death domains, and third parties
- Automatic [sitemap](https://litigation.rockenhaus.net/sitemap.xml), `robots.txt`, and [llms.txt](https://litigation.rockenhaus.net/llms.txt)
- IndexNow pings to Bing after each deploy

On every push to `main`, GitHub Actions runs `scripts/generate_site.py` to index all PDFs, then builds and deploys the Jekyll site to GitHub Pages (private repo, GitHub Pro). After deploy, it pings IndexNow and purges Cloudflare cache for `litigation.rockenhaus.net`.

**GitHub Pages must use build type `GitHub Actions`** (workflow `Deploy GitHub Pages site`), not legacy “Deploy from branch”. Legacy mode runs a second Jekyll build without `generate_site.py` and can race the deploy step. **Pages visibility:** private repository publishing to the public custom domain above.

**GitHub Actions secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Zone-scoped token with **Cache Purge** on `rockenhaus.net` |
| `CLOUDFLARE_ZONE_ID` | Zone ID for `rockenhaus.net` |

`CLOUDFLARE_ACCOUNT_ID` is not required for hostname cache purge.

### Custom domain DNS (Cloudflare)

At your `rockenhaus.net` DNS host, add:

| Type | Name | Value |
|---|---|---|
| CNAME | `litigation` | your GitHub Pages host (e.g. `username.github.io`) |

Proxy status: DNS only (grey cloud) is typical for GitHub Pages; orange-cloud proxy also works with Cloudflare.

Then in this repo: **Settings → Pages → Custom domain**, enter `litigation.rockenhaus.net` and enable **Enforce HTTPS** once DNS propagates. The `CNAME` file in this repository must match.

### Search engine setup (manual)

1. **Google Search Console** — Add property `https://litigation.rockenhaus.net/`, verify via HTML tag, then paste the verification code into `_config.yml` as `google_site_verification` and redeploy.
2. Submit sitemap: `https://litigation.rockenhaus.net/sitemap.xml`
3. **Bing Webmaster Tools** — Add site and submit the same sitemap (IndexNow runs automatically on deploy).
4. From `rockenhaus.net` (your domain), add a prominent link to `https://litigation.rockenhaus.net/` to reinforce canonical authority.

### Hub pages

| URL | Purpose |
|---|---|
| `/faq/` | FAQ with FAQPage schema (includes “Is Conrad Rockenhaus dead?”) |
| `/is-conrad-rockenhaus-dead/` | Dedicated landing page for false-death domain queries |
| `/disputed-domains/` | rockenhaus.com, skyphusion.com, cannabytes.net, lawflaws.com, conradrockenhausisdead.* |
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
# GitHub Actions uses actions/jekyll-build-pages; locally:
gem install bundler jekyll
bundle init && bundle add jekyll jekyll-seo-tag jekyll-sitemap
bundle exec jekyll serve
```

## Active matters

| Case | Court | Case Number | Role |
|---|---|---|---|
| Rockenhaus v. Rockenhaus (PPO) | Wayne County Circuit Court (Third Judicial Circuit) | 26-102221-PP | Respondent, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Wayne County Circuit Court (Third Judicial Circuit), Hon. Nicole N. Goodson | 26-104594-DO | Defendant, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Washtenaw County Circuit Court (22nd Circuit), Hon. Darlene A. O'Brien | 26-737-DO | Plaintiff, pro se |

## Repository layout

Private build and deploy repo for the public site at litigation.rockenhaus.net:

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
