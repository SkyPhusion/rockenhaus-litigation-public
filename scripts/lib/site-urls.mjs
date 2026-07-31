// What the site actually publishes, read off the BUILT ARTIFACT.
//
// WHY THIS EXISTS. The site had two independent answers to "which URLs exist":
// jekyll-sitemap walked the Jekyll output, and a hardcoded STATIC_URLS list in
// scripts/generate_site.py fed IndexNow. They disagreed in both directions.
//
//   - jekyll-sitemap never saw the Astro half, so /answers/, the one content
//     surface built to be quoted by an answer engine, was absent from
//     /sitemap.xml entirely. Measured on the live sitemap: 367 <loc> entries,
//     none of them under /answers/.
//   - STATIC_URLS kept naming three pages deleted in PR #7, so every deploy
//     re-submitted them to Bing, and it named /robots.txt and /sitemap.xml,
//     which are not content, while omitting all 173 filed PDFs, which are.
//
// The fix is not a third list. It is to stop maintaining a list at all: walk
// what the build emitted and let the pages declare their own indexability
// through the robots meta they already carry. A page that is not built cannot
// be listed, and a page that is built cannot be forgotten.

import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SITE_URL = "https://rockenhaus.net";

/** Retired paths, from the single source shared with public/_redirects. */
export function retiredPaths(root = ROOT) {
  const data = JSON.parse(readFileSync(join(root, "_data", "retired_urls.json"), "utf8"));
  return data.retired.map((entry) => entry.path);
}

/**
 * Non-HTML files that ARE content and belong in the sitemap.
 *
 * The filed PDFs are the record. jekyll-sitemap included them (173 of the 367
 * live entries are PDF paths) and dropping them would be a real regression, so
 * they are named by extension rather than inherited by accident.
 */
const CONTENT_EXTENSIONS = [".pdf"];

/**
 * Does this document ask not to be indexed?
 *
 * Matches the full meta tag, not the bare word. A page BODY that quotes the
 * word "noindex", which the redesign documents do, must not be mistaken for a
 * page that carries the directive. Deliberately NOT scoped to a line range:
 * Astro emits minified single-line HTML, and a line-based <head> slice on that
 * never terminates, which is precisely how an earlier head-only check in this
 * repo silently scanned whole documents instead of their heads.
 */
export function isNoindex(html) {
  const tags = html.match(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi) || [];
  return tags.some((tag) => {
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    return content ? /\bnoindex\b/i.test(content[1]) : false;
  });
}

/**
 * The published URL path for a file in the built tree, or null if the file is
 * not a page. Directory-style, matching the permalink style used site-wide.
 */
export function urlPathFor(relPath) {
  const p = relPath.split("\\").join("/");
  if (p === "index.html") return "/";
  if (p.endsWith("/index.html")) return "/" + p.slice(0, -"index.html".length);
  if (CONTENT_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(ext))) return "/" + p;
  return null;
}

/** Every file in a directory tree, relative to it. */
export function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, base, out);
    else out.push(relative(base, abs).split("\\").join("/"));
  }
  return out;
}

/**
 * Files the build emits that are NOT URLs the site publishes.
 *
 * Named by their path in the built tree, and checked BEFORE the general page
 * rule, so that skipping them is a decision this file records rather than a
 * side effect of 404.html not happening to be called index.html. The excluded
 * report is meant to be read; a silent fall-through cannot be read.
 */
const NOT_CONTENT_FILES = new Set(["404.html"]);

/**
 * The indexable URL paths in a built tree, with the reason anything was left
 * out. The excluded list is returned rather than discarded so the build can
 * PRINT what it dropped: a sitemap that silently shrinks is the failure this
 * whole change exists to stop.
 */
export function collectIndexable(builtDir, { root = ROOT } = {}) {
  const retired = new Set(retiredPaths(root));
  const included = [];
  const excluded = [];

  for (const rel of walk(builtDir)) {
    if (NOT_CONTENT_FILES.has(rel)) {
      excluded.push({ path: "/" + rel, reason: "not content" });
      continue;
    }

    const path = urlPathFor(rel);
    if (path === null) continue;

    if (retired.has(path)) {
      excluded.push({ path, reason: "retired" });
      continue;
    }
    if (rel.endsWith(".html")) {
      if (isNoindex(readFileSync(join(builtDir, rel), "utf8"))) {
        excluded.push({ path, reason: "noindex" });
        continue;
      }
    }
    included.push(path);
  }

  return { included: [...new Set(included)].sort(), excluded };
}

/** Absolute URL for a site path. */
export function absolute(path) {
  return SITE_URL + path;
}
