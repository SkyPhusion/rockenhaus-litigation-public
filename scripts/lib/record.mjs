// The record layer: the single place that turns filed PDFs on disk into the
// document identities the rest of the site is built from.
//
// WHY THIS EXISTS. Until now this logic lived in scripts/generate_site.py, and
// three separate things depended on it: the Jekyll document pages, the corpus
// builder (via the _data/cases.json it emitted), and the IndexNow submission
// list. Deleting the Python without replacing it here would have taken the
// corpus builder down with it.
//
// THE CONTRACT THAT MATTERS. Slugs produced here MUST be byte-identical to the
// ones the Python produced, because /documents/<slug>/ URLs are cited in filed
// court documents. scripts/check-record-parity.mjs proves that against the 173
// slugs actually published today and fails the build on any drift. Every
// derivation below is a deliberate port of the Python, including the parts that
// look odd; where behaviour is subtle the Python source is quoted in a comment.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const COURTS = JSON.parse(readFileSync(join(ROOT, "_data", "courts.json"), "utf8"));

export const CASES = COURTS.cases;
export const CATEGORIES = COURTS.categories;

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

// Ported verbatim from generate_site.py humanize_filename().
const ACRONYMS = new Set([
  "PPO", "DO", "VA", "PD", "NOH", "RFA", "PII", "FCI", "USAA", "TRO",
  "MCR", "CC", "MC07", "BP", "POA", "TC", "COS", "EPRAECIPE", "EPRAECIPES",
  "FBI", "GAL",
]);

/**
 * Python str.capitalize(): first character upper, EVERY OTHER character lower.
 * JS has no equivalent, and the naive "upper the first char" version silently
 * preserves inner capitals, which would change 30-odd document headings.
 */
function pyCapitalize(word) {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/** Port of humanize_filename(). Turns a PDF filename into a document heading. */
export function humanizeFilename(name) {
  const stem = name.replace(/\.[^./]*$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const words = [];
  for (const word of stem.split(" ")) {
    const upper = word.toUpperCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(word)) words.push(word);
    else if (ACRONYMS.has(upper)) words.push(upper);
    else if (/^\d+[a-z]?$/i.test(word)) words.push(word);
    else words.push(pyCapitalize(word));
  }
  return words.join(" ");
}

/**
 * Port of the slug derivation. THE most URL-critical function in the repo.
 *
 *   slug = rel.with_suffix("").as_posix().lower().replace("/", "--").replace(" ", "-")
 *   slug = re.sub(r"[^a-z0-9\-]", "", slug)
 *   slug = re.sub(r"-+", "-", slug).strip("-")
 *
 * `relPath` is POSIX, relative to the repo root, e.g.
 * "wayne_do_26-104594-DO/filed/01_Answer_and_Counterclaim_2026-04-15.pdf".
 */
export function slugFor(relPath) {
  let slug = relPath.replace(/\.[^./]*$/, "").toLowerCase();
  slug = slug.split("/").join("--").split(" ").join("-");
  slug = slug.replace(/[^a-z0-9-]/g, "");
  slug = slug.replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return slug;
}

/**
 * Port of parse_filing_date(). Faithful to the Python: the filename is
 * tried completely before the heading, and a compact date whose month or day is
 * out of range does NOT return, it falls through to the next candidate text.
 *
 * Measured, not assumed: reversing the filename and heading order still passes
 * check-record-parity across the current 173 documents, because every heading is
 * derived from its own filename and so carries the same date substring. The
 * order is kept because it is what the Python did, not because this corpus
 * exercises it. A filename carrying no date of its own would exercise it.
 */
export function parseFilingDate(filename, heading) {
  for (const text of [filename, heading]) {
    const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const compact = text.match(/(\d{4})(\d{2})(\d{2})/);
    if (compact) {
      const month = Number(compact[2]);
      const day = Number(compact[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${compact[1]}-${compact[2]}-${compact[3]}`;
      }
    }
  }
  return null;
}

function walkPdfs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walkPdfs(abs, out);
    else if (entry.toLowerCase().endsWith(".pdf")) out.push(abs);
  }
  return out;
}

/**
 * Every filed document, derived from the PDFs on disk.
 *
 * Ordering matches `sorted(case_path.rglob("*.pdf"))`, which sorts Path objects
 * and therefore compares the full path string. /all-documents/ renders in this
 * order, so it is preserved rather than re-sorted to taste.
 */
export function loadDocuments() {
  const docs = [];
  for (const caseMeta of [...CASES].sort((a, b) => a.sort - b.sort)) {
    const caseDir = join(ROOT, caseMeta.id);
    if (!existsSync(caseDir)) continue;

    const pdfs = walkPdfs(caseDir)
      .map((abs) => relative(ROOT, abs).split("\\").join("/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const relPath of pdfs) {
      const parts = relPath.split("/");
      // `if len(parts) < 3: continue` -- a PDF loose in the case directory has
      // no category and is not published.
      if (parts.length < 3) continue;
      const category = parts[1];
      if (!CATEGORY_BY_ID.has(category)) continue;

      const filename = parts[parts.length - 1];
      const heading = humanizeFilename(filename);
      const slug = slugFor(relPath);

      docs.push({
        slug,
        title: heading,
        filename,
        url: `/documents/${slug}/`,
        pdf_url: `/${relPath}`,
        case_id: caseMeta.id,
        case_title: caseMeta.title,
        case_short_title: caseMeta.short_title,
        case_number: caseMeta.case_number,
        court: caseMeta.court,
        category,
        category_label: CATEGORY_BY_ID.get(category).label,
        filed_date: parseFilingDate(filename, heading),
      });
    }
  }
  return docs;
}

/** Cases with their documents grouped by category, category order from courts.json. */
export function loadCases(docs = loadDocuments()) {
  const byCase = new Map();
  for (const doc of docs) {
    if (!byCase.has(doc.case_id)) byCase.set(doc.case_id, []);
    byCase.get(doc.case_id).push(doc);
  }
  const out = [];
  for (const caseMeta of [...CASES].sort((a, b) => a.sort - b.sort)) {
    const caseDocs = byCase.get(caseMeta.id) || [];
    if (!caseDocs.length) continue;
    const categories = [];
    for (const cat of [...CATEGORIES].sort((a, b) => a.sort - b.sort)) {
      const inCat = caseDocs.filter((d) => d.category === cat.id);
      if (!inCat.length) continue;
      // Python: cat["documents"].sort(key=lambda d: d["filename"].lower())
      inCat.sort((a, b) => {
        const x = a.filename.toLowerCase();
        const y = b.filename.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
      });
      categories.push({ id: cat.id, label: cat.label, sort: cat.sort, documents: inCat });
    }
    out.push({ ...caseMeta, categories });
  }
  return out;
}

/** The most recent filing date across documents Conrad filed, and what landed that day. */
export function latestFilings(docs = loadDocuments()) {
  const dated = docs.filter((d) => d.category === "filed" && d.filed_date);
  if (!dated.length) return { date: null, groups: [] };
  const maxDate = dated.reduce((m, d) => (d.filed_date > m ? d.filed_date : m), dated[0].filed_date);
  const latest = dated.filter((d) => d.filed_date === maxDate);
  const groups = [];
  for (const caseMeta of [...CASES].sort((a, b) => a.sort - b.sort)) {
    const filings = latest
      .filter((d) => d.case_id === caseMeta.id)
      .sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0));
    if (filings.length) {
      groups.push({
        case_id: caseMeta.id,
        case_label: `${caseMeta.short_title} ${caseMeta.case_number}`,
        case_url: `/cases/${caseMeta.id}/`,
        filings,
      });
    }
  }
  return { date: maxDate, groups };
}
