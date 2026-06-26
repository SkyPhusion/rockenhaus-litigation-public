# rockenhaus-litigation-public

Personal document repository for active state-court litigation in Michigan. Maintained pro se by Conrad Alan Rockenhaus.

**Public website:** [https://litigation.rockenhaus.net/](https://litigation.rockenhaus.net/)

Rendered filings and discovery PDFs for each active matter are synced automatically from the private source repository (`skyphusion-labs/rockenhaus-litigation`) on each successful CI build. Other paths (`opposing/`, `orders/`, `filed/Exhibits/`, etc.) are maintained manually.

## GitHub Pages site

Custom domain: **litigation.rockenhaus.net**

Each PDF gets a dedicated HTML page with:

- Embedded PDF viewer (PDF.js) and direct download links
- Searchable text excerpts extracted from PDFs at build time (`pdftotext`)
- Case metadata, breadcrumbs, FAQPage/LegalDocument JSON-LD, and keyword-rich descriptions
- Hub pages for parties, disputed domains, false-death domains, and third parties
- Automatic [sitemap](https://litigation.rockenhaus.net/sitemap.xml), `robots.txt`, and [llms.txt](https://litigation.rockenhaus.net/llms.txt)
- IndexNow pings to Bing after each deploy

On every push to `main`, GitHub Actions runs `scripts/generate_site.py` to index all PDFs, then builds and deploys the Jekyll site.

### Custom domain DNS (Cloudflare)

At your `rockenhaus.net` DNS host, add:

| Type | Name | Value |
|---|---|---|
| CNAME | `litigation` | `skyphusion.github.io` |

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
| `/disputed-domains/` | rockenhaus.com, skyphusion.com, cannabytes.net, conradrockenhausisdead.* |
| `/parties/` | Adrienne Rockenhaus / Blair / Hein / @adezero and Conrad Alan Rockenhaus |
| `/joe-prich/` | Joe Prich (@JustCallMeJoeP) assertions indexed in this record |
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

```
rockenhaus-litigation-public/
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
