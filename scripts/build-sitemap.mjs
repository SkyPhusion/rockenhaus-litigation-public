#!/usr/bin/env node
// Build /sitemap.xml from the MERGED site, after both generators have run.
//
// Usage: node scripts/build-sitemap.mjs <builtDir> [--baseline <file>]
//
// THREE DEFECTS THIS FIXES, all measured on the live sitemap on 2026-07-31.
//
// 1. /answers/ was absent. jekyll-sitemap runs inside the Jekyll build, which
//    happens BEFORE dist/ is merged in, so it structurally cannot see the Astro
//    half. 367 <loc> entries, not one under /answers/. The one surface built to
//    be quoted by an answer engine was the one surface never advertised. This
//    runs after the merge, so it sees whatever is actually being deployed.
//
// 2. Every lastmod was the deploy timestamp. All 349 of them were the SAME
//    value, 2026-07-28T03:43:22+00:00, because they came from file mtimes in a
//    fresh CI checkout. That tells a search engine the entire court record
//    changed at one instant, on every deploy. lastmod here comes from the
//    filing date in the record, so it is either true or absent. 111 of 173
//    documents carry a filed date; the other 62, mostly exhibits, get no
//    lastmod rather than a fabricated one. Absent is valid; wrong is not.
//
// 3. Retired URLs could reappear. Exclusion now comes from
//    _data/retired_urls.json, the same file public/_redirects is checked
//    against, so a path cannot be 404 in one place and advertised in another.
//
// The design rule: this generator OWNS no list. It walks the built artifact and
// each page declares its own indexability through the robots meta it already
// carries. A page that is not built cannot be listed; a page that is built
// cannot be forgotten.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectIndexable, absolute, encodePath, retiredPaths } from "./lib/site-urls.mjs";
import { loadDocuments } from "./lib/record.mjs";

/**
 * path -> filing date, for everything whose date is a fact about the record
 * rather than a fact about the build machine. Both the document page and the
 * PDF it publishes take the date of the filing.
 */
export function lastmodIndex(docs = loadDocuments()) {
  const index = new Map();
  for (const doc of docs) {
    if (!doc.filed_date) continue;
    index.set(doc.url, doc.filed_date);
    index.set(doc.pdf_url, doc.filed_date);
  }
  return index;
}

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const xmlEscape = (s) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

export function renderSitemap(paths, lastmod = new Map()) {
  const entries = paths.map((path) => {
    const date = lastmod.get(path);
    const loc = `  <loc>${xmlEscape(absolute(path))}</loc>`;
    return date ? `<url>\n${loc}\n  <lastmod>${date}</lastmod>\n</url>` : `<url>\n${loc}\n</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * Baseline paths, one per line, # comments and blanks ignored.
 *
 * The file was taken from the live sitemap, so its entries are percent-encoded
 * AND were XML-escaped inside the document they came from. One filing has an
 * ampersand in its name and therefore reads `&amp;` on disk. Unescaping here
 * means the baseline holds exactly what a <loc> value means, rather than what
 * an XML document had to write to say it.
 */
const XML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

export function readBaseline(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]));
}

/**
 * Every URL the live site published must still be published, or be explicitly
 * retired. This is the check that makes the migration provable instead of
 * hopeful: a document page dropped by a template change fails the build here
 * rather than being noticed when somebody goes looking for a filing.
 */
/**
 * Both sides are compared as ENCODED paths, because that is what a sitemap
 * publishes and what the baseline recorded. Comparing a raw filesystem path
 * against a percent-encoded one reports every filing with a space in its name
 * as missing, which is what the first run of this gate did.
 */
export function baselineGaps(baseline, published, retired) {
  const have = new Set(published.map(encodePath));
  const gone = new Set(retired.map(encodePath));
  return baseline.filter((path) => !have.has(path) && !gone.has(path));
}

/**
 * URLs this build publishes that the live site did not. Reported, never failed
 * on: /answers/ is exactly such an addition and is the point of the change.
 * But a sitemap that silently GROWS is the same class of defect as one that
 * silently shrinks, and on a court record the additions are the half a human
 * should actually read, so they get printed rather than discovered later.
 */
/**
 * URLs the build still emits that _data/retired_urls.json says are withdrawn.
 *
 * THE DIRECTION THE GATE DID NOT COVER. Everything else here is built to catch
 * a DISAPPEARANCE: a URL that was published and is not any more. Restoring a
 * withdrawn document is the opposite motion, and it has its own failure mode.
 *
 * If a document comes back but its retirement entry stays, three things
 * disagree: the build emits the page, the sitemap omits it because this
 * generator excludes retired paths, and public/_redirects answers 404 for it.
 * The document is published and unreachable at the same time, and every check
 * that existed before this one passed, because none of them looked in this
 * direction.
 *
 * A retired path should not be emitted by the build at all: withdrawal means
 * the file is gone from the tree. So an exclusion with reason "retired" is not
 * housekeeping, it is a contradiction, and it fails the build.
 */
export function retiredButPublished(excluded) {
  return excluded.filter((e) => e.reason === "retired").map((e) => e.path).sort();
}

export function baselineAdditions(baseline, published) {
  const known = new Set(baseline);
  return published.filter((path) => !known.has(encodePath(path)));
}

function main() {
  const args = process.argv.slice(2);
  const builtDir = args.find((a) => !a.startsWith("--"));
  const baselineFlag = args.indexOf("--baseline");
  const baselineFile = baselineFlag === -1 ? null : args[baselineFlag + 1];

  if (!builtDir || !existsSync(builtDir)) {
    console.error(`build-sitemap: built directory not found: ${builtDir ?? "(none given)"}`);
    console.error("Usage: node scripts/build-sitemap.mjs <builtDir> [--baseline <file>]");
    process.exit(1);
  }

  const { included, excluded } = collectIndexable(builtDir);

  // Checked before the baseline, because a contradiction here means the two
  // sources of truth disagree, and every number below is derived from them.
  const contradictions = retiredButPublished(excluded);
  if (contradictions.length) {
    console.error(
      `\nbuild-sitemap: ${contradictions.length} URL(s) are listed as retired but the build still publishes them:\n`,
    );
    contradictions.forEach((p) => console.error(`  ${p}`));
    console.error(
      "\nThese are published and unreachable at the same time: the page is built, the\n" +
        "sitemap omits it, and public/_redirects answers 404 for it. If the document was\n" +
        "restored on purpose, remove its entry from _data/retired_urls.json AND its rule\n" +
        "from public/_redirects. If it was meant to stay withdrawn, it should not be in\n" +
        "the build.",
    );
    process.exit(1);
  }

  if (included.length === 0) {
    console.error("build-sitemap: the built tree contains no indexable page. Refusing to write an empty sitemap.");
    process.exit(1);
  }

  // The baseline is checked BEFORE anything is written. A build that is about
  // to be rejected must not leave a half-correct sitemap behind in the tree
  // that is being deployed.
  if (baselineFile) {
    const baseline = readBaseline(baselineFile);
    const gaps = baselineGaps(baseline, included, retiredPaths());
    if (gaps.length) {
      console.error(
        `\nbuild-sitemap: ${gaps.length} URL(s) the live site publishes are missing from this build\n` +
          "and are not listed in _data/retired_urls.json:\n",
      );
      gaps.slice(0, 40).forEach((p) => console.error(`  ${p}`));
      if (gaps.length > 40) console.error(`  ... and ${gaps.length - 40} more`);
      console.error(
        "\nEither the build dropped a published page, or the page was retired on purpose\n" +
          "and belongs in _data/retired_urls.json with a reason and a redirect rule.",
      );
      process.exit(1);
    }
    const added = baselineAdditions(baseline, included);
    console.log(`build-sitemap: baseline OK, all ${baseline.length} previously published URLs accounted for.`);
    if (added.length) {
      console.log(`build-sitemap: ${added.length} URL(s) not on the live site are published by this build:`);
      added.slice(0, 40).forEach((p) => console.log(`  + ${p}`));
      if (added.length > 40) console.log(`  ... and ${added.length - 40} more`);
    }
  }

  const out = join(builtDir, "sitemap.xml");
  writeFileSync(out, renderSitemap(included, lastmodIndex()), "utf8");

  const byReason = new Map();
  for (const item of excluded) byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
  const reasons = [...byReason].map(([r, n]) => `${n} ${r}`).join(", ") || "none";
  console.log(`build-sitemap: wrote ${included.length} URLs to ${out} (excluded: ${reasons})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
