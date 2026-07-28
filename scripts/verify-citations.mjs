#!/usr/bin/env node
// Prove every Q&A citation against the corpus.
//
// The Q&A pages quote the filings; they do not generate prose about them. That
// only means something if the quotes are real, so this script asserts, for each
// citation, that the quoted passage ACTUALLY APPEARS on the cited page of the
// cited filing. A quote that was mistyped, drifted after a refiling, or invented
// fails the build instead of shipping as a citation to a court document.
//
// Whitespace is normalised on both sides before comparing: pdftotext -layout
// preserves column alignment, so a passage that reads as one sentence on the
// page is full of runs of spaces and hard line breaks in the extracted text.
// Normalising is what lets a human quote naturally. Nothing else is relaxed --
// the words and their order must match exactly.
//
// Usage: node scripts/verify-citations.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "_corpus");
const QUESTIONS = join(ROOT, "_data", "qa_questions.json");

/** Collapse all whitespace runs to single spaces and lowercase for comparison. */
export function normalise(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The body of a corpus page, with the provenance header stripped. */
export function pageBody(raw) {
  const marker = "\n\n---\n\n";
  const at = raw.indexOf(marker);
  return at === -1 ? raw : raw.slice(at + marker.length);
}

export function verifyCitation(citation, readPage) {
  const key = `${citation.doc_slug}/p${String(citation.page).padStart(3, "0")}.txt`;
  const raw = readPage(key);
  if (raw == null) {
    return { ok: false, key, reason: "cited page does not exist in the corpus" };
  }
  const body = normalise(pageBody(raw));
  const quote = normalise(citation.quote);
  if (!body.includes(quote)) {
    return { ok: false, key, reason: "quoted passage does not appear on the cited page" };
  }
  return { ok: true, key };
}

function main() {
  if (!existsSync(QUESTIONS)) {
    console.error("verify-citations: _data/qa_questions.json is missing");
    process.exit(1);
  }
  if (!existsSync(CORPUS)) {
    console.error(
      "verify-citations: _corpus/ is missing. Run `node scripts/build-corpus.mjs` first.",
    );
    process.exit(1);
  }

  const { questions } = JSON.parse(readFileSync(QUESTIONS, "utf8"));
  const readPage = (key) => {
    const abs = join(CORPUS, key);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  };

  let checked = 0;
  const failures = [];
  for (const q of questions) {
    for (const c of q.citations) {
      checked += 1;
      const result = verifyCitation(c, readPage);
      if (!result.ok) {
        failures.push(`  [${q.id}] ${result.key}: ${result.reason}\n      quote: "${c.quote.slice(0, 90)}..."`);
      }
    }
  }

  if (failures.length) {
    console.error(`verify-citations: ${failures.length} of ${checked} citations FAILED\n`);
    failures.forEach((f) => console.error(f));
    console.error(
      "\nEvery Q&A answer is a quotation from the filed record. A citation that does not\n" +
        "match the record is not publishable. Fix the quote or the page reference.",
    );
    process.exit(1);
  }

  console.log(`verify-citations: ${checked} citations verified against the corpus.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
