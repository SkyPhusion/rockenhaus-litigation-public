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

  return {
    // Stated in the artifact so a consumer can tell what it is holding without
    // being told out of band, and so a stale copy is recognisable as one.
    generated_from: "_corpus/manifest.json",
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
