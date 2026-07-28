#!/usr/bin/env node
// Build the AI Search corpus from the filed court PDFs.
//
// One object per PAGE, so the R2 object key IS the citation:
//
//     _corpus/<doc_slug>/p001.txt
//
// Citations are then derived from retrieval metadata (chunk.item.key), never
// from model output. A model cannot hallucinate a citation it did not author.
//
// Slugs are NOT recomputed here. They are read from _data/cases.json, which
// scripts/generate_site.py owns. Two implementations of one slug rule is a
// drift defect waiting to happen; there is exactly one implementation and this
// script consumes it.
//
// Usage:  node scripts/build-corpus.mjs [--check]
//         --check  verify the committed corpus matches the PDFs; do not write.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = join(ROOT, "_corpus");
const CASES_JSON = join(ROOT, "_data", "cases.json");
const SITE_URL = "https://rockenhaus.net";

// A page needs more than a stray artifact character to count as having text.
// Scanned pages routinely yield a handful of whitespace or noise characters.
const MIN_PAGE_CHARS = 20;

const CHECK_ONLY = process.argv.includes("--check");

function fail(msg) {
  console.error(`build-corpus: ${msg}`);
  process.exit(1);
}

function loadCases() {
  if (!existsSync(CASES_JSON)) {
    fail(
      "_data/cases.json is missing. Run `python3 scripts/generate_site.py` first; " +
        "it owns the canonical document slugs this script consumes.",
    );
  }
  return JSON.parse(readFileSync(CASES_JSON, "utf8"));
}

/** Every document, flattened, with the case + category context it needs. */
function flattenDocuments(cases) {
  const docs = [];
  for (const c of cases.cases) {
    for (const cat of c.categories) {
      for (const doc of cat.documents) {
        const slug = doc.url.replace(/^\/documents\//, "").replace(/\/$/, "");
        docs.push({
          slug,
          title: doc.title,
          filename: doc.filename,
          url: doc.url,
          pdfUrl: doc.pdf_url,
          caseId: c.id,
          caseTitle: c.title,
          caseNumber: c.case_number,
          court: c.court,
          category: cat.id,
          categoryLabel: cat.label,
        });
      }
    }
  }
  return docs;
}

/** pdftotext -layout, split on the form feed it emits at each page break. */
function extractPages(absPdf) {
  let out;
  try {
    out = execFileSync("pdftotext", ["-layout", absPdf, "-"], {
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8");
  } catch (err) {
    fail(`pdftotext failed on ${absPdf}: ${err.message}`);
  }
  const pages = out.split("\f");
  // A trailing form feed yields a final empty element that is not a page.
  if (pages.length > 1 && pages[pages.length - 1].trim() === "") pages.pop();
  return pages;
}

function parseFilingDate(filename, title) {
  for (const text of [filename, title]) {
    const iso = /(\d{4}-\d{2}-\d{2})/.exec(text);
    if (iso) return iso[1];
  }
  return null;
}

/**
 * The header prefixed to every page object. It gives the retriever document
 * identity even when a chunk lands mid-page, and it is what makes a returned
 * chunk self-describing in the widget.
 */
function pageHeader(doc, pageNo, totalPages, filedDate) {
  const lines = [
    `Document: ${doc.title}`,
    `Case: ${doc.caseTitle}, Case No. ${doc.caseNumber}`,
    `Court: ${doc.court}`,
    `Category: ${doc.categoryLabel}`,
  ];
  if (filedDate) lines.push(`Filed: ${filedDate}`);
  lines.push(`Page: ${pageNo} of ${totalPages}`);
  lines.push(`Source: ${SITE_URL}${doc.url}`);
  lines.push(`PDF: ${SITE_URL}${doc.pdfUrl}`);
  return lines.join("\n");
}

const NO_TEXT_STUB = [
  "NO TEXT LAYER ON THIS PAGE.",
  "",
  "This page of the filing is a scanned image and carries no extractable text.",
  "The page exists in the filed record and may be responsive to a question, but",
  "its contents cannot be quoted from this archive. Open the linked PDF to read it.",
].join("\n");

function main() {
  const cases = loadCases();
  const docs = flattenDocuments(cases);
  if (!docs.length) fail("no documents found in _data/cases.json");

  if (!CHECK_ONLY) {
    rmSync(CORPUS_DIR, { recursive: true, force: true });
    mkdirSync(CORPUS_DIR, { recursive: true });
  }

  const manifest = [];
  let totalPages = 0;
  let textPages = 0;
  let totalChars = 0;
  const noTextDocs = [];
  const partialDocs = [];
  const drift = [];

  for (const doc of docs) {
    const absPdf = join(ROOT, doc.pdfUrl.replace(/^\//, ""));
    if (!existsSync(absPdf)) fail(`PDF referenced by cases.json is missing: ${doc.pdfUrl}`);

    const pages = extractPages(absPdf);
    const filedDate = parseFilingDate(doc.filename, doc.title);
    let docTextPages = 0;

    pages.forEach((raw, i) => {
      const pageNo = i + 1;
      const body = raw.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
      const hasText = body.length >= MIN_PAGE_CHARS;
      if (hasText) {
        docTextPages += 1;
        totalChars += body.length;
      }
      const key = `${doc.slug}/p${String(pageNo).padStart(3, "0")}.txt`;
      const content =
        pageHeader(doc, pageNo, pages.length, filedDate) +
        "\n\n---\n\n" +
        (hasText ? body : NO_TEXT_STUB) +
        "\n";

      const absOut = join(CORPUS_DIR, key);
      if (CHECK_ONLY) {
        if (!existsSync(absOut)) {
          drift.push(`missing: ${key}`);
        } else if (readFileSync(absOut, "utf8") !== content) {
          drift.push(`changed: ${key}`);
        }
      } else {
        mkdirSync(dirname(absOut), { recursive: true });
        writeFileSync(absOut, content, "utf8");
      }

      manifest.push({
        key,
        doc_slug: doc.slug,
        title: doc.title,
        url: doc.url,
        pdf_url: doc.pdfUrl,
        case_id: doc.caseId,
        case_number: doc.caseNumber,
        category: doc.category,
        filed_date: filedDate,
        page: pageNo,
        total_pages: pages.length,
        has_text: hasText,
      });
    });

    totalPages += pages.length;
    textPages += docTextPages;
    if (docTextPages === 0) noTextDocs.push(doc.url);
    else if (docTextPages < pages.length) {
      partialDocs.push({ url: doc.url, text_pages: docTextPages, total_pages: pages.length });
    }
  }

  const coverage = {
    generated_from: "scripts/build-corpus.mjs",
    extractor: "pdftotext -layout (poppler)",
    documents: docs.length,
    total_pages: totalPages,
    pages_with_text: textPages,
    pages_without_text: totalPages - textPages,
    coverage_pct: Number(((textPages / totalPages) * 100).toFixed(1)),
    total_chars: totalChars,
    documents_with_no_text_layer: noTextDocs,
    documents_partially_scanned: partialDocs,
  };

  if (CHECK_ONLY) {
    const manifestPath = join(CORPUS_DIR, "manifest.json");
    if (!existsSync(manifestPath)) drift.push("missing: manifest.json");
    if (drift.length) {
      console.error("build-corpus --check: committed corpus does not match the PDFs.");
      drift.slice(0, 20).forEach((d) => console.error(`  ${d}`));
      if (drift.length > 20) console.error(`  ... and ${drift.length - 20} more`);
      console.error("Run `node scripts/build-corpus.mjs` and commit the result.");
      process.exit(1);
    }
    console.log(`build-corpus --check: corpus matches (${manifest.length} pages).`);
    return;
  }

  writeFileSync(
    join(CORPUS_DIR, "manifest.json"),
    JSON.stringify({ pages: manifest }, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(
    join(CORPUS_DIR, "coverage.json"),
    JSON.stringify(coverage, null, 2) + "\n",
    "utf8",
  );

  console.log(`Documents:        ${coverage.documents}`);
  console.log(`Pages:            ${coverage.total_pages}`);
  console.log(`Pages with text:  ${coverage.pages_with_text} (${coverage.coverage_pct}%)`);
  console.log(`Pages w/o text:   ${coverage.pages_without_text}`);
  console.log(`Text extracted:   ${(coverage.total_chars / 1048576).toFixed(2)} MB`);
  console.log(`Fully scanned:    ${noTextDocs.length} documents`);
  console.log(`Partially scanned:${partialDocs.length} documents`);
}

main();
