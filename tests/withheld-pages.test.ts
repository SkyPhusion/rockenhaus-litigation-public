// A withheld page must be DISCLOSED, and the disclosure must be true.
//
// An undisclosed removal from a published court record misrepresents the
// record. A disclosed one is redaction, which is what courts do routinely. The
// entire difference is whether a reader can see that a page is missing and why,
// so the notice is not decoration: it is the thing that makes the removal
// legitimate. These tests exist so it cannot quietly stop rendering, and so the
// numbers in it cannot drift from the document actually being served.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const withheld = JSON.parse(readFileSync(join(ROOT, "_data", "withheld_pages.json"), "utf8")) as {
  documents: Record<string, {
    withheld_pages: number[];
    original_page_count: number;
    published_page_count: number;
    reason: string;
    authority: string;
  }>;
};
const entries = Object.entries(withheld.documents);

const manifest = JSON.parse(readFileSync(join(ROOT, "_corpus", "manifest.json"), "utf8")) as {
  pages: Array<{ doc_slug: string; page: number; total_pages: number; pdf_url: string }>;
};

describe("a withheld page is disclosed on the page that carries it", () => {
  it("has entries to check, so this cannot pass vacuously", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("renders a notice in the document layout", () => {
    const layout = readFileSync(join(ROOT, "_layouts", "document.html"), "utf8");
    expect(layout).toContain("page.withheld_pages");
    expect(layout).toContain("document-withheld");
    // Above the viewer, so a reader meets it before the document.
    expect(layout.indexOf("document-withheld")).toBeLessThan(layout.indexOf('class="document-viewer"'));
  });

  it("carries the notice into every affected document's front matter", () => {
    for (const [slug, w] of entries) {
      const fm = join(ROOT, "_documents", `${slug}.html`);
      if (!existsSync(fm)) continue; // generated; absent on a Ruby-less checkout before generate_site runs
      const text = readFileSync(fm, "utf8");
      expect(text, `${slug} has a withheld entry but no notice front matter`).toContain("withheld_pages:");
      expect(text).toContain(String(w.original_page_count));
      expect(text).toContain(w.reason);
      expect(text).toContain(w.authority);
    }
  });
});

describe("the disclosure matches the document actually served", () => {
  it("removes the withheld page from the corpus", () => {
    for (const [slug, w] of entries) {
      const pages = manifest.pages.filter((p) => p.doc_slug === slug);
      expect(pages.length, `${slug} is not in the corpus`).toBeGreaterThan(0);
      expect(pages.length, `${slug} corpus page count disagrees with the notice`).toBe(w.published_page_count);
      // Renumbering means the withheld ordinal must not simply still be there:
      // the count is what proves the page is gone, not the absence of an index.
      expect(w.published_page_count).toBe(w.original_page_count - w.withheld_pages.length);
    }
  });

  it("removes the withheld page from the PDF the site serves", () => {
    // THE CHECK THAT MATTERS MOST. The PDF is a scan, so the values are visible
    // in the image regardless of what the text layer says. A page-level removal
    // that left the PDF intact would satisfy every other assertion here while
    // leaving the actual content published.
    for (const [slug, w] of entries) {
      const pdfUrl = manifest.pages.find((p) => p.doc_slug === slug)!.pdf_url;
      const pdf = join(ROOT, pdfUrl.replace(/^\//, ""));
      expect(existsSync(pdf), `${pdfUrl} is missing`).toBe(true);
      const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
      const pages = Number(/^Pages:\s+(\d+)$/m.exec(info)![1]);
      expect(pages, `${pdfUrl} still has ${pages} pages; the notice claims ${w.published_page_count}`)
        .toBe(w.published_page_count);
    }
  });

  it("leaves no nine-digit identifier shape in the served PDF's text", () => {
    for (const [slug] of entries) {
      const pdfUrl = manifest.pages.find((p) => p.doc_slug === slug)!.pdf_url;
      const text = execFileSync("pdftotext", ["-layout", join(ROOT, pdfUrl.replace(/^\//, "")), "-"], { encoding: "utf8" });
      expect(/(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/.test(text), `${pdfUrl} still yields a nine-digit shape`).toBe(false);
    }
  });
});
