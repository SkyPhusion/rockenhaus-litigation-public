import { describe, it, expect } from "vitest";
import { findCollisions, findOutOfLane, ASTRO_OWNED_PREFIXES } from "../scripts/check-collisions.mjs";

describe("generator lane separation", () => {
  it("finds a path emitted by both generators (control)", () => {
    expect(
      findCollisions(["faq/index.html", "answers/x/index.html"], ["answers/x/index.html"]),
    ).toEqual(["answers/x/index.html"]);
  });

  it("reports no collision when the lanes are clean", () => {
    expect(findCollisions(["faq/index.html"], ["answers/x/index.html"])).toEqual([]);
  });

  it("catches Astro emitting outside the paths it owns", () => {
    expect(findOutOfLane(["answers/a/index.html", "faq/index.html"])).toEqual([
      "faq/index.html",
    ]);
  });

  it("allows Astro build assets at the root", () => {
    expect(findOutOfLane(["_astro/style.css", "evidence/a/index.html"])).toEqual([]);
  });

  it("owns exactly the two documented prefixes", () => {
    expect(ASTRO_OWNED_PREFIXES).toEqual(["evidence/", "answers/"]);
  });
});
