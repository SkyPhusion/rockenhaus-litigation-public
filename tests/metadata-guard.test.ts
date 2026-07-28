// The consolidated metadata guard, exercised against real fixtures.
//
// Two guards read _data/metadata_denylist.json now: src/lib/guard.ts at Astro
// build time, and scripts/check_indexable_metadata.py over the built HTML. This
// suite proves three things that the previous arrangement did not:
//
//   1. the two resolve to the SAME terms, so they cannot drift apart again
//      (they had drifted: 15 terms versus 4, and the 4 had no names in them)
//   2. the Python check actually FAILS on a poisoned page, watched failing
//      rather than assumed, with a clean page as the positive control so that a
//      pass means the check ran rather than the check being broken
//   3. its scope is metadata, not a blunt grep: the same term in a page BODY
//      must NOT fail, because exhibit pages quote artifacts and that quotation
//      is the point of an exhibit index

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DENYLIST } from "../src/lib/guard";

const SCRIPT = "scripts/check_indexable_metadata.py";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "metaguard-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Run the checker over a directory. Returns exit code and combined output. */
function run(siteDir: string): { code: number; out: string } {
  try {
    const out = execFileSync("python3", [SCRIPT, siteDir], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function fixture(name: string, html: string): string {
  const sub = join(dir, name);
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "index.html"), html, "utf8");
  return sub;
}

const CLEAN = `<!DOCTYPE html><html><head><title>Rockenhaus v. Rockenhaus, case 26-104594-DO</title>
<meta name="description" content="Filed Michigan court documents."></head>
<body><p>A filing in the Wayne County matter.</p></body></html>`;

describe("the two guards read one list", () => {
  it("python resolves exactly the terms guard.ts resolves", () => {
    const printed = execFileSync(
      "python3",
      [
        "-c",
        [
          "import importlib.util,json",
          `spec=importlib.util.spec_from_file_location("m","${SCRIPT}")`,
          "m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
          "print(json.dumps(m.TERMS))",
        ].join("\n"),
      ],
      { encoding: "utf8" },
    );
    const pythonTerms: string[] = JSON.parse(printed);
    expect([...pythonTerms].sort()).toEqual([...DENYLIST].sort());
  });

  it("the list is not empty, so neither guard can pass vacuously", () => {
    expect(DENYLIST.length).toBeGreaterThan(0);
  });
});

describe("the python check fails on poisoned metadata", () => {
  // POSITIVE CONTROL. Without this, every negative test below would also pass
  // if the script were simply broken and always exited 0.
  it("passes a clean page", () => {
    const result = run(fixture("clean", CLEAN));
    expect(result.code).toBe(0);
    expect(result.out).toContain("no denylisted text in indexable metadata");
  });

  it("fails when a denylisted term is in the title", () => {
    const html = CLEAN.replace("<title>Rockenhaus", "<title>Rob Hein and Rockenhaus");
    const result = run(fixture("title", html));
    expect(result.code).toBe(1);
    expect(result.out.toLowerCase()).toContain("rob hein");
    expect(result.out).toContain("[head]");
  });

  it("fails when a denylisted term is in the meta description", () => {
    const html = CLEAN.replace("Filed Michigan court documents.", "Filed documents about a neo-Nazi.");
    const result = run(fixture("description", html));
    expect(result.code).toBe(1);
    expect(result.out.toLowerCase()).toContain("neo-nazi");
  });

  it("fails when a denylisted term is inside a JSON-LD block in the BODY", () => {
    const html = CLEAN.replace(
      "</body>",
      `<script type="application/ld+json">{"name":"@adezero"}</script></body>`,
    );
    const result = run(fixture("jsonld", html));
    expect(result.code).toBe(1);
    expect(result.out).toContain("json-ld[0]");
  });

  it("fails on a noindex page too, because noindex is a request not a guarantee", () => {
    const html = CLEAN.replace(
      "<title>",
      `<meta name="robots" content="noindex, follow"><title>QOLity `,
    );
    const result = run(fixture("noindex", html));
    expect(result.code).toBe(1);
    expect(result.out.toLowerCase()).toContain("qolity");
  });
});

describe("scope is metadata, not a blunt grep", () => {
  it("does NOT fail when the term appears only in the page body", () => {
    const html = CLEAN.replace(
      "<p>A filing in the Wayne County matter.</p>",
      "<p>The exhibit shows a post by @adezero on its face.</p>",
    );
    const result = run(fixture("bodyonly", html));
    expect(result.code).toBe(0);
  });

  it("does NOT fire inside a longer token", () => {
    const html = CLEAN.replace("<title>Rockenhaus", "<title>Prichardson Road Rockenhaus");
    const result = run(fixture("boundary", html));
    expect(result.code).toBe(0);
  });
});

describe("the check refuses to pass vacuously", () => {
  it("fails when the directory contains no HTML at all", () => {
    const empty = join(dir, "empty");
    mkdirSync(empty, { recursive: true });
    const result = run(empty);
    expect(result.code).toBe(1);
    expect(result.out).toContain("produced nothing to check");
  });

  it("fails when the directory does not exist", () => {
    const result = run(join(dir, "nope"));
    expect(result.code).toBe(1);
  });
});
