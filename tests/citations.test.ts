import { describe, it, expect } from "vitest";
import { normalise, pageBody, verifyCitation } from "../scripts/verify-citations.mjs";

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
