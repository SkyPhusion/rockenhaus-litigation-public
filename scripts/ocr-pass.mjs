#!/usr/bin/env node
// Deliberate, reviewed OCR pass over the pages of the filed record that carry
// no text layer.
//
// WHY THIS IS A SEPARATE SCRIPT AND A COMMITTED CACHE
//
// OCR introduces transcription error into a litigation answer surface. It is
// therefore not part of the ordinary build: it runs when someone runs it, its
// output lands in _corpus/ocr-cache.json, and that cache is committed and
// reviewable in a diff. Ordinary builds and CI consume the cache and never run
// OCR, which also makes the corpus reproducible -- an engine version bump
// cannot silently rewrite the record under `build-corpus --check`.
//
// A cache entry is keyed by document slug and page and carries the sha256 of
// the source PDF, so refiling a document invalidates its OCR rather than
// leaving stale text attached to new pages.
//
// WHAT OCR TEXT IS AND IS NOT
//
// It is a machine transcription, good enough to make a scanned filing findable
// and to say what it is about. It is NOT a quotation. Real output from these
// documents interleaves vertical sidebar text into body lines ("8 V.", "z By:"),
// so a passage lifted from it can be wrong in ways that look plausible. Every
// OCR page is marked as OCR in the corpus and in the manifest, and
// scripts/verify-citations.mjs refuses a quoted citation to an OCR page.
//
// Usage:
//   node scripts/ocr-pass.mjs            # OCR every text-less page not cached
//   node scripts/ocr-pass.mjs --force    # redo, ignoring existing cache
//   node scripts/ocr-pass.mjs --limit 5  # first N pages, for a smoke run

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Lives in _data/, NOT _corpus/: build-corpus wipes _corpus on every run, so a
// cache stored there would be destroyed by the very build that consumes it.
const CACHE_PATH = join(ROOT, "_data", "ocr-cache.json");
const CASES_JSON = join(ROOT, "_data", "cases.json");

// Rasterisation DPI. 300 is the usual floor for reliable OCR of court scans.
const DPI = 300;

// Below this mean confidence the transcription is not trusted: the page keeps
// its "no text layer" stub and records that OCR was attempted and rejected.
// Chosen after measuring the real distribution across this corpus; see
// _corpus/coverage.json for the per-page confidences actually achieved.
export const MIN_CONFIDENCE = 60;

const FORCE = process.argv.includes("--force");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

const MIN_PAGE_CHARS = 20;

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) {
    return { _comment: "", engine: null, pages: {} };
  }
  return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
}

function flattenDocuments(cases) {
  const docs = [];
  for (const c of cases.cases) {
    for (const cat of c.categories) {
      for (const doc of cat.documents) {
        docs.push({
          slug: doc.url.replace(/^\/documents\//, "").replace(/\/$/, ""),
          title: doc.title,
          pdfUrl: doc.pdf_url,
        });
      }
    }
  }
  return docs;
}

function extractPages(absPdf) {
  const out = execFileSync("pdftotext", ["-layout", absPdf, "-"], {
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).toString("utf8");
  const pages = out.split("\f");
  if (pages.length > 1 && pages[pages.length - 1].trim() === "") pages.pop();
  return pages;
}

/** Rasterise one page to PNG and return its path inside `dir`. */
function rasterise(absPdf, pageNo, dir) {
  execFileSync(
    "pdftoppm",
    ["-r", String(DPI), "-png", "-f", String(pageNo), "-l", String(pageNo), absPdf, join(dir, "page")],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  const produced = readdirSync(dir).filter((f) => f.endsWith(".png"));
  if (!produced.length) throw new Error(`pdftoppm produced no image for page ${pageNo}`);
  return join(dir, produced[0]);
}

async function main() {
  if (!existsSync(CASES_JSON)) {
    console.error("ocr-pass: _data/cases.json missing. Run python3 scripts/generate_site.py first.");
    process.exit(1);
  }

  const { createWorker } = await import("tesseract.js");
  const tesseractVersion = JSON.parse(
    readFileSync(join(ROOT, "node_modules", "tesseract.js", "package.json"), "utf8"),
  ).version;

  const docs = flattenDocuments(JSON.parse(readFileSync(CASES_JSON, "utf8")));
  const cache = loadCache();
  cache.pages = cache.pages || {};

  // Find every page with no usable text layer.
  const targets = [];
  for (const doc of docs) {
    const absPdf = join(ROOT, doc.pdfUrl.replace(/^\//, ""));
    if (!existsSync(absPdf)) continue;
    const pages = extractPages(absPdf);
    const docSha = sha256(absPdf);
    pages.forEach((raw, i) => {
      const body = raw.replace(/\r/g, "").trim();
      if (body.length >= MIN_PAGE_CHARS) return;
      const key = `${doc.slug}/p${String(i + 1).padStart(3, "0")}`;
      const cached = cache.pages[key];
      if (!FORCE && cached && cached.source_sha256 === docSha) return;
      targets.push({ key, absPdf, docSha, pageNo: i + 1, title: doc.title });
    });
  }

  if (!targets.length) {
    console.log("ocr-pass: nothing to do; every text-less page is already cached for its current PDF.");
    return;
  }

  const todo = targets.slice(0, LIMIT);
  console.log(
    `ocr-pass: ${targets.length} page(s) without a text layer` +
      (todo.length < targets.length ? `, processing ${todo.length} (--limit)` : "") +
      `\n           engine tesseract.js ${tesseractVersion}, ${DPI} dpi, ` +
      `min confidence ${MIN_CONFIDENCE}\n`,
  );

  const worker = await createWorker("eng");
  let accepted = 0;
  let rejected = 0;

  try {
    for (const t of todo) {
      const dir = mkdtempSync(join(tmpdir(), "ocr-"));
      try {
        const png = rasterise(t.absPdf, t.pageNo, dir);
        const { data } = await worker.recognize(png);
        const confidence = Math.round(data.confidence);
        const text = data.text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
        const usable = confidence >= MIN_CONFIDENCE && text.length >= MIN_PAGE_CHARS;
        cache.pages[t.key] = {
          text: usable ? text : "",
          confidence,
          usable,
          chars: text.length,
          source_sha256: t.docSha,
          engine: "tesseract.js",
          engine_version: tesseractVersion,
          dpi: DPI,
        };
        if (usable) accepted += 1;
        else rejected += 1;
        console.log(
          `  ${usable ? "ok  " : "LOW "} ${t.key}  confidence ${confidence}  ${text.length} chars`,
        );
      } catch (err) {
        rejected += 1;
        cache.pages[t.key] = {
          text: "",
          confidence: 0,
          usable: false,
          chars: 0,
          error: String(err.message || err).slice(0, 200),
          source_sha256: t.docSha,
          engine: "tesseract.js",
          engine_version: tesseractVersion,
          dpi: DPI,
        };
        console.log(`  FAIL ${t.key}  ${String(err.message || err).slice(0, 80)}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await worker.terminate();
  }

  cache._comment =
    "OCR transcriptions for pages of the filed record that carry no text layer. " +
    "Committed deliberately: OCR introduces transcription error into a litigation " +
    "answer surface, so it runs as a reviewed pass rather than during a build, and " +
    "ordinary builds and CI consume this cache instead of re-running OCR. That also " +
    "makes the corpus reproducible: an engine version bump cannot silently rewrite " +
    "the record. Entries are keyed by document slug and page and carry the sha256 of " +
    "the source PDF, so refiling a document invalidates its OCR. `usable: false` means " +
    "OCR was attempted and the result was not trusted; that page keeps its no-text " +
    "stub. OCR text is NEVER quotable: verify-citations refuses a quoted citation to " +
    "an OCR page.";
  cache.engine = { name: "tesseract.js", version: tesseractVersion, dpi: DPI, min_confidence: MIN_CONFIDENCE };

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
  console.log(`\nocr-pass: ${accepted} accepted, ${rejected} rejected/low-confidence.`);
  console.log("Run `node scripts/build-corpus.mjs` to fold these into the corpus.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
