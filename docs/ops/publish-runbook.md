# Publish runbook (private → public)

Short procedure for landing a new filed/served PDF on rockenhaus.net.

## Preconditions

- PDF is a **court filing or served document** (or cleared rebuttal evidence).
- **PII review done** (Conrad or designee). When in doubt, leave private.
- No auto-publish: private CI does **not** open public PRs.

## Steps

1. **Obtain the PDF** from the private build artifacts or local `build_pdfs` output.
2. **Name** it consistently with the private filing stem  
   (e.g. `45_Consolidated_Notice_of_Hearing_In_Person_8-26_2026-08-04.pdf`).
3. **Place** under the matching public tree, e.g.  
   `wayne_do_26-104594-DO/filed/`.
4. **Regenerate** (from repo root):
   ```bash
   python3 scripts/generate_site.py
   # if new native text should be searchable/quotable:
   # prefer Linux pdftotext (Docker bookworm) for CI parity
   node scripts/build-corpus.mjs
   node scripts/verify-citations.mjs   # if qa_questions changed
   ```
5. **Open a PR** on `rockenhaus-litigation-public`. Required check: **`ci`** only.
6. **Merge** when green. Pages deploy runs on `main`.
7. **Spot-check** apex + alias (`rockenhaus.net` and `litigation.rockenhaus.net`);
   deploy purges both.
8. **Search index** (if corpus changed):
   ```bash
   # from search-mcp, with rockenhaus R2 creds + targets entry
   node scripts/sync.mjs rockenhaus --no-github-verify
   npx wrangler ai-search jobs create rockenhaus-public
   ```
9. **Update** [publish-matrix.md](./publish-matrix.md) high-water / special rows if needed.

## Claim letters and similar evidence

- Live under `assets/evidence/…` with a small HTML page (see AAdvantage and
  claim-letters hubs), **not** under `filed/` unless they are court filings.
- Still require the same PR + deploy path.

## Do not

- Force-push public `main`.
- Auto-open public PRs from private CI.
- Quote OCR-only pages on `/answers/` (use `references` only).
- Point the ask widget at `search.vivijure.com` (wrong corpus).
