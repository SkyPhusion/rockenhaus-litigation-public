// The citation lookup table, and the three page states it exists to carry.
//
// The property under test is not "the JSON has the right keys". It is that a
// citation rendered live and a citation rendered at build time cannot disagree,
// because both derive from _corpus/manifest.json and nothing else holds a
// second copy of a filing's title, URL or case number.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTable, objectKeyFor, parseObjectKey, frameFor } from "../scripts/build-citations.mjs";

const ROOT = join(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "_corpus", "manifest.json"), "utf8")) as {
  pages: Array<Record<string, unknown>>;
};
const table = buildTable(manifest.pages);

describe("the citation table is the corpus, regrouped", () => {
  it("covers every document and every page, losing none", () => {
    expect(table.totals.pages).toBe(manifest.pages.length);
    expect(table.totals.documents).toBe(new Set(manifest.pages.map((p) => p.doc_slug)).size);
    expect(table.documents.length).toBe(table.totals.documents);
  });

  it("is not empty, so this suite cannot pass vacuously", () => {
    expect(table.totals.documents).toBeGreaterThan(100);
  });

  it("takes every derivable field from the manifest, never from a second source", () => {
    // The anti-drift property stated as a test. If a title here ever differs
    // from the manifest's, the live widget and the pre-rendered pages have
    // started citing the same filing by two different names.
    for (const doc of table.documents) {
      const page = manifest.pages.find((p) => p.doc_slug === doc.slug)!;
      expect(doc.title).toBe(page.title);
      expect(doc.url).toBe(page.url);
      expect(doc.pdf_url).toBe(page.pdf_url);
      expect(doc.case_number).toBe(page.case_number);
      expect(doc.filed_date).toBe(page.filed_date);
    }
  });

  it("is deterministic, so a rebuild is an empty diff", () => {
    expect(JSON.stringify(buildTable(manifest.pages))).toBe(JSON.stringify(table));
  });
});

describe("three page states, not two", () => {
  it("counts native, ocr and no-text pages separately", () => {
    const { native_pages, ocr_pages, no_text_pages, pages } = table.totals;
    expect(native_pages + ocr_pages + no_text_pages).toBe(pages);
    expect(ocr_pages).toBeGreaterThan(0);
    expect(no_text_pages).toBeGreaterThan(0);
  });

  it("lists the OCR pages per document, because they are citable but NOT quotable", () => {
    // verify-citations already refuses a QUOTED citation to an OCR page at
    // build time. The widget has to refuse it too, or the live surface becomes
    // the one place the rule does not apply, and it can only do that if it
    // knows which pages they are.
    const ocrFromManifest = manifest.pages.filter((p) => p.text_source === "ocr");
    const ocrFromTable = table.documents.flatMap((d) => d.ocr_pages.map((p) => `${d.slug}/${p}`));
    expect(ocrFromTable.length).toBe(ocrFromManifest.length);
    for (const page of ocrFromManifest) {
      expect(ocrFromTable).toContain(`${page.doc_slug}/${page.page}`);
    }
  });

  it("lists the pages with no text layer, which no text index can ever return", () => {
    // The 31 pages that are in the record and invisible to search. Silence in a
    // result list reads as "not in the record", and the widget cannot say
    // otherwise unless this table tells it where they are.
    const noneFromManifest = manifest.pages.filter((p) => p.text_source === "none");
    const noneFromTable = table.documents.flatMap((d) => d.no_text_pages.map((p) => `${d.slug}/${p}`));
    expect(noneFromTable.length).toBe(noneFromManifest.length);
    for (const page of noneFromManifest) {
      expect(noneFromTable).toContain(`${page.doc_slug}/${page.page}`);
    }
  });

  it("never files a page under two states", () => {
    for (const doc of table.documents) {
      const both = doc.ocr_pages.filter((p) => doc.no_text_pages.includes(p));
      expect(both, `${doc.slug} lists page(s) as both ocr and no-text`).toEqual([]);
    }
  });

  it("would notice a state being dropped", () => {
    // The control. Feeding it a corpus with no OCR pages must produce a table
    // with no OCR pages, rather than a table that reports them regardless.
    const nativeOnly = manifest.pages.map((p) => ({ ...p, text_source: "native" }));
    const t = buildTable(nativeOnly);
    expect(t.totals.ocr_pages).toBe(0);
    expect(t.documents.every((d) => d.ocr_pages.length === 0)).toBe(true);
  });
});

describe("the R2 object key is the citation", () => {
  it("matches the corpus key format exactly", () => {
    // scripts/verify-citations.mjs builds the same key to check a quotation
    // against the corpus. If these two ever differ, a citation verified at
    // build time points at a different object than the one search returned.
    expect(objectKeyFor("some-filing-slug", 7)).toBe("some-filing-slug/p007.txt");
    expect(objectKeyFor("some-filing-slug", 123)).toBe("some-filing-slug/p123.txt");
  });

  it("round-trips, so the widget can parse what search returns", () => {
    for (const [slug, page] of [["a-slug", 1], ["another-slug", 42]] as const) {
      expect(parseObjectKey(objectKeyFor(slug, page))).toEqual({ slug, page });
    }
  });

  it("refuses a key it does not understand rather than guessing", () => {
    for (const bad of ["no-page-number", "slug/p00x.txt", "slug/007.txt", ""]) {
      expect(parseObjectKey(bad), `should not parse: ${bad}`).toBeNull();
    }
  });

  it("round-trips every key the real corpus contains", () => {
    for (const page of manifest.pages) {
      const parsed = parseObjectKey(objectKeyFor(page.doc_slug as string, page.page as number));
      expect(parsed).toEqual({ slug: page.doc_slug, page: page.page });
    }
  });

  it("agrees with the key already recorded in the manifest", () => {
    // The manifest carries its own key per page. Deriving the same string from
    // slug and page number is only safe if it reproduces that one exactly.
    for (const page of manifest.pages) {
      expect(objectKeyFor(page.doc_slug as string, page.page as number)).toBe(page.key);
    }
  });
});

// ---------------------------------------------------------------------------
// The allegation-or-adjudication frame.
//
// "The motion filed 2026-07-02 alleges X" and "the court ordered X" are
// different sentences with different weight, and that difference is the
// strongest signal a court-record archive carries. If the verb comes from
// whoever wrote the answer, or from a model generating live, it drifts: a
// paraphrase can carry a perfectly valid citation and still say the record
// FOUND something it merely alleges. That is worse than an uncited sentence,
// because it launders the claim through a real source.
// ---------------------------------------------------------------------------

describe("the frame is looked up, never written", () => {
  it("gives every document a frame", () => {
    expect(table.documents.length).toBeGreaterThan(0);
    for (const doc of table.documents) {
      expect(doc.frame, `${doc.slug} has no frame`).toBeDefined();
      expect(doc.frame.class).toMatch(/^(allegation|adjudication|unknown)$/);
      expect(doc.frame.verb.length).toBeGreaterThan(0);
    }
  });

  it("derives the frame from category alone, for every document", () => {
    // The property that makes the verb un-driftable: nothing about the frame
    // depends on the document's title, its prose, or who entered it.
    for (const doc of table.documents) {
      expect(doc.frame, `${doc.slug}: frame does not match its category`).toEqual(frameFor(doc.category));
    }
  });

  it("calls a court order an adjudication and a motion an allegation", () => {
    expect(frameFor("orders").class).toBe("adjudication");
    expect(frameFor("orders").verb).toBe("ordered");
    expect(frameFor("filed").class).toBe("allegation");
    expect(frameFor("opposing").class).toBe("allegation");
  });

  it("frames BOTH parties' filings identically", () => {
    // Completeness cutting both ways, enforced rather than intended. An archive
    // that framed one side's motions as "states" and the other's as "alleges"
    // would be editorialising through grammar, and it would collapse the
    // archive framing exactly where it matters most.
    expect(frameFor("filed")).toEqual(frameFor("opposing"));
  });

  it("falls back to a neutral frame rather than guessing", () => {
    // A category nobody anticipated must not silently inherit "ordered".
    const unknown = frameFor("some-future-category");
    expect(unknown.class).toBe("unknown");
    expect(unknown.verb).not.toBe("ordered");
    expect(unknown.verb).not.toBe("alleges");
  });

  it("counts the classes present, so a consumer can see the shape", () => {
    const counted = Object.values(table.framing.classes).reduce((a, b) => a + b, 0);
    expect(counted).toBe(table.documents.length);
  });
});

describe("pairing an allegation with its disposition is NOT claimed", () => {
  it("says so in the artifact rather than leaving the absence to be discovered", () => {
    // The record as published cannot support it: 2 documents in `orders`,
    // neither dated, and 19 opposing filings with no dates either. There is no
    // field linking a motion to its disposition and no date arithmetic that
    // could stand in for one. Guessing from filename order would invent a
    // relationship between court documents, which is the opposite of the point.
    expect(table.framing.pairing.supported).toBe(false);
    expect(table.framing.pairing.why.join(" ")).toMatch(/cannot be derived/i);
  });

  it("is honest about the numbers behind that claim", () => {
    const orders = table.documents.filter((d) => d.category === "orders");
    const datedOrders = orders.filter((d) => d.filed_date);
    expect(orders.length).toBeLessThan(5);
    expect(datedOrders.length, "orders now carry dates; pairing may be derivable, revisit").toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The interface doc must not go stale.
//
// It is written to be read cold by someone who was not here, and it states
// corpus figures. A document whose numbers have drifted from the artifact is
// worse than one with no numbers: it is confidently wrong, and the reader has
// no way to tell. Older drafts of this contract still say 173 documents and 959
// pages, which is why this test exists.
// ---------------------------------------------------------------------------

describe("the search interface doc states the corpus it actually describes", () => {
  const doc = readFileSync(join(ROOT, "docs", "search", "AI-SEARCH-INTERFACE.md"), "utf8");

  it("exists and is substantial, so this cannot pass vacuously", () => {
    expect(doc.length).toBeGreaterThan(2000);
  });

  it("quotes the live document and page counts", () => {
    // Matched inside the figures table, so a passing mention of a number
    // elsewhere in prose cannot satisfy it.
    expect(doc).toMatch(new RegExp(`\\|\\s*documents\\s*\\|\\s*${table.totals.documents}\\s*\\|`));
    expect(doc).toMatch(new RegExp(`\\|\\s*corpus pages\\s*\\|\\s*${table.totals.pages}\\s*\\|`));
  });

  it("quotes the live per-page-state counts", () => {
    for (const [label, n] of [
      ["native text, quotable", table.totals.native_pages],
      ["OCR text, never quotable", table.totals.ocr_pages],
      ["no text layer at all", table.totals.no_text_pages],
    ] as const) {
      expect(doc, `the doc's "${label}" figure has drifted from the artifact`).toMatch(
        new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|\\s*${n}\\s*\\|`),
      );
    }
  });

  it("states the object key format the corpus actually uses", () => {
    expect(doc).toContain("<doc_slug>/pNNN.txt");
    expect(objectKeyFor("x", 7)).toBe("x/p007.txt");
  });

  it("carries no stale figure from the pre-withdrawal corpus", () => {
    // 173 documents and 959 pages were the figures before a PPO case and seven
    // discovery documents were withdrawn. They appear here only in the sentence
    // explaining that they are stale.
    const staleMentions = [...doc.matchAll(/\b(173 documents|959 pages)\b/g)];
    for (const m of staleMentions) {
      const context = doc.slice(Math.max(0, m.index! - 200), m.index! + 100);
      expect(context, `"${m[0]}" appears without being marked as stale`).toMatch(/stale|older document/i);
    }
  });
});

// ---------------------------------------------------------------------------
// The repository must not contradict itself about its own licence.
//
// The README said "No license is granted for redistribution, reuse, or
// republication of any content" and asserted privilege, while LICENSE is a CC0
// public-domain dedication. Both on the same public `main`. A reuser was going
// to be misled whichever they read first, and the privilege assertion was
// factually wrong: the privileged material is in a different repository.
// ---------------------------------------------------------------------------

describe("the repository states its licence consistently", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const license = readFileSync(join(ROOT, "LICENSE"), "utf8");
  const notice = readFileSync(join(ROOT, "NOTICE"), "utf8");

  it("has a CC0 LICENSE and a NOTICE that scopes it", () => {
    expect(license).toContain("CC0 1.0 Universal");
    expect(notice.length).toBeGreaterThan(500);
  });

  it("does not claim reuse is forbidden while dedicating to the public domain", () => {
    expect(readme).not.toMatch(/no license is granted/i);
  });

  it("does not assert privilege over a public repository", () => {
    // The privileged work product is in a separate private repository and has
    // never been here. Claiming otherwise on a public CC0 repo is both wrong
    // and the kind of wrong that a reader would reasonably act on.
    expect(readme).not.toMatch(/does not waive privilege/i);
    expect(readme).not.toMatch(/contains private litigation work product/i);
  });

  it("does not describe itself as private", () => {
    expect(readme).not.toMatch(/\bthe repo is private\b/i);
    expect(readme).not.toMatch(/private build repo/i);
  });

  it("points a reader from LICENSE to the scoping NOTICE", () => {
    expect(readme).toContain("NOTICE");
  });

  it("says what CC0 cannot cover", () => {
    // The load-bearing half. A dedication can only be made by someone holding
    // the rights, and other parties' filings are not this project's to dedicate.
    expect(notice).toMatch(/filing a document with a court does not\s+transfer its copyright/i);
    expect(notice).toMatch(/third-party material inside exhibits/i);
  });

  it("describes only the cases the site actually publishes", () => {
    // The PPO case was withdrawn on 2026-07-31. A README listing it as an
    // active matter of this site would be describing a site that no longer
    // exists, which is the same cold-read defect as a stale figure.
    expect(readme).not.toContain("26-102221-PP");
  });
});
