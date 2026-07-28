import { describe, it, expect } from "vitest";
import { normalise, pageBody, verifyCitation, isOcrPage } from "../scripts/verify-citations.mjs";

const PAGE = `Document: 39 Motion Appoint GAL For Plaintiff 2026-07-02
Case: Rockenhaus v. Rockenhaus (Divorce), Case No. 26-104594-DO
Page: 2 of 3

---

13. Appointing a guardian ad litem for Plaintiff, or a next friend as the Court
    deems appropriate to Plaintiff's posture, pursuant to MCR 2.201(E).
`;

const readPage = (key: string) =>
  key === "gal-motion/p002.txt" ? PAGE : null;

describe("citation verification", () => {
  it("strips the provenance header from the page body", () => {
    expect(pageBody(PAGE)).not.toContain("Document:");
    expect(pageBody(PAGE)).toContain("guardian ad litem");
  });

  it("normalises the layout whitespace pdftotext emits", () => {
    expect(normalise("a   b\n\n  c")).toBe("a b c");
  });

  // POSITIVE CONTROL first: a real quote must verify, or every rejection below
  // is meaningless because the checker might reject everything.
  it("accepts a quote that spans a hard line break", () => {
    const result = verifyCitation(
      {
        doc_slug: "gal-motion",
        page: 2,
        quote: "Appointing a guardian ad litem for Plaintiff, or a next friend as the Court deems appropriate",
      },
      readPage,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an invented quote", () => {
    const result = verifyCitation(
      { doc_slug: "gal-motion", page: 2, quote: "the court hereby finds for the defendant" },
      readPage,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not appear/);
  });

  it("rejects a real quote cited to the wrong page", () => {
    const result = verifyCitation(
      { doc_slug: "gal-motion", page: 1, quote: "Appointing a guardian ad litem for Plaintiff" },
      readPage,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not exist/);
  });

  it("rejects a citation to a document not in the corpus", () => {
    const result = verifyCitation(
      { doc_slug: "no-such-filing", page: 1, quote: "anything at all here" },
      readPage,
    );
    expect(result.ok).toBe(false);
  });
});

const OCR_PAGE = `Document: 05 Answer To Counterclaim
Case: Rockenhaus v. Rockenhaus (Divorce), Case No. 26-104594-DO
Page: 2 of 6
Text source: ocr (OCR, confidence 89%, not quotable)

---

MACHINE TRANSCRIPTION (OCR), confidence 89%. NOT A QUOTABLE SOURCE.

2 ALDRICH LEGAL SERVICES, PLLC CONRAD A. ROCKENHAUS
ANSWER TO PART III. COUNTERCLAIM FOR DIVORCE
`;

const NATIVE_PAGE = `Document: 41 Consolidated Notice Of Hearing
Page: 1 of 1
Text source: native

---

PLEASE TAKE NOTICE that the following ten (10) motions will be heard.
`;

const readMixed = (key: string) =>
  key === "scanned/p002.txt" ? OCR_PAGE : key === "native/p001.txt" ? NATIVE_PAGE : null;

describe("OCR pages are not quotable", () => {
  // POSITIVE CONTROL: a native page still verifies, so the refusals below mean
  // something rather than the checker rejecting everything.
  it("still accepts a quote from a native-text page", () => {
    const r = verifyCitation(
      { doc_slug: "native", page: 1, quote: "the following ten (10) motions will be heard" },
      readMixed,
    );
    expect(r.ok).toBe(true);
  });

  it("detects an OCR page from its header", () => {
    expect(isOcrPage(OCR_PAGE)).toBe(true);
    expect(isOcrPage(NATIVE_PAGE)).toBe(false);
  });

  it("refuses a quote that genuinely appears in the OCR text", () => {
    // The passage IS present on the page. It is refused anyway, because the
    // transcription interleaves margin text and cannot be attributed to the
    // document as its words.
    const r = verifyCitation(
      { doc_slug: "scanned", page: 2, quote: "ANSWER TO PART III. COUNTERCLAIM FOR DIVORCE" },
      readMixed,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not quotable/);
  });

  it("names the remedy in the refusal", () => {
    const r = verifyCitation(
      { doc_slug: "scanned", page: 2, quote: "ALDRICH LEGAL SERVICES, PLLC CONRAD A. ROCKENHAUS" },
      readMixed,
    );
    expect(r.reason).toMatch(/reference/);
  });
});
