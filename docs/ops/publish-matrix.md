# Private ↔ public publish matrix

**Purpose:** Make docket lag and handoff state explicit. The private repo
(`rockenhaus-litigation`) holds source markdown + evidence; this public repo
holds the **filed/served PDFs** and static rebuttal evidence that ship on
rockenhaus.net.

**Rule (Conrad 2026-08-04):** Public publish is **manual and reviewed**. There is
no CI auto-sync from private. PII gate before any new PDF lands on `main`.

**Last matrix refresh:** 2026-08-04 (P2).

## How to read this

| Status | Meaning |
| --- | --- |
| **published** | PDF is on public `main` under the case tree or `assets/evidence/` |
| **private-only** | Source or evidence exists privately; not on public site |
| **n/a** | Not a court filing (hub prose, FAQ, etc.) |

Regenerate the Wayne DO filed list with:

```bash
ls wayne_do_26-104594-DO/filed/*.pdf | wc -l
```

## Cases on the public site

| Case | Public PDF roots | Notes |
| --- | --- | --- |
| Wayne DO `26-104594-DO` | `wayne_do_26-104594-DO/filed/`, `opposing/`, `orders/` | Primary active docket |
| Washtenaw DO `26-737-DO` | `washtenaw_do_26-737-DO/filed/` | Reference / companion |
| Wayne PPO `26-102221-PP` | (retired from public index) | Historical; not re-expanded here |

## Wayne DO -- Conrad numbered filings (source markdown vs public PDF)

Private sources live under  
`rockenhaus-litigation/cases/wayne_do_26-104594-DO/filings/*.md`.  
Public PDFs live under `wayne_do_26-104594-DO/filed/*.pdf`.

**As of 2026-08-04:** every private numbered filing markdown that maps to a
public PDF basename is **published** through **46** (incl. **41k**, **43-46**).
No private-only numbered filing gap detected by basename/`N_` prefix match.

High-water mark on public:

| Filing | Title (filename) | Public path | Status |
| --- | --- | --- | --- |
| 39 | Motion Appoint GAL for Plaintiff | `.../filed/39_Motion_Appoint_GAL_for_Plaintiff_2026-07-02.pdf` | published |
| 41k | ePraecipe Accepted GAL Capacity 8-26 | `.../filed/41k_ePraecipe_Accepted_GAL_Capacity_8-26_Hearing_2026-07-28.pdf` | published |
| 43 | Notice of Hearing GAL 8-26 | `.../filed/43_Notice_of_Hearing_GAL_8-26_2026-08-03.pdf` | published |
| 44 | Proof of Service GAL | `.../filed/44_Proof_of_Service_GAL_2026-08-03.pdf` | published |
| 45 | Consolidated NOH In Person 8-26 | `.../filed/45_Consolidated_Notice_of_Hearing_In_Person_8-26_2026-08-04.pdf` | published |
| 46 | Proof of Service NOH In Person | `.../filed/46_Proof_of_Service_NOH_In_Person_2026-08-04.pdf` | published |

Full directory: [wayne_do_26-104594-DO/filed/](../../wayne_do_26-104594-DO/filed/)
(~108 PDFs including exhibits, ePraecipes, opposing-side copies filed under
case tree).

## Death-hoax claim letters (evidence, not court filings)

VA EMMS best copies of false death-hoax notices. **PII review (Conrad 2026-08-04):**
cleared for public hosting; third-party names also appear on the .cc site and in
filed pleadings.

| Artifact | Public path | Status |
| --- | --- | --- |
| ClaimLetter-2026-05-04.pdf | `/assets/evidence/death_hoax_claim_letters/ClaimLetter-2026-05-04.pdf` | published (P2) |
| ClaimLetter-2026-06-29.pdf | `/assets/evidence/death_hoax_claim_letters/ClaimLetter-2026-06-29.pdf` | published (P2) |
| ClaimLetter-2026-06-29-2.pdf | `/assets/evidence/death_hoax_claim_letters/ClaimLetter-2026-06-29-2.pdf` | published (P2) |
| ClaimLetter-2026-07-16.pdf | `/assets/evidence/death_hoax_claim_letters/ClaimLetter-2026-07-16.pdf` | published (P2) |
| ClaimLetter-2026-07-27.pdf | `/assets/evidence/death_hoax_claim_letters/ClaimLetter-2026-07-27.pdf` | published (P2) |
| Index page | `/is-conrad-rockenhaus-dead/claim-letters/` | published (P2) |

Private source (still canonical for chain of custody notes):  
`rockenhaus-litigation/evidence/death_hoax_claim_letters/`.

## Other public evidence (not in case tree)

| Artifact | Path | Status |
| --- | --- | --- |
| AAdvantage account update email | `/assets/evidence/aadvantage-account-update-email-2026-06-10.pdf` | published |
| Retraction demand PDFs | under `/retractions/` | published |

## AI Search corpus

| Item | Location | Notes |
| --- | --- | --- |
| Page text corpus | `_corpus/` in this repo | Committed; verified in CI |
| R2 bucket | `rockenhaus-search-public` | Synced from `_corpus/` for search-mcp |
| Query Worker | `https://search.rockenhaus.net` | Widget on `/ask/` |

After adding new **filed** PDFs: regenerate site (`generate_site.py`), rebuild
corpus (`build-corpus.mjs`), commit, merge, then re-sync R2 + reindex AI Search.

## Handoff checklist (new filing PDF)

1. Private: build PDF from markdown (CI on private `main` or local).
2. PII scan (names, SSNs, account numbers, sealed exhibits).
3. Copy PDF into the correct public case folder (`filed/` / `opposing/` / `orders/`).
4. PR on this repo; CI green; merge.
5. Confirm Pages deploy + dual-host cache purge.
6. If corpus text is needed for answers/search: rebuild `_corpus` and re-sync search.

See [publish-runbook.md](./publish-runbook.md).
