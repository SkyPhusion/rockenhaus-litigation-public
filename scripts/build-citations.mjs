#!/usr/bin/env node
// The citation lookup table the live search surface renders from.
//
// Usage: node scripts/build-citations.mjs [--check]
//
// WHY THIS FILE EXISTS AT ALL, since the data is already in the repository.
//
// Every pre-rendered answer at /answers/ cites a filing by (document, page) and
// is verified against the corpus at build time. A live search widget will cite
// the same corpus. If it derives the title, URL and case number of a filing
// from anything OTHER than what the pre-rendered pages derive them from, the
// two will eventually disagree, and the disagreement will be invisible: both
// look like citations, and only one is right.
//
// So the widget gets a table built from _corpus/manifest.json, the same file
// the pre-rendered pages are built from. The search index is then only asked
// for the two fields that identify a page, doc_slug and page number, and never
// for anything derivable. There is no second copy of a filing's title anywhere,
// which is the only way two surfaces cannot drift.
//
// THREE PAGE STATES, NOT TWO. This is the part that is easy to get wrong:
//
//   native  851 pages  quotable
//   ocr      77 pages  searchable and citable, NEVER quotable, because OCR of
//                      these documents interleaves vertical margin text into
//                      body lines and a lifted passage can be wrong in ways
//                      that read perfectly plausibly
//   none     31 pages  NO TEXT AT ALL, so no text index can ever return them
//
// The 31 matter more than their count suggests. They are in the record and
// invisible to search, and silence in a result list reads as "not in the
// record". The widget has to say so, always, not only when a search comes back
// empty, and it cannot say so unless this table tells it which pages they are.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "_corpus", "manifest.json");
const OUT = join(ROOT, "public", "citations.json");

/**
 * How a citation to this document may be FRAMED, derived from its category.
 *
 * WHY THE VERB IS DATA. "The motion filed 2026-07-02 alleges X" and "the court
 * ordered X" are different sentences with different weight, and the difference
 * is the strongest signal a court-record archive carries. If the verb comes
 * from whoever wrote the answer, or from a model generating live, it will
 * eventually drift: a paraphrase can carry a perfectly valid citation and still
 * say the record found something it merely alleges. That failure is worse than
 * an uncited sentence, because it launders the claim through a real source.
 *
 * So the frame is looked up, never written. A renderer, pre-rendered or live,
 * asks this table what kind of document it is citing and takes the verb from
 * here.
 *
 * SYMMETRY IS DELIBERATE. `filed` (this site owner's filings) and `opposing`
 * (the other party's) get the SAME class and the SAME verb. A motion is an
 * allegation whoever filed it, and an archive that framed one side's motions
 * as "states" and the other's as "alleges" would be editorialising through
 * grammar. Completeness has to cut both ways or the archive framing collapses
 * exactly where it matters.
 */
const FRAMES = {
  filed: { class: "allegation", verb: "alleges", source: "a party's filing" },
  opposing: { class: "allegation", verb: "alleges", source: "a party's filing" },
  discovery: { class: "allegation", verb: "states", source: "discovery served between the parties" },
  orders: { class: "adjudication", verb: "ordered", source: "an order of the court" },
};

export function frameFor(category) {
  return FRAMES[category] ?? { class: "unknown", verb: "records", source: "a document in the record" };
}

/** Corpus pages grouped into the per-document shape the widget reads. */
export function buildTable(pages) {
  const byDoc = new Map();

  for (const page of pages) {
    let doc = byDoc.get(page.doc_slug);
    if (!doc) {
      doc = {
        slug: page.doc_slug,
        title: page.title,
        url: page.url,
        pdf_url: page.pdf_url,
        case_id: page.case_id,
        case_number: page.case_number,
        category: page.category,
        frame: frameFor(page.category),
        filed_date: page.filed_date,
        pages: page.total_pages,
        ocr_pages: [],
        no_text_pages: [],
      };
      byDoc.set(page.doc_slug, doc);
    }
    if (page.text_source === "ocr") doc.ocr_pages.push(page.page);
    else if (page.text_source === "none") doc.no_text_pages.push(page.page);
  }

  const documents = [...byDoc.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const doc of documents) {
    doc.ocr_pages.sort((a, b) => a - b);
    doc.no_text_pages.sort((a, b) => a - b);
  }

  const counts = { native: 0, ocr: 0, none: 0 };
  for (const page of pages) counts[page.text_source] = (counts[page.text_source] ?? 0) + 1;

  const byClass = {};
  for (const doc of documents) byClass[doc.frame.class] = (byClass[doc.frame.class] ?? 0) + 1;

  return {
    // Stated in the artifact so a consumer can tell what it is holding without
    // being told out of band, and so a stale copy is recognisable as one.
    generated_from: "_corpus/manifest.json",
    framing: {
      rule: "The allegation-or-adjudication frame comes from the document's category, never from prose.",
      classes: byClass,
      pairing: {
        supported: false,
        why: [
          "Pairing an allegation with the ruling that answered it cannot be derived",
          "from this corpus. There are 2 documents in the `orders` category, and",
          "neither carries a filing date; 19 opposing-party filings carry none",
          "either. There is no field linking a motion to its disposition and no",
          "date arithmetic that could stand in for one.",
          "",
          "Guessing the link from filename order would be inventing a relationship",
          "between court documents, which is the opposite of what this archive is",
          "for. Pairing needs curated links in the data, which is a content task.",
          "",
          "Stated here so a consumer knows the absence is a limit of the record as",
          "published, not an oversight in the table.",
        ],
      },
    },
    citation_unit: "document page",
    object_key_format: "<slug>/pNNN.txt",
    page_states: {
      native: "quotable",
      ocr: "searchable and citable, never quotable",
      none: "no text layer; cannot be returned by a text index at all",
    },
    totals: {
      documents: documents.length,
      pages: pages.length,
      native_pages: counts.native,
      ocr_pages: counts.ocr,
      no_text_pages: counts.none,
    },
    documents,
  };
}

/** The R2 object key for a cited page, and the inverse the widget needs. */
export function objectKeyFor(slug, page) {
  return `${slug}/p${String(page).padStart(3, "0")}.txt`;
}

export function parseObjectKey(key) {
  const m = /^(.+)\/p(\d+)\.txt$/.exec(key);
  return m ? { slug: m[1], page: Number(m[2]) } : null;
}

function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`build-citations: no corpus manifest at ${MANIFEST}. Run \`npm run corpus\` first.`);
    process.exit(1);
  }

  const { pages } = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (!Array.isArray(pages) || pages.length === 0) {
    console.error("build-citations: the corpus manifest has no pages. Refusing to write an empty table.");
    process.exit(1);
  }

  const table = buildTable(pages);
  const json = JSON.stringify(table, null, 2) + "\n";

  if (process.argv.includes("--check")) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
    if (current !== json) {
      console.error("build-citations --check: public/citations.json is stale or missing. Run `npm run citations`.");
      process.exit(1);
    }
    console.log(`build-citations --check: current (${table.totals.documents} documents).`);
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json, "utf8");
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(
    `build-citations: ${table.totals.documents} documents, ${table.totals.pages} pages ` +
      `(${table.totals.native_pages} native, ${table.totals.ocr_pages} ocr, ` +
      `${table.totals.no_text_pages} no text) -> ${OUT}, ${kb} KB`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
