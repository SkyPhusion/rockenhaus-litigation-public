#!/usr/bin/env node
// Build the IndexNow submission list FROM the sitemap that was just deployed.
//
// Usage: node scripts/build-indexnow.mjs <builtDir>
//
// THE DEFECT. The submission list used to come from a hardcoded STATIC_URLS
// array in scripts/generate_site.py, maintained by hand, entirely independently
// of the sitemap. It drifted in both directions:
//
//   - it still named /joe-prich/, /rob-hein/ and
//     /prichards-air-conditioning-neo-nazi/ three weeks after PR #7 deleted
//     them, so every deploy re-submitted three deleted pages to Bing, and the
//     site answered 200 with the homepage for all three, so from the outside
//     they looked alive and the cleanup was silently undone on every push;
//   - it named /robots.txt, /sitemap.xml and /llms.txt, which are not content
//     and which search engines fetch on their own schedule anyway;
//   - it omitted all 173 filed PDFs, which ARE the record.
//
// Submitting a URL is a claim that the URL exists. The only honest source for
// that claim is the sitemap the deploy just published, so this reads that file
// and nothing else. There is no list here to fall out of date.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, SITE_URL } from "./lib/site-urls.mjs";

const KEY_FILE = join(ROOT, "rockenhauslitigationindexnow2026.txt");

/** The <loc> values of a sitemap, in document order. */
export function locsFrom(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
}

export function buildPayload(locs, key, host = "rockenhaus.net") {
  return { host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: locs };
}

function main() {
  const builtDir = process.argv[2];
  if (!builtDir || !existsSync(builtDir)) {
    console.error(`build-indexnow: built directory not found: ${builtDir ?? "(none given)"}`);
    console.error("Usage: node scripts/build-indexnow.mjs <builtDir>");
    process.exit(1);
  }

  const sitemap = join(builtDir, "sitemap.xml");
  if (!existsSync(sitemap)) {
    console.error(`build-indexnow: no sitemap at ${sitemap}. Run build-sitemap.mjs first.`);
    console.error("The submission list is derived from the sitemap on purpose; there is no fallback list.");
    process.exit(1);
  }

  const locs = locsFrom(readFileSync(sitemap, "utf8"));
  if (locs.length === 0) {
    console.error("build-indexnow: the sitemap contains no URLs. Refusing to write an empty submission list.");
    process.exit(1);
  }

  const key = readFileSync(KEY_FILE, "utf8").trim();
  const outPath = join(ROOT, "_data", "indexnow.json");
  writeFileSync(outPath, JSON.stringify(buildPayload(locs, key), null, 2) + "\n", "utf8");

  // Deliberately reports the COUNT and not the list, and never the key.
  console.log(`build-indexnow: wrote ${locs.length} URLs to ${outPath}, derived from ${sitemap}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
