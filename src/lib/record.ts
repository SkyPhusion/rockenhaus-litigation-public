// The record, as the Astro pages see it.
//
// Thin wrapper over scripts/lib/record.mjs (the shared derivation, proven
// identical to the retired Python by scripts/check-record-parity.mjs) plus the
// per-page text held in _corpus/.
//
// The principle this file exists to hold: the site is a PROJECTION of the filed
// record. A filing appears on the site because it is in the corpus, never
// because someone remembered to add it to a list. There is deliberately no way
// here to publish a document page for something that is not a filed document.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  loadDocuments,
  loadCases,
  latestFilings,
  CASES,
  CATEGORIES,
} from "../../scripts/lib/record.mjs";
import type { RecordDocument, RecordCase, LatestFilingGroup } from "../../scripts/lib/record.mjs";

export { loadDocuments, loadCases, latestFilings, CASES, CATEGORIES };
export type { RecordDocument, RecordCase, LatestFilingGroup };

interface CorpusPageRecord {
  key: string;
  doc_slug: string;
  page: number;
  total_pages: number;
  has_text: boolean;
  text_source: "native" | "ocr" | "none";
  ocr_confidence: number | null;
}

/** One page of a filing, as rendered on a document page. */
export interface DocumentPageText {
  page: number;
  /** "native" is extractable text from the PDF. "ocr" is a machine transcription. */
  source: "native" | "ocr" | "none";
  ocr_confidence: number | null;
  /** Body text with the corpus header stripped. Empty when there is no text. */
  text: string;
}

const manifestPath = join(ROOT, "_corpus", "manifest.json");
const corpusPages: CorpusPageRecord[] = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, "utf8")).pages as CorpusPageRecord[])
  : [];

const bySlug = new Map<string, CorpusPageRecord[]>();
for (const page of corpusPages) {
  if (!bySlug.has(page.doc_slug)) bySlug.set(page.doc_slug, []);
  bySlug.get(page.doc_slug)!.push(page);
}
for (const pages of bySlug.values()) pages.sort((a, b) => a.page - b.page);

// The corpus writer emits a metadata header, then this exact separator, then
// the page text. Splitting on the separator rather than counting header lines
// means an added header field cannot silently shift the slice into the body.
// See the `content` assembly in scripts/build-corpus.mjs.
const CORPUS_SEPARATOR = "\n\n---\n\n";

/**
 * The OCR notice the corpus prepends to a machine-transcribed page. It is
 * stripped here and re-rendered as a visible warning attached to the page,
 * rather than left inline where it reads as part of the filing.
 */
const OCR_NOTICE_HEAD = "MACHINE TRANSCRIPTION (OCR)";
const NO_TEXT_HEAD = "NO TEXT LAYER ON THIS PAGE.";

function bodyOf(raw: string): string {
  const at = raw.indexOf(CORPUS_SEPARATOR);
  return at === -1 ? raw : raw.slice(at + CORPUS_SEPARATOR.length);
}

/** Every page of a filing, in order, with its text and how that text was obtained. */
export function pagesFor(slug: string): DocumentPageText[] {
  const records = bySlug.get(slug) ?? [];
  return records.map((record) => {
    const abs = join(ROOT, "_corpus", record.key);
    let text = existsSync(abs) ? bodyOf(readFileSync(abs, "utf8")).trimEnd() : "";
    if (text.startsWith(OCR_NOTICE_HEAD) || text.startsWith(NO_TEXT_HEAD)) {
      // Drop the boilerplate paragraph; the page renders its own notice from
      // `source` and `ocr_confidence`, which cannot drift from the manifest.
      const at = text.indexOf(CORPUS_SEPARATOR.trim());
      const firstBlank = text.indexOf("\n\n");
      const cut = at !== -1 ? at : firstBlank;
      text = cut === -1 ? "" : text.slice(cut).trimStart();
      if (record.text_source === "none") text = "";
      else {
        // Strip the remaining explanatory sentences of the notice, which end at
        // the last line of the boilerplate block.
        const marker = "open the linked PDF for the actual text.";
        const end = text.indexOf(marker);
        if (end !== -1) text = text.slice(end + marker.length).trimStart();
      }
    }
    return {
      page: record.page,
      source: record.text_source,
      ocr_confidence: record.ocr_confidence,
      text,
    };
  });
}

/** Page-level text coverage for one filing, for the note shown on its page. */
export function coverageFor(slug: string): {
  total: number;
  native: number;
  ocr: number;
  none: number;
} {
  const records = bySlug.get(slug) ?? [];
  return {
    total: records.length,
    native: records.filter((r) => r.text_source === "native").length,
    ocr: records.filter((r) => r.text_source === "ocr").length,
    none: records.filter((r) => r.text_source === "none").length,
  };
}

/** Corpus-wide coverage, for the record note on the index. */
export function corpusCoverage(): Record<string, unknown> | null {
  const path = join(ROOT, "_corpus", "coverage.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function documentCount(): number {
  return loadDocuments().length;
}
