// The IndexNow submission list must not name pages that do not exist.
//
// THE DEFECT THIS ENCODES. PR #7 deleted three third-party pages. The hardcoded
// STATIC_URLS list in scripts/generate_site.py kept naming them, so every
// deploy regenerated _data/indexnow.json containing them and re-submitted them
// to Bing. Because the site answers 200 with the homepage for every unknown
// path, they looked alive from the outside, and the cleanup was being undone by
// the deploy on every run for three weeks.
//
// REPOINTED, as the original version of this file said it should be. The
// submission list is no longer a list: scripts/build-indexnow.mjs reads the
// <loc> entries of the sitemap the deploy just wrote, and nothing else. So the
// question this file asks has changed with it. It used to be "does every name
// on the list still have a page behind it", which is a question you only need
// to ask about a list somebody maintains by hand. It is now "can anything reach
// the submission list without first being published in the sitemap", which is
// the property that makes the original defect unreachable rather than fixed.
//
// The derivation itself, its exclusions and its negative controls live in
// tests/sitemap.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { locsFrom, buildPayload } from "../scripts/build-indexnow.mjs";
import { collectIndexable, retiredPaths, absolute } from "../scripts/lib/site-urls.mjs";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");

describe("the IndexNow submission list is derived, not maintained", () => {
  it("no longer has a hand-maintained list to drift from", () => {
    // The guard on the whole class. If STATIC_URLS ever comes back, the failure
    // mode comes back with it, so its absence is asserted rather than assumed.
    const py = readFileSync(join(ROOT, "scripts", "generate_site.py"), "utf8");
    expect(py).not.toContain("STATIC_URLS");
    expect(py, "generate_site.py must not write the submission list").not.toContain("indexnow.json");
  });

  it("submits exactly what the sitemap published, in the same order", () => {
    const published = collectIndexable(DIST).included;
    const sitemapLocs = published.map(absolute);
    const payload = buildPayload(sitemapLocs, "test-key");
    expect(payload.urlList).toEqual(sitemapLocs);
  });

  it("is not empty, so this suite cannot pass vacuously", () => {
    expect(collectIndexable(DIST).included.length).toBeGreaterThan(0);
  });

  it("cannot publish retired third-party / HVAC paths, or index the joe-prich exhibit index", () => {
    const published = collectIndexable(DIST).included;
    for (const dead of [
      "/rob-hein/",
      "/prichards-air-conditioning/",
      "/prichards-air-conditioning-neo-nazi/",
    ]) {
      expect(retiredPaths(), `${dead} must be in the retired list`).toContain(dead);
      expect(published, `${dead} is retired and must not be published`).not.toContain(dead);
    }
    // Live noindex page: not retired, but must never enter sitemap/IndexNow.
    expect(retiredPaths()).not.toContain("/joe-prich/");
    expect(published, "/joe-prich/ is noindex and must not be published").not.toContain("/joe-prich/");
  });

  it("still allows /retractions/rob-hein/, which is a live page", () => {
    // Guards a real mistake made while fixing this: a suffix match on
    // "/rob-hein/" also matches "/retractions/rob-hein/", so a careless filter
    // removes a page that exists. The URL counts did not add up, which is how
    // it was caught. The retired list is exact paths for exactly this reason.
    expect(retiredPaths()).not.toContain("/retractions/rob-hein/");
    expect(existsSync(join(ROOT, "retractions", "rob-hein", "index.html"))).toBe(true);
  });

  it("drops a URL from the submission list the moment the sitemap drops it", () => {
    // THE NEGATIVE CONTROL for the derivation itself. Deriving the list is only
    // worth anything if removing a page removes the submission too.
    const sitemapWithout = ["https://rockenhaus.net/", "https://rockenhaus.net/answers/"];
    expect(buildPayload(sitemapWithout, "k").urlList).not.toContain("https://rockenhaus.net/faq/");
  });

  it("reads a real sitemap document rather than trusting a shape", () => {
    const xml = '<?xml version="1.0"?><urlset><url><loc>https://rockenhaus.net/a/</loc><lastmod>2026-05-12</lastmod></url></urlset>';
    expect(locsFrom(xml)).toEqual(["https://rockenhaus.net/a/"]);
  });
});
