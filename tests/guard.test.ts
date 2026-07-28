import { describe, it, expect } from "vitest";
import { findDenylisted, assertCleanMetadata, DENYLIST } from "../src/lib/guard";

describe("denylist guard", () => {
  // POSITIVE CONTROL. A negative suite over a dead check passes for free, so
  // prove the matcher actually matches before trusting anything it rejects.
  it("detects a denylisted term (control: the check is alive)", () => {
    const hits = findDenylisted("Owner is an admitted neo-Nazi", "description");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].term).toBe("neo-nazi");
    expect(hits[0].field).toBe("description");
  });

  it("throws on a poisoned title", () => {
    expect(() =>
      assertCleanMetadata({ title: "Do not hire this company" }, "/test/"),
    ).toThrow(/Denylisted term reached indexable metadata/);
  });

  it("throws on a poisoned JSON-LD payload", () => {
    const jsonLd = {
      "@type": "FAQPage",
      mainEntity: [
        { acceptedAnswer: { text: "He is a nazzy, per the archived post." } },
      ],
    };
    expect(() => assertCleanMetadata({ jsonLd }, "/test/")).toThrow(/nazzy/);
  });

  it("catches a handle leaking through an asset URL", () => {
    // This is not hypothetical. The first real build failed exactly here: the
    // exhibit asset filenames contain account handles, so a contentUrl field
    // pointing at one leaked a third-party handle into structured data.
    const jsonLd = {
      contentUrl: "https://rockenhaus.net/assets/images/evidence/adezero-status-1234.png",
    };
    expect(() => assertCleanMetadata({ jsonLd }, "/evidence/x/")).toThrow(/adezero/);
  });

  it("passes clean court-record metadata", () => {
    expect(() =>
      assertCleanMetadata(
        {
          title: "When is the next motion hearing in Wayne County divorce case 26-104594-DO?",
          description:
            "Answered with verbatim passages from the filed Michigan court record, citing 1 filed document.",
        },
        "/answers/x/",
      ),
    ).not.toThrow();
  });

  it("does not fire inside a longer unrelated token", () => {
    // Word-ish boundaries: the guard must not block legitimate prose by
    // accident, or authors will route around it.
    expect(findDenylisted("unprichardlike", "body")).toHaveLength(0);
  });

  it("ignores null and undefined fields", () => {
    expect(() =>
      assertCleanMetadata({ title: "Clean", description: null, jsonLd: undefined }, "/x/"),
    ).not.toThrow();
  });

  it("denylist is non-empty", () => {
    expect(DENYLIST.length).toBeGreaterThan(5);
  });
});
