# R4: what the record does and does not source

Handover note for whoever picks up R2, R4 and R5. Written so you do not have to
re-derive this, and so you do not repeat the near-miss in section 3.

Ruling R4, from the lead on Conrad's delegation: **restate as filing-sourced, and
do not add a fifth attribution kind.** If an assertion appears in a filing, cite
the filing. If it appears in no filing, it does not go on the page.

## 1. The finding

On `/is-conrad-rockenhaus-dead/`, two claims sit close together and only one of
them is sourced.

**Sourced, thoroughly.** The death-hoax emails of 2026-05-09: that they were
sent, from what address, what they said, and that they harassed a named witness.
This appears in filed motions and is reproduced as Exhibit 6. Seven corpus pages
across five documents carry the subject line; thirty-four pages across sixteen
documents discuss the related "dead man's switch" post.

Restate this material with citations. It is exactly what R4 asks for.

**Not sourced anywhere in the published record.** That the opposing party
**created or registered** the two `conradrockenhausisdead` domains. Zero corpus
pages support it, in any spelling.

"Emails were sent" and "she created the domains" are different assertions. Only
the first is in a filing.

## 2. The ruling on it, and how to write the removal

**The sentence attributing the domains to her comes off.** The lead's reasoning,
recorded so it is not relitigated:

Removal is reversible; publication is not. This site is CC0 and mirror-friendly
by design, so once a page is mirrored it cannot be unpublished. When one
direction is reversible and the other is permanent, take the reversible one.

**Write the removal so restoring it is a citation away, not an archaeology
project.** If a source turns up, a filing, a discovery response, or a registrar
record, the sentence goes back with a citation rather than being reconstructed.
Leave the surrounding prose intact and structured so a cited version drops in.

The email-sourced material is unaffected.

## 3. The trap, which cost nothing here only because it was caught

Searching the corpus for `conradrockenhausisdead` returns **zero pages**. That
result is wrong, and acting on it would have meant recommending the deletion of
well-sourced content from a court record.

The corpus is `pdftotext` output. A domain name wraps across lines, spaces out,
or is written as prose in the original document. Searching for
`conrad\s*rockenhaus\s*is\s*dead` instead returns **seven pages across five
documents**.

**The extracted text is not the document, and a miss in extracted text is not
absence.** Before concluding that the record does not support something:

- search variants, not just the literal string: spaced, wrapped, hyphenated,
  and the phrase as prose rather than as an identifier
- search the concept as well as the token, for example "declared him dead" or
  "dead man's switch" rather than only a domain name
- remember that 29 corpus pages are OCR and 7 have no text layer at all, so
  some pages cannot be searched even in principle. `npm run pii` prints that
  inventory and names the seven unreadable pages
- treat a zero result on a claim you are about to delete as a prompt to look
  harder, not as an answer

## 4. One conclusion already foreclosed

The domain-creation claim was **never** sourced, including at refs from before
the Wayne County PPO case and the discovery documents were withdrawn on
2026-07-31. Checked at the pre-removal commits.

So this is not a case of the site having removed its own sourcing. Do not spend
time reconstructing whether a withdrawn document carried it; it did not.

## 5. What else is still open

- **R2**: collapse the four domain hub pages into `/disputed-domains/` rows with
  citations. Feasible and well sourced: `rockenhaus.com` 63 corpus pages,
  `skyphusion.com` 23, `lawflaws` 6, `fitspo` 6, `adezero.com` 6.
- **R5**: drop the standalone `/retractions/rob-hein/` page, keeping the served
  PDF and the fact of service. Note that removing a published URL needs a
  retirement entry in `_data/retired_urls.json` and a 404 rule in
  `public/_redirects`, or the baseline gate fails. It is meant to.
- The standing scope statement, specified in
  [`docs/search/AI-SEARCH-INTERFACE.md`](../search/AI-SEARCH-INTERFACE.md)
  section 9, still needs rendering on the site.
