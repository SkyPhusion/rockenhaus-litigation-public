# The interface the live search surface needs

What the frontend needs from the corpus and from an AI Search instance, written
as a contract so both sides can be built against it rather than against each
other.

**Written to be read cold.** If you were not part of the work that produced it,
everything you need is here. Figures are from the corpus as it stands, not from
an earlier draft, and where something is NOT supported that is stated rather
than left to be discovered.

Status: the contract is settled and the rulings are in. The widget is not built.

## 1. What the site is, in one paragraph

`rockenhaus.net` publishes the filed record of two Michigan divorce cases: Wayne
County 26-104594-DO and Washtenaw 26-737-DO. It publishes the documents
themselves and a set of pre-rendered question-and-answer pages that quote them.
Its whole claim is that it restates nothing: every answer is a quotation from a
filing, verified against the corpus at build time by
`scripts/verify-citations.mjs`, which fails the build if a quoted passage does
not appear on the page it is cited to.

A live search widget has to hold that claim, not weaken it.

## 2. The corpus as it stands

| | |
| --- | ---: |
| documents | 105 |
| corpus pages | 440 |
| native text, quotable | 404 |
| OCR text, never quotable | 29 |
| no text layer at all | 7 |

Pages are stored one file per page at `_corpus/<doc_slug>/pNNN.txt`, each with a
short provenance header, then `\n\n---\n\n`, then the page body.

A Wayne County PPO case and seven discovery documents were withdrawn from the
site on 2026-07-31 (scope and court-record status respectively), which is why
figures in older documents say 173 documents and 959 pages. If you find those
numbers anywhere, they are stale.

## 3. The unit of citation is a PAGE of a FILING

Not a document, not an arbitrary chunk. `(doc_slug, page)` is what the corpus is
keyed by, what `verify-citations` checks against, and what a citation in a court
filing looks like.

**One object per corpus page**, keyed exactly as the corpus already is:

```
<doc_slug>/p001.txt
<doc_slug>/p002.txt
```

440 objects across 105 documents. Do not concatenate documents into one object,
and do not let a chunker straddle a page boundary: a passage spanning two pages
cannot be cited to either without being wrong about one of them. A 1024-token
chunk holds a full page here, so the retrieval unit and the citation unit agree.

## 4. What a search result must return

Per hit, three things:

| field | type | why |
| --- | --- | --- |
| `doc_slug` | string | the document identity |
| `page` | integer, 1-based | the other half of the citation |
| `text` | string | the matched passage, verbatim |

Nothing else is required. If the object key comes back as `<doc_slug>/pNNN.txt`,
that is sufficient and the frontend parses it; a parsed key is better than a
metadata field, because a metadata field can drift from the key.

Title, URL, case number and filing date are **not** wanted from the search side.
They are derivable, and a second copy of a title is a second thing that can
disagree with the pre-rendered pages.

## 5. `/citations.json`, the derivation table

Built at build time from `_corpus/manifest.json` by `scripts/build-citations.mjs`
and served at `https://rockenhaus.net/citations.json`. 105 entries, **5.8 KB
gzipped**. Fetch once and hold; rendering a citation never needs a second round
trip, and a live citation and a pre-rendered one cannot drift because both read
this table.

```json
{
  "slug": "waynedo26-104594-do-filed-39motionappointgalforplaintiff2026-07-02",
  "title": "39 Motion Appoint GAL For Plaintiff 2026-07-02",
  "url": "/documents/waynedo26-104594-do-filed-39motionappointgalforplaintiff2026-07-02/",
  "pdf_url": "/wayne_do_26-104594-DO/filed/39_Motion_Appoint_GAL_for_Plaintiff_2026-07-02.pdf",
  "case_id": "wayne_do_26-104594-DO",
  "case_number": "26-104594-DO",
  "category": "filed",
  "frame": { "class": "allegation", "verb": "alleges", "source": "a party's filing" },
  "filed_date": "2026-07-02",
  "pages": 11,
  "ocr_pages": [4],
  "no_text_pages": []
}
```

## 6. THE FRAME RULE: the verb comes from this table, never from generation

"The motion filed 2026-07-02 alleges X" and "the court ordered X" are different
sentences with different weight, and that difference is the strongest signal a
court-record archive carries.

A generated sentence is a paraphrase, and a paraphrase **cannot be string-checked
the way a quotation can**. A sentence rendering "the court found X" against a
page that says "the motion alleges X" passes a citation-required rule while
saying something the record does not. That is worse than an uncited sentence,
because it launders the claim through a real source.

So the frame is looked up, never written:

| `category` | `class` | `verb` |
| --- | --- | --- |
| `filed` | allegation | alleges |
| `opposing` | allegation | alleges |
| `orders` | adjudication | ordered |
| unrecognised | unknown | records |

**Both parties' filings are framed identically, deliberately.** A motion is an
allegation whoever filed it. An archive that framed one side's motions as
"states" and the other's as "alleges" would be editorialising through grammar,
and it would collapse the archive framing exactly where it matters. Completeness
cuts both ways: filings adverse to the site's owner publish on the same terms as
everything else.

An unrecognised category falls back to a neutral verb rather than inheriting
"ordered". A test asserts that.

## 7. Pairing an allegation with its disposition is NOT supported

Ideally an allegation the site surfaces would be shown together with the
response or ruling that answered it. **The record as published cannot support
that**, and `/citations.json` says so in its own `framing.pairing` block rather
than leaving the absence to be discovered:

- 2 documents are in the `orders` category, and neither carries a filing date
- 19 opposing-party filings carry no date either
- nothing in the data links a motion to its disposition

Guessing the link from filename order would invent a relationship between court
documents, which is the opposite of what this archive is for. Pairing needs
curated links in the data, which is a content task, not a derivation.

## 8. Three page states, and two rules that bind at the INPUT

| `text_source` | pages | searchable | quotable | how a hit must render |
| --- | ---: | --- | --- | --- |
| `native` | 404 | yes | **yes** | quotation, with the citation |
| `ocr` | 29 | yes | **NO** | reference only: name the filing and page, do not reproduce the words |
| `none` | 7 | no, there is no text | no | cannot appear as a hit at all |

**OCR pages are never quoted**, and this is transcription fidelity rather than
content policy: OCR of these documents interleaves vertical margin text into
body lines, so a lifted passage can be wrong in ways that read perfectly
plausibly. `verify-citations` already refuses a quoted citation to an OCR page at
build time.

**The rule binds at the INPUT, not the output.** Keep OCR page text out of the
generation context entirely. A model handed OCR text will paraphrase it, and a
paraphrase of an imperfect transcription is the unquotable-source problem
wearing a citation. A render-time check cannot detect that; an input filter can.

`ocr_pages` and `no_text_pages` in `/citations.json` are what let the widget
enforce both rules client-side without trusting the search response.

## 9. One standing scope statement, always visible

Not four separate disclosures and not an empty-results message. A line that
appears only when there are no hits is the line nobody sees.

In a corpus presented as complete, silence reads as "not in the record". It is
not, on four axes, and the statement must cover all of them:

1. **7 pages carry no text layer** and cannot be returned by any text search.
2. **29 OCR pages** are searchable and citable but never quoted, on
   transcription-fidelity grounds.
3. **The exhibits at `/evidence/` are outside the search deliberately.** They are
   `noindex`, which is a statement that they are not for public discovery;
   surfacing them through the site's own search would reintroduce what `noindex`
   removed, through a different door. Search the record, not the presentation
   layer. This is enforced by the corpus allowlist rather than by policy: an
   index built from `_corpus/` excludes `/evidence/` structurally.
4. **The corpus has an as-of date.** Filings after it are not here yet.

That converts "presented as complete" from an implied representation into an
accurate one, which is the entire job of a scope statement.

## 10. Does the widget generate prose at all?

**Ruled: yes, but every generated sentence must carry a citation, and the widget
refuses to render one that does not.** That is "an unsourced claim is
unrepresentable" projected from the schema into the UI, so the widget cannot say
something the rest of the site structurally cannot.

**Amended after review**: citation-required is not citation-faithful. A
paraphrase can carry a valid citation and still misstate the cited page. Two
constraints therefore bind alongside it, and both are in section 6 and section 8:
the allegation-versus-adjudication verb comes from `/citations.json`, and OCR
text never reaches the generation context.

Generated output is framed visibly as machine-generated.

## 11. Build order

1. `/citations.json` at build time. **Done and live.**
2. Upload the 440 corpus pages to object storage, one object per page, keyed
   `<doc_slug>/pNNN.txt`. Not the frontend's task.
3. An AI Search instance over that bucket, returning key plus matched text.
   Not the frontend's task.
4. The widget. Frontend, gated on nothing now; the rulings in sections 6, 8, 9
   and 10 are settled.

Steps 2 and 3 do not block anything else: every `/answers/` page is static HTML
built from verified citations, which is what ranks. A client-rendered widget does
not rank and was never going to. It is additive.

## 12. One thing not to build against

The mechanism that configures which repositories a search index covers is being
retired as a secret and will change shape. Do not treat its current form as a
fixture. Nothing in this contract depends on it.
