// The citation lookup table, and the three page states it exists to carry.
//
// The property under test is not "the JSON has the right keys". It is that a
// citation rendered live and a citation rendered at build time cannot disagree,
// because both derive from _corpus/manifest.json and nothing else holds a
// second copy of a filing's title, URL or case number.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTable, objectKeyFor, parseObjectKey } from "../scripts/build-citations.mjs";

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
