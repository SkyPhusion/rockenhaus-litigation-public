# The interface the search widget needs

What the frontend needs from the R2 corpus and the AI Search instance, written
as a contract so the two sides can be built against it rather than against each
other. Requested by the lead: *"tell me what shape you need the corpus and the
citation payload in, because I would rather build it to your interface than hand
you mine."*

Status: proposal. Two questions in section 6 need Conrad, not the lead.

## 1. The property that has to survive

The site's whole claim is that it restates nothing. Every pre-rendered answer at
`/answers/` is a quotation from a filing, verified against the corpus at build
time by `scripts/verify-citations.mjs`, which fails the build if a quoted
passage does not appear on the page it is cited to.

A live widget that renders citations in a different shape, or with weaker
provenance, breaks that claim in the most visible place on the site. So the
requirement is not "the widget should look consistent". It is:

**A citation rendered by the widget must be indistinguishable from a citation
rendered by the pre-rendered pages, and must be subject to the same rules.**

Everything below follows from that one sentence.

## 2. The unit of citation is a PAGE of a FILING

Not a document, not an arbitrary chunk. `(doc_slug, page)` is what the corpus is
keyed by, what `verify-citations` checks against, and what a citation in a court
filing looks like. So:

**One R2 object per corpus page**, keyed exactly as `_corpus/` already is:

```
<doc_slug>/p001.txt
<doc_slug>/p002.txt
```

959 objects across 173 documents. Do not concatenate documents into one object
and do not let the chunker straddle a page boundary: a passage that spans two
pages cannot be cited to either without being wrong about one of them.

The file format is already what it needs to be. Each corpus page is a provenance
header, then `\n\n---\n\n`, then the page body. If the indexer takes the whole
file, retrieval may match on the header; if that turns out to hurt relevance,
strip the header at upload time and keep the key, since the key is the identity.

## 3. What I need back from a search result

Per hit, exactly three things:

| Field | Type | Why |
| --- | --- | --- |
| `doc_slug` | string | The document identity. Everything else is derivable from it. |
| `page` | integer, 1-based | The other half of the citation. |
| `text` | string | The matched passage, verbatim, unmodified. |

Nothing else is required. If the object key comes back as `key` or `id` in the
form `<doc_slug>/p007.txt`, that is sufficient and I will parse it; a parsed key
is strictly better than a metadata field that can drift from the key.

Score is welcome if it is available. Title, URL, case number and filing date are
**not** wanted from the search side: they are derivable, and a second copy of
them is a second thing that can disagree with the pre-rendered pages.

## 4. What I need from the build: `/citations.json`

The derivation table, emitted at build time from `_corpus/manifest.json`, which
already carries every field. This is mine to build; it is listed here so the
contract is complete.

```json
{
  "generated_from": "_corpus/manifest.json",
  "documents": [
    {
      "slug": "wayneppo26-102221-pp-filed-01motiontoterminateppocombined2026-03-12",
      "title": "01 Motion To Terminate PPO Combined 2026-03-12",
      "url": "/documents/wayneppo26-102221-pp-filed-01motiontoterminateppocombined2026-03-12/",
      "pdf_url": "/wayne_ppo_26-102221-PP/filed/01_Motion_to_Terminate_PPO_Combined_2026-03-12.pdf",
      "case_number": "26-102221-PP",
      "category": "filed",
      "filed_date": "2026-03-12",
      "pages": 14,
      "ocr_pages": [14],
      "no_text_pages": []
    }
  ]
}
```

173 entries, 73.9 KB raw and **8.2 KB gzipped**, measured. Small enough to fetch
once and hold, so the widget never needs a second round trip to render a
citation, and a citation cannot render differently from the pre-rendered pages
because both read the same table.

## 5. Three page states, not two

This is the part most likely to be got wrong, so it is stated as a table. The
corpus has three kinds of page and they have three different citation rules:

| `text_source` | Pages | Searchable | Quotable | How the widget must render a hit |
| --- | ---: | --- | --- | --- |
| `native` | 851 | yes | **yes** | Quotation, with the citation. |
| `ocr` | 77 | yes | **NO** | Reference only: name the filing and page, do not reproduce the words. |
| `none` | 31 | no, there is no text | no | Cannot appear as a hit at all. |

`ocr` is not a content-policy rule, it is transcription fidelity: OCR of these
documents interleaves vertical margin text into body lines, so a lifted passage
can be wrong in ways that read perfectly plausibly. `verify-citations` already
refuses a quoted citation to an OCR page. The widget must refuse it too, or the
live surface becomes the one place the rule does not apply.

`ocr_pages` and `no_text_pages` in `/citations.json` are what let the widget
enforce this client-side without trusting the search response.

**The 31 `none` pages need saying out loud.** They exist in the record and carry
no text, so no index built from text can return them. A user searching for
something that appears only on one of those pages gets silence, and silence
reads as "not in the record". Whatever the widget does, it must not imply that
absence from the search results means absence from the filings. My proposal:
a standing line under the results, always present, not only on empty results,
because a line that appears only when there are no hits is the line nobody sees.

## 6. Two questions that are Conrad's, not mine

**Q1. Does the widget render generated prose at all?**

This is the collision worth naming early. AI Search generates an answer. That
generated prose is, by construction, the site speaking: it is not a filing, not
served correspondence, and not an artifact. The attribution mechanism in
DESIGN.md section 5 has no slot for it, deliberately, and R1 was explicitly
ruled as widening what may be *sourced* without creating a site voice.

Three shapes, narrowest first:

  (a) **Retrieval only.** No generated prose. Ranked passages, each with its
      citation, rendered exactly as the pre-rendered pages render them.
      Perfectly consistent with the mechanism; a weaker product.
  (b) **Generated answer, every sentence cited.** The widget refuses to render
      any generated sentence that does not carry a citation, which is the
      "an unsourced claim is unrepresentable" rule projected into the widget
      instead of into the schema. Visibly framed as machine-generated.
  (c) **Free generated answer** with citations underneath.

I recommend **(b)**. It is the shape that keeps the widget under the same rule
as the rest of the site rather than beside it, and it is enforceable in the
frontend rather than being a matter of prompt wording. (c) puts uncited prose
about named people on a litigation site, which is the thing the whole redesign
exists to stop.

**Q2. Does the widget search the exhibits?**

`/evidence/` is `noindex` by design. The exhibits are not in the corpus today
and I am not proposing they go in. Worth an explicit answer rather than a silent
omission, because "the search does not cover the exhibits" is a fact a user
should be told rather than discover.

## 7. What is not blocked by any of this

Nothing in the pre-rendered architecture. Every `/answers/` page is static HTML
built from verified citations, which is what ranks; a client-rendered widget
does not rank and was never going to. The widget is additive. If the R2 bucket
and the AI Search instance are not ready, the site is unchanged.

Concretely, in dependency order:

1. `/citations.json` at build time. Mine. Needs nothing from anyone.
2. R2 upload of the 959 corpus pages, one object per page, keyed
   `<doc_slug>/pNNN.txt`. Not mine.
3. AI Search instance over that bucket, returning key plus matched text.
   Not mine.
4. The widget. Mine, and gated on Q1.

Steps 1 and 2 can happen in parallel today. Step 4 should not start before Q1
is answered, because (a), (b) and (c) are different components, not the same
component with a flag.
