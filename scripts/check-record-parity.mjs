#!/usr/bin/env node
// Proves the JS record layer reproduces the published record exactly.
//
// WHY. /documents/<slug>/ URLs are cited in filed court documents. The slug was
// derived by scripts/generate_site.py; it is now derived by scripts/lib/record.mjs.
// If those two disagree about even one character, a citation in a court filing
// stops resolving, and because this site answers 200 with the homepage for every
// unknown path, it would stop resolving SILENTLY.
//
// So this does not check that the new code is self-consistent. It checks it
// against artifacts the OLD code produced and that are live right now:
//
//   1. _documents/*.html   -- 173 pages the Python generated, committed to the
//                             repo, one per document, basename == slug, front
//                             matter carrying heading / pdf_path / filename /
//                             date_published / case_id / category.
//   2. _corpus/manifest.json -- 959 page records built from those same documents.
//
// Both are independent of the code under test. Drift in either direction fails.
//
// Usage: node scripts/check-record-parity.mjs

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadDocuments } from "./lib/record.mjs";

const problems = [];
const note = (msg) => problems.push(msg);

/** Front matter of a generated Jekyll document page, as a flat map. */
function frontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith(String.fromCharCode(34)) && value.endsWith(String.fromCharCode(34))) {
      value = value.slice(1, -1).replace(/\\"/g, String.fromCharCode(34)).replace(/\\\\/g, "\\");
    }
    out[kv[1]] = value;
  }
  return out;
}

const docs = loadDocuments();
const bySlug = new Map(docs.map((d) => [d.slug, d]));

// ---- 1. against the 173 committed Jekyll document pages -------------------
const docsDir = join(ROOT, "_documents");
if (!existsSync(docsDir)) {
  note("_documents/ is gone; the parity baseline no longer exists in the tree");
} else {
  const pages = readdirSync(docsDir).filter((f) => f.endsWith(".html")).sort();
  if (pages.length !== docs.length) {
    note(`document count drift: record layer produced ${docs.length}, _documents/ has ${pages.length}`);
  }
  for (const page of pages) {
    const slug = page.replace(/\.html$/, "");
    const doc = bySlug.get(slug);
    if (!doc) {
      note(`slug present in _documents/ but NOT produced by the record layer: ${slug}`);
      continue;
    }
    const fm = frontMatter(readFileSync(join(docsDir, page), "utf8"));
    if (!fm) {
      note(`${page}: unreadable front matter`);
      continue;
    }
    const expect = (field, was, now) => {
      if (was !== now) note(`${slug}: ${field} drift\n      published: ${JSON.stringify(was)}\n      record layer: ${JSON.stringify(now)}`);
    };
    expect("heading", fm.heading, doc.title);
    expect("pdf_path", fm.pdf_path, doc.pdf_url);
    expect("filename", fm.filename, doc.filename);
    expect("case_id", fm.case_id, doc.case_id);
    expect("category", fm.category, doc.category);
    expect("case_number", fm.case_number, doc.case_number);
    expect("court", fm.court, doc.court);
    expect("permalink", fm.permalink, doc.url);
    expect("date_published", fm.date_published ?? null, doc.filed_date);
  }
  for (const doc of docs) {
    if (!pages.includes(`${doc.slug}.html`)) {
      note(`record layer produced a slug with no published page: ${doc.slug}`);
    }
  }
}

// ---- 2. against the committed corpus --------------------------------------
const manifestPath = join(ROOT, "_corpus", "manifest.json");
if (!existsSync(manifestPath)) {
  note("_corpus/manifest.json missing; cannot cross-check the record layer");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const corpusDocs = new Map();
  for (const page of manifest.pages) {
    if (!corpusDocs.has(page.doc_slug)) {
      corpusDocs.set(page.doc_slug, {
        title: page.title,
        url: page.url,
        pdf_url: page.pdf_url,
        case_id: page.case_id,
        case_number: page.case_number,
        category: page.category,
        filed_date: page.filed_date,
      });
    }
  }
  if (corpusDocs.size !== docs.length) {
    note(`corpus covers ${corpusDocs.size} documents, record layer produced ${docs.length}`);
  }
  for (const [slug, corpus] of corpusDocs) {
    const doc = bySlug.get(slug);
    if (!doc) {
      note(`corpus has a document the record layer does not produce: ${slug}`);
      continue;
    }
    for (const field of ["title", "url", "pdf_url", "case_id", "case_number", "category"]) {
      if (corpus[field] !== doc[field === "title" ? "title" : field]) {
        note(`${slug}: corpus ${field} ${JSON.stringify(corpus[field])} != record layer ${JSON.stringify(doc[field])}`);
      }
    }
    const corpusDate = corpus.filed_date ?? null;
    if (corpusDate !== doc.filed_date) {
      note(`${slug}: corpus filed_date ${JSON.stringify(corpusDate)} != record layer ${JSON.stringify(doc.filed_date)}`);
    }
  }
}

if (problems.length) {
  console.error("::error::record parity FAILED; the rebuilt record does not match what is published");
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  process.exit(1);
}

console.log(
  `record parity OK: ${docs.length} documents match both the published Jekyll pages and the corpus ` +
    "(slug, heading, pdf path, filename, case, category, court, permalink, filed date)",
);
