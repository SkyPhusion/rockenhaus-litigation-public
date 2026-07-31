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
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DENYLIST, findDenylisted } from "../src/lib/guard";

const ROOT = join(import.meta.dirname, "..");

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

// ---------------------------------------------------------------------------
// Conrad's 2026-07-31 ruling: indexable metadata names the CASE, not PEOPLE.
//
// The ruling is enforced by DATA (which tiers are denied) rather than by code,
// so these tests are aimed at the data and at the loader that reads it. They
// are what stops the ruling being quietly narrowed later by an edit that still
// passes every other test in this file.
// ---------------------------------------------------------------------------

describe("metadata names the case, not people", () => {
  const denylist = JSON.parse(
    readFileSync(join(ROOT, "_data", "metadata_denylist.json"), "utf8"),
  ) as {
    denied_tiers: string[];
    allowed: { terms: string[] };
    [tier: string]: unknown;
  };

  const deniedTerms = denylist.denied_tiers.flatMap(
    (t) => (denylist[t] as { terms: string[] }).terms,
  );

  it("names its denied tiers in data, so a tier can be added without a code change", () => {
    // Before the ruling, both guards hardcoded `third_party` and
    // `party_handles`. Renaming a tier was therefore a four-file change of
    // which two files could be forgotten, and neither would have failed loudly.
    expect(denylist.denied_tiers.length).toBeGreaterThan(0);
    for (const tier of denylist.denied_tiers) {
      expect(denylist[tier], `denied_tiers names ${tier}, which does not exist`).toBeDefined();
    }
  });

  it("denies the opposing party's name, both aliases and the handle together", () => {
    // The pre-ruling denylist held ONLY the handle, on the argument that her
    // name belonged in metadata because the case is named for her. That
    // argument was overruled. All four go together or the ruling is not applied.
    for (const term of ["adrienne rockenhaus", "adrienne blair", "adrienne hein", "adezero"]) {
      expect(deniedTerms, `${term} identifies a person and must be denied in metadata`).toContain(term);
    }
  });

  it("still denies the non-parties and the characterisations", () => {
    for (const term of ["rob hein", "qolity", "sockpuppet", "neo-nazi"]) {
      expect(deniedTerms).toContain(term);
    }
  });

  it("allows the case caption and the case numbers, which are what metadata is FOR", () => {
    const allowed = denylist.allowed.terms.map((t) => t.toLowerCase());
    expect(allowed).toContain("rockenhaus v. rockenhaus");
    expect(allowed).toContain("26-104594-do");
  });

  it("never lists a term as both allowed and denied", () => {
    // The consistency control. Two lists that can disagree eventually will,
    // and this one would fail silently in the direction of publishing.
    const denied = new Set(deniedTerms.map((t) => t.toLowerCase()));
    const conflicts = denylist.allowed.terms.filter((t) => denied.has(t.toLowerCase()));
    expect(conflicts, `listed as both allowed and denied: ${conflicts.join(", ")}`).toEqual([]);
  });

  it("does not let the case caption trip the party-name denial", () => {
    // "Rockenhaus v. Rockenhaus" must survive a denylist that contains
    // "adrienne rockenhaus". If this ever fails, every title on the site fails.
    expect(findDenylisted("Rockenhaus v. Rockenhaus Case 26-104594-DO")).toEqual([]);
    expect(findDenylisted("39 Motion Appoint GAL PDF | Rockenhaus v. Rockenhaus Case 26-104594-DO")).toEqual([]);
  });

  it("catches the party's name in a title, which is the defect being fixed", () => {
    // The positive control for the widening. Without this the test above could
    // pass because the term was quietly dropped rather than because the caption
    // is distinguishable from it.
    const hits = findDenylisted("Adrienne Rockenhaus retraction demand | MCL 600.2911");
    expect(hits.map((h) => h.term)).toContain("adrienne rockenhaus");
  });
});

describe("the generator no longer stuffs person identifiers into metadata", () => {
  // Source-level regression. The keyword stuffing lived in one function and
  // reached all 173 document pages; this is what stops it coming back in a
  // later edit that nobody runs the whole site build against.
  const pyRaw = readFileSync(join(ROOT, "scripts", "generate_site.py"), "utf8");

  /**
   * Source with comment lines removed.
   *
   * These tests assert on what the generator DOES, and the comments explaining
   * what was removed necessarily quote the very literals being tested for. The
   * first version of this test failed on its own explanation, which is a fair
   * warning that grepping source text is a blunt instrument: it is used here
   * only because it catches reintroduction in a later edit that nobody runs the
   * full site build against.
   */
  const py = pyRaw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

  const metadataFns = py.slice(py.indexOf("def seo_document_title"), py.indexOf("def write_document_page"));

  it("builds titles and descriptions from the caption, not the party fields", () => {
    expect(metadataFns).not.toContain("PETITIONER['seo_title']");
    expect(metadataFns).not.toContain("PETITIONER['seo_aka']");
    expect(metadataFns).not.toContain('PETITIONER["name"]');
  });

  it("has no alias or handle literals left in the keyword list", () => {
    const keywords = py.slice(py.indexOf("def seo_document_keywords"), py.indexOf("def seo_case_heading"));
    for (const literal of ["Adrienne Blair", "Adrienne Hein", "@adezero", "Adrienne Rockenhaus"]) {
      expect(keywords, `${literal} is back in the meta keywords`).not.toContain(literal);
    }
  });

  it("keeps the assigned judge out of the metadata projection but in the record", () => {
    // court_name is the judge-free projection used by JSON-LD; court still
    // carries the judge, because docket information belongs in the record.
    expect(pyRaw).toContain("court_name");
    const courts = JSON.parse(readFileSync(join(ROOT, "_data", "courts.json"), "utf8")) as {
      cases: Array<{ court: string; court_name: string }>;
    };
    const withJudge = courts.cases.filter((c) => c.court.includes("Hon."));
    expect(withJudge.length, "no case names a judge; this test is testing nothing").toBeGreaterThan(0);
    for (const c of courts.cases) {
      expect(c.court_name, `court_name still names a judge: ${c.court_name}`).not.toContain("Hon.");
    }
  });
});

// ---------------------------------------------------------------------------
// The front-matter sweep.
//
// WHY THIS EXISTS ALONGSIDE THE PYTHON GUARD. The Python guard is the real one:
// it reads BUILT HTML, so it sees what a search engine sees, including whatever
// the Liquid templates decided to emit. But it needs a built site, and building
// the Jekyll half needs Ruby, which is not on the crew box. So on the machine
// where the edits are actually made, the authoritative guard cannot run at all,
// and the first feedback would be a red CI run.
//
// This sweep reads Jekyll SOURCE front matter instead. It is strictly weaker:
// it cannot see the templates, and a term introduced by a layout would sail
// past it. It is not a substitute and must never be treated as one.
//
// It earns its place empirically. Applying Conrad's ruling, I had rewritten the
// three pages named in the failing CI run and believed the change complete.
// This sweep found SIX more pages carrying the party's name in a description,
// which would otherwise have been a red CI run and a second round trip.
// ---------------------------------------------------------------------------

describe("no denylisted term in Jekyll front matter", () => {
  const denylist = JSON.parse(
    readFileSync(join(ROOT, "_data", "metadata_denylist.json"), "utf8"),
  ) as { denied_tiers: string[]; [tier: string]: unknown };
  const terms = denylist.denied_tiers.flatMap((t) => (denylist[t] as { terms: string[] }).terms);

  /** Front matter of every page source, keyed by path. */
  function frontMatters(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const skip = new Set(["node_modules", "dist", "_site", "src", ".git", "docs", "tests", "scripts", "assets", "public"]);

    function walk(dir: string, depth: number): void {
      if (depth > 3) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, depth + 1);
        else if (entry.name.endsWith(".html")) {
          const text = readFileSync(abs, "utf8");
          const m = /^---\n([\s\S]*?)\n---/.exec(text);
          if (m) out.push([abs.slice(ROOT.length + 1), m[1]!]);
        }
      }
    }
    walk(ROOT, 0);
    return out;
  }

  const pages = frontMatters();

  it("finds the page sources at all, so this cannot pass vacuously", () => {
    // The failure mode this guards: a path change makes the walk find nothing
    // and the sweep reports clean forever. The hand-written pages are always in
    // the tree; _documents/ is generated and may legitimately be absent.
    expect(pages.length, "no front matter found; the sweep is looking in the wrong place").toBeGreaterThan(10);
    expect(terms.length).toBeGreaterThan(10);
  });

  it("carries no denylisted term in any page's front matter", () => {
    const pattern = new RegExp(
      terms.map((t) => `(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).join("|"),
      "gi",
    );
    const hits: string[] = [];
    for (const [path, fm] of pages) {
      for (const m of fm.matchAll(pattern)) hits.push(`${path}: ${m[0]}`);
    }
    expect(hits, `denylisted terms in front matter:\n${hits.join("\n")}`).toEqual([]);
  });

  it("would catch a term reintroduced into a description", () => {
    // The control. Without it, a broken pattern would report clean.
    const pattern = new RegExp(
      terms.map((t) => `(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).join("|"),
      "gi",
    );
    expect("description: a demand served on Rob Hein".match(pattern)).not.toBeNull();
    expect("description: filings in Rockenhaus v. Rockenhaus".match(pattern)).toBeNull();
  });
});
