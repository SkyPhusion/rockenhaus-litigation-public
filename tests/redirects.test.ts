// The redirect rules, and the 404 page that never existed.
//
// WHAT CAN AND CANNOT BE TESTED HERE, stated plainly. These tests check the
// BUILT ARTIFACT: that the rules parse, that they point at a file the build
// actually emits, and that they cannot shadow a real page. They do NOT prove
// live behaviour, because proving that needs a deployment and this seat holds
// no Cloudflare credentials. Live verification is still outstanding and is
// called out in public/_redirects and in the PR.
//
// The distinction matters because of what the site does today: every unknown
// path answers 200 with the homepage, so on the live site a 200 proves nothing
// about whether a page exists. A test that only checked "unknown path 404s"
// would also pass if a bad rule had taken every page offline, which is why the
// known-good control below is not optional.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const REDIRECTS = join(ROOT, "public", "_redirects");

interface Rule {
  from: string;
  to: string;
  status: number;
}

function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    expect(parts.length, `malformed rule: ${line}`).toBeGreaterThanOrEqual(2);
    rules.push({ from: parts[0]!, to: parts[1]!, status: Number(parts[2] ?? 302) });
  }
  return rules;
}

const rules = parseRules(readFileSync(REDIRECTS, "utf8"));

/** Does any rule claim this path? Pages matches literally, with * as a wildcard. */
function matchedBy(path: string): Rule | undefined {
  return rules.find((rule) => {
    if (rule.from.endsWith("*")) return path.startsWith(rule.from.slice(0, -1));
    return rule.from === path;
  });
}

describe("the redirect rules", () => {
  it("parses at least one rule, so the suite cannot pass on an empty file", () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it("retires the three pages deleted in #7 with a 404", () => {
    for (const path of ["/joe-prich/", "/rob-hein/", "/prichards-air-conditioning-neo-nazi/"]) {
      const rule = matchedBy(path);
      expect(rule, `no rule for ${path}`).toBeDefined();
      expect(rule!.status, `${path} should 404, not redirect`).toBe(404);
    }
  });

  it("points every rule at a target the build actually emits", () => {
    for (const rule of rules) {
      if (!rule.to.startsWith("/") || rule.to.includes("*")) continue;
      const built = join(ROOT, "dist", rule.to.replace(/^\//, ""));
      const alsoJekyll = join(ROOT, rule.to.replace(/^\//, ""));
      expect(
        existsSync(built) || existsSync(alsoJekyll),
        `rule target does not exist: ${rule.to}`,
      ).toBe(true);
    }
  });
});

describe("the rules cannot shadow a real page", () => {
  // THE NEGATIVE CONTROL. Without it, a rule that broke the whole site would
  // still satisfy every assertion above.
  it("leaves known-good paths unmatched", () => {
    const known = [
      "/",
      "/answers/",
      "/evidence/",
      "/all-documents/",
      "/documents/waynedo26-104594-do-filed-39motionappointgalforplaintiff2026-07-02/",
      "/cases/wayne_do_26-104594-DO/",
      "/retractions/",
      "/is-conrad-rockenhaus-dead/",
    ];
    for (const path of known) {
      expect(matchedBy(path), `rule wrongly claims ${path}`).toBeUndefined();
    }
  });

  it("has no catch-all rule, which is not yet safe to enable", () => {
    // A trailing /* would be the general fix for the soft-404 behaviour, but it
    // takes the entire court record offline if Pages evaluates rules before
    // static assets. It must be proven on a preview deployment first. This test
    // exists so that adding one is a deliberate act with a failing test
    // attached, rather than a one-line change nobody notices.
    const catchAll = rules.find((r) => r.from === "/*" || r.from === "/**");
    expect(
      catchAll,
      "a catch-all rule was added; prove it on a preview deployment, confirming a KNOWN-GOOD path still returns its own content, then update this test",
    ).toBeUndefined();
  });
});

describe("the 404 page", () => {
  it("is emitted by the build", () => {
    expect(existsSync(join(ROOT, "dist", "404.html"))).toBe(true);
  });

  it("is noindex, and says the page does not exist", () => {
    const html = readFileSync(join(ROOT, "dist", "404.html"), "utf8");
    expect(html).toContain("noindex");
    expect(html).toContain("does not exist");
  });

  it("offers a route back into the record rather than a dead end", () => {
    const html = readFileSync(join(ROOT, "dist", "404.html"), "utf8");
    expect(html).toContain("/all-documents/");
  });
});
