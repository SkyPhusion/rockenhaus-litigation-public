// The sitemap, and the submission list derived from it.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. Stated up front because the honest
// region matters more than the pass.
//
//   CAN, against the real built artifact: that /answers/ reaches the sitemap,
//   that every /evidence/ page is kept out of it by its own robots meta, that
//   404.html is not published as a URL, and that the retired paths are excluded.
//   The Astro half builds completely on this machine, so this is the shipped
//   artifact, not a stand-in.
//
//   CANNOT: anything about the MERGED site. Jekyll still owns 360 of the 367
//   published URLs and there is no Ruby on the crew box, so the merged tree
//   cannot be built here at all. The baseline parity gate is exercised below on
//   fixtures, which proves the decision path; it proves nothing about the real
//   merged output. That proof is the `Sitemap and IndexNow` CI step running
//   build-sitemap.mjs --baseline over _site, and it is the only thing that
//   proves it.
//
// Every mechanism below has a negative control that has been watched failing.
// A gate that cannot fail is not a gate.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isNoindex, urlPathFor, collectIndexable, retiredPaths, encodePath, absolute } from "../scripts/lib/site-urls.mjs";
import { renderSitemap, baselineGaps, baselineAdditions, readBaseline, lastmodIndex } from "../scripts/build-sitemap.mjs";
import { locsFrom, buildPayload } from "../scripts/build-indexnow.mjs";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");

describe("noindex detection", () => {
  it("reads the directive out of a real minified Astro page", () => {
    // The evidence pages are noindex and Astro emits them as ONE line. A
    // line-based <head> slice on that never terminates, which is exactly how an
    // earlier check in this repo silently scanned whole documents. Reading the
    // shipped file rather than a hand-written sample is the point of this test.
    const html = readFileSync(join(DIST, "evidence", "index.html"), "utf8");
    expect(html.split("\n").length, "sample is no longer minified; this test has stopped testing what it says").toBeLessThan(5);
    expect(isNoindex(html)).toBe(true);
  });

  it("treats an indexable page as indexable", () => {
    expect(isNoindex(readFileSync(join(DIST, "answers", "index.html"), "utf8"))).toBe(false);
  });

  it("does NOT fire on a page that merely says the word in its body", () => {
    // THE FALSE-POSITIVE CONTROL. A bare /noindex/ search over the document
    // would drop any page discussing indexing, which the redesign docs do.
    const html = '<html><head><meta name="robots" content="index, follow"></head><body>We set noindex on the exhibits.</body></html>';
    expect(isNoindex(html)).toBe(false);
  });

  it("fires on single quotes and odd spacing, since markup is not normalised", () => {
    expect(isNoindex("<meta name='robots' content='noindex, follow'>")).toBe(true);
    expect(isNoindex('<meta   name = "robots"   content = "NOINDEX" >')).toBe(true);
  });
});

describe("URL derivation from built files", () => {
  it("maps index.html files to directory URLs and PDFs to themselves", () => {
    expect(urlPathFor("index.html")).toBe("/");
    expect(urlPathFor("answers/index.html")).toBe("/answers/");
    expect(urlPathFor("wayne_do_26-104594-DO/filed/01_Answer.pdf")).toBe("/wayne_do_26-104594-DO/filed/01_Answer.pdf");
  });

  it("ignores files that are not pages", () => {
    for (const f of ["_astro/style.css", "favicon.svg", "robots.txt", "assets/img/og.png"]) {
      expect(urlPathFor(f), `${f} should not be a sitemap entry`).toBeNull();
    }
  });
});

describe("the sitemap built from the real Astro output", () => {
  const { included, excluded } = collectIndexable(DIST);

  it("is not empty, so this suite cannot pass vacuously", () => {
    expect(included.length).toBeGreaterThan(0);
  });

  it("includes /answers/, which the live sitemap omitted entirely", () => {
    // Defect 3.4. The live sitemap had 367 entries and not one under /answers/,
    // because jekyll-sitemap runs before the Astro output is merged in.
    expect(included).toContain("/answers/");
    expect(included.filter((p) => p.startsWith("/answers/")).length).toBeGreaterThan(1);
  });

  it("excludes every /evidence/ page, on the pages own declaration", () => {
    expect(included.filter((p) => p.startsWith("/evidence/"))).toEqual([]);
    expect(excluded.filter((e) => e.path.startsWith("/evidence/")).length).toBeGreaterThan(10);
    for (const e of excluded.filter((x) => x.path.startsWith("/evidence/"))) {
      expect(e.reason).toBe("noindex");
    }
  });

  it("does not publish the 404 page as a URL", () => {
    expect(included).not.toContain("/404.html");
    expect(excluded.some((e) => e.path === "/404.html" && e.reason === "not content")).toBe(true);
  });

  it("excludes every retired path", () => {
    for (const path of retiredPaths()) expect(included).not.toContain(path);
  });
});

describe("sitemap rendering", () => {
  it("emits the sitemaps.org namespace and one url element per path", () => {
    const xml = renderSitemap(["/", "/answers/"]);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect([...xml.matchAll(/<url>/g)].length).toBe(2);
    expect(xml).toContain("<loc>https://rockenhaus.net/answers/</loc>");
  });

  it("carries a filing date as lastmod where the record has one", () => {
    const xml = renderSitemap(["/documents/x/"], new Map([["/documents/x/", "2026-03-12"]]));
    expect(xml).toContain("<lastmod>2026-03-12</lastmod>");
  });

  it("omits lastmod entirely rather than inventing one", () => {
    // The live sitemap carried the SAME lastmod on all 349 entries, the deploy
    // timestamp, which claims the whole court record changed at one instant on
    // every push. Absent is valid; wrong is not.
    expect(renderSitemap(["/faq/"])).not.toContain("<lastmod>");
  });

  it("takes its dates from the record, and only for documents that have one", () => {
    const index = lastmodIndex([
      { url: "/documents/a/", pdf_url: "/case/a.pdf", filed_date: "2026-05-12" },
      { url: "/documents/b/", pdf_url: "/case/b.pdf", filed_date: null },
    ] as never);
    expect(index.get("/documents/a/")).toBe("2026-05-12");
    expect(index.get("/case/a.pdf")).toBe("2026-05-12");
    expect(index.has("/documents/b/")).toBe(false);
  });

  it("escapes XML metacharacters in a path", () => {
    expect(renderSitemap(["/a&b/"])).toContain("<loc>https://rockenhaus.net/a&amp;b/</loc>");
  });
});

describe("a filesystem path is not a URL", () => {
  // THE REGRESSION TEST FOR A DEFECT THIS GATE CAUGHT ON ITSELF. The first CI
  // run of the baseline check failed on 26 filings, because the generator
  // emitted raw filesystem paths while the baseline held the percent-encoded
  // URLs the live sitemap publishes. A <loc> containing a literal space is not
  // a legal sitemap entry, so this was wrong in its own right, not only
  // inconsistent with the baseline.

  it("percent-encodes a space, which 26 of the filed PDFs contain", () => {
    expect(encodePath("/wayne_do_26-104594-DO/opposing/05_Answer to Counterclaim.pdf")).toBe(
      "/wayne_do_26-104594-DO/opposing/05_Answer%20to%20Counterclaim.pdf",
    );
  });

  it("leaves an ampersand raw in the URL, as the live sitemap does", () => {
    // Escaping it belongs to the XML layer, not the URL layer. Doing it here
    // too would double-escape and change the URL.
    expect(encodePath("/a & b.pdf")).toBe("/a%20&%20b.pdf");
    expect(renderSitemap(["/a & b.pdf"])).toContain("<loc>https://rockenhaus.net/a%20&amp;%20b.pdf</loc>");
  });

  it("encodes a literal percent sign, because its input is a disk path", () => {
    // encodePath takes what the walker read off disk, never a URL, so a file
    // whose NAME contains a percent sign must become %25 or the URL would
    // decode back to a different filename. No filing is named that way today
    // (checked across all 173 PDFs), but the direction of the transform is the
    // thing worth pinning: paths in, URLs out, never the reverse.
    expect(encodePath("/already%20encoded.pdf")).toBe("/already%2520encoded.pdf");
  });

  it("builds absolute URLs through the same encoder", () => {
    expect(absolute("/a b/")).toBe("https://rockenhaus.net/a%20b/");
  });

  it("matches a raw path against its encoded baseline entry", () => {
    // The exact shape of the CI failure: published paths come off the disk raw,
    // baseline entries are encoded, and comparing them directly reports every
    // filing with a space in its name as missing.
    const baseline = ["/wayne_do_26-104594-DO/opposing/05_Answer%20to%20Counterclaim.pdf"];
    const published = ["/wayne_do_26-104594-DO/opposing/05_Answer to Counterclaim.pdf"];
    expect(baselineGaps(baseline, published, [])).toEqual([]);
    expect(baselineAdditions(baseline, published)).toEqual([]);
  });

  it("still reports a genuinely missing encoded path", () => {
    // The control for the test above: making the comparison encoding-aware
    // must not make it blind.
    expect(baselineGaps(["/gone%20now.pdf"], ["/something else.pdf"], [])).toEqual(["/gone%20now.pdf"]);
  });
});

describe("the baseline parity gate", () => {
  const baseline = readBaseline(join(ROOT, "_data", "sitemap_baseline.txt"));

  it("unescapes the XML entity in the one filing whose name has an ampersand", () => {
    // The baseline was taken from an XML document, so that filing reads
    // "&amp;" on disk. A <loc> value means "&", and the comparison has to be
    // against what the value MEANS, not what the document had to write.
    const amp = baseline.filter((p) => p.includes("&"));
    expect(amp.length).toBe(1);
    expect(amp[0]).toContain("Set%20Aside%20&%20Answer");
    expect(amp[0]).not.toContain("&amp;");
  });

  it("carries the 367 URLs the live site published", () => {
    expect(baseline.length).toBe(367);
    expect(baseline).toContain("/");
    expect(baseline.filter((p) => p.startsWith("/documents/")).length).toBe(173);
  });

  // What the walker hands the gate: paths as they exist on disk, decoded. The
  // baseline is encoded because it came from a published sitemap. Keeping the
  // two forms distinct in the tests is the point, since collapsing them is
  // exactly the mistake the first CI run caught.
  const onDisk = baseline.map((p) => decodeURI(p));

  it("passes when every baseline URL is still published", () => {
    expect(baselineGaps(baseline, onDisk, [])).toEqual([]);
  });

  it("FAILS when a published page silently disappears", () => {
    // THE NEGATIVE CONTROL. Without this the gate could be permanently green
    // for the wrong reason, and a dropped /documents/ page is a broken citation
    // inside a filed court document.
    const dropped = onDisk.filter((p) => p !== "/all-documents/");
    expect(baselineGaps(baseline, dropped, [])).toEqual(["/all-documents/"]);
  });

  it("FAILS when a filing with a space in its name disappears", () => {
    // The same control aimed at the encoded half, which is the half that broke.
    const target = "/wayne_do_26-104594-DO/opposing/05_Answer to Counterclaim.pdf";
    expect(onDisk, "fixture path is no longer in the baseline").toContain(target);
    const dropped = onDisk.filter((p) => p !== target);
    expect(baselineGaps(baseline, dropped, [])).toEqual([encodePath(target)]);
  });

  it("accepts a deliberate retirement, and only through the retired list", () => {
    const withoutRetired = onDisk.filter((p) => p !== "/faq/");
    expect(baselineGaps(baseline, withoutRetired, ["/faq/"])).toEqual([]);
    expect(baselineGaps(baseline, withoutRetired, [])).toEqual(["/faq/"]);
  });

  it("distinguishes a retirement that predates the baseline from one that follows it", () => {
    // This asserted the baseline contains no retired path at all, which held
    // only while every retirement predated the baseline. Withdrawing documents
    // that WERE published on 2026-07-31 broke it correctly: the baseline is the
    // history of what was published, so a URL retired afterwards stays in it.
    const retired = retiredPaths();
    const inBaseline = retired.filter((p) => baseline.includes(encodePath(p)));
    expect(retired.length, "nothing is retired; this would pass vacuously").toBeGreaterThan(0);
    expect(inBaseline.length, "no retirement is reconciled against the baseline").toBeGreaterThan(0);

    // The load-bearing half: the gate accepts a build that no longer publishes
    // them. Without this every future withdrawal fails the build, and the
    // pressure becomes editing the baseline, which erases what was published.
    const published = baseline.filter((p) => !inBaseline.map(encodePath).includes(p)).map((p) => decodeURI(p));
    expect(baselineGaps(baseline, published, retired)).toEqual([]);
  });

  it("still fails when a baseline URL vanishes WITHOUT being retired", () => {
    // Accepting retirements must not become accepting disappearances.
    const victim = baseline.find((p) => p.startsWith("/documents/") && !retiredPaths().map(encodePath).includes(p))!;
    const published = baseline.filter((p) => p !== victim).map((p) => decodeURI(p));
    expect(baselineGaps(baseline, published, retiredPaths())).toContain(victim);
  });

  it("reports what the build adds, without failing on it", () => {
    // /answers/ is an addition and is the point of the change, so additions
    // cannot be an error. They are still the half of the diff a human should
    // read on a court record, so they are reported rather than swallowed.
    expect(baselineAdditions(baseline, [...onDisk, "/answers/"])).toEqual(["/answers/"]);
    expect(baselineAdditions(baseline, onDisk)).toEqual([]);
  });

  it("names /answers/ as an addition against the real Astro output", () => {
    expect(baselineAdditions(baseline, collectIndexable(DIST).included)).toContain("/answers/");
  });
});

describe("retired URLs and the redirect rules cannot drift apart", () => {
  const rules = readFileSync(join(ROOT, "public", "_redirects"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/));

  it("gives every retired path a rule that stops it resolving", () => {
    // Compared on the ENCODED form. public/_redirects is whitespace-delimited,
    // so a rule whose FROM field contains a literal space parses as three
    // fields and silently does nothing; seven withdrawn filenames contain
    // spaces. Encoded is also the form the request arrives in.
    for (const path of retiredPaths()) {
      const encoded = encodePath(path);
      const rule = rules.find((r) => r[0] === encoded || r[0] === path);
      expect(rule, `_data/retired_urls.json lists ${path} with no rule in public/_redirects`).toBeDefined();
      expect(Number(rule![2]), `${path} is retired, so it must 404 rather than redirect`).toBe(404);
    }
  });

  it("has a retired entry for every 404 rule, so neither file leads the other", () => {
    const retired = new Set(retiredPaths().map(encodePath));
    for (const rule of rules.filter((r) => Number(r[2]) === 404)) {
      expect(retired.has(rule[0]!), `public/_redirects 404s ${rule[0]} with no entry in _data/retired_urls.json`).toBe(true);
    }
  });

  it("expresses a path containing a space in a form a rule can carry", () => {
    // The control for the encoding. Without it these seven rules parse as three
    // fields each and the URLs answer 200 instead of 404, which is the exact
    // soft-404 behaviour public/_redirects exists to remove.
    const spaced = retiredPaths().filter((p) => p.includes(" "));
    expect(spaced.length, "no retired path has a space; this test is testing nothing").toBeGreaterThan(0);
    for (const path of spaced) {
      const rule = rules.find((r) => r[0] === encodePath(path));
      expect(rule, `no encoded rule for ${path}`).toBeDefined();
      expect(rule![0]).not.toContain(" ");
    }
  });
});

describe("the IndexNow submission list", () => {
  it("is exactly the sitemap, with nothing added", () => {
    const xml = renderSitemap(["/", "/answers/", "/x.pdf"]);
    expect(locsFrom(xml)).toEqual([
      "https://rockenhaus.net/",
      "https://rockenhaus.net/answers/",
      "https://rockenhaus.net/x.pdf",
    ]);
  });

  it("unescapes what the sitemap escaped, so a submitted URL is the real URL", () => {
    expect(locsFrom(renderSitemap(["/a&b/"]))).toEqual(["https://rockenhaus.net/a&b/"]);
  });

  it("cannot name the pages deleted in PR #7, because they are not in the sitemap", () => {
    // The old hardcoded list re-submitted these on every deploy for three weeks.
    // Deriving the list removes the possibility rather than the instance.
    const built = collectIndexable(DIST).included;
    const payload = buildPayload(built.map((p) => "https://rockenhaus.net" + p), "test-key");
    for (const dead of retiredPaths()) {
      expect(payload.urlList.some((u) => u.endsWith(dead))).toBe(false);
    }
  });

  it("points keyLocation at the key file the site serves", () => {
    const payload = buildPayload(["https://rockenhaus.net/"], "somekey");
    expect(payload.keyLocation).toBe("https://rockenhaus.net/somekey.txt");
    expect(existsSync(join(ROOT, "rockenhauslitigationindexnow2026.txt"))).toBe(true);
  });
});
