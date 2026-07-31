// The PII gate: does it fire, does it stay quiet on ordinary record text, and
// does it refuse to leak what it found.
//
// The third question is as important as the first two here. This repository is
// public, so the gate's own OUTPUT is a publication surface, and a check that
// reports "file X page 11 contains a Social Security number" publishes a map to
// unredacted material. These tests pin that behaviour so it cannot be helpfully
// "improved" into a more informative failure later.

import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "check_pii.py");

/** Run the gate over a throwaway tree. Returns exit status and combined output. */
function run(files: Record<string, string>, args: string[] = []): { status: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "pii-gate-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, body, "utf8");
    }
    try {
      const out = execFileSync("python3", [SCRIPT, dir, ...args], { encoding: "utf8", stdio: "pipe" });
      return { status: 0, out };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { status: e.status, out: (e.stdout ?? "") + (e.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Synthetic, invalid values throughout. Nothing here is real.
const SSN = "000-00-0000";
const DOB = "Date of Birth: 01/01/1900";
const ACCT = "account no. 0000000000";
const ADDR = "1234 Example Street";

describe("the gate fires", () => {
  it("passes its own self-test, which proves every pattern is alive", () => {
    const out = execFileSync("python3", [SCRIPT, "--self-test"], { encoding: "utf8" });
    expect(out).toContain("patterns fire");
  });

  it("fails closed on a Social Security number", () => {
    const { status, out } = run({ "a.txt": `Respondent ${SSN} appears here.` });
    expect(status).toBe(1);
    expect(out).toContain("ssn");
  });

  it("fails closed on a date of birth, an account number and an address", () => {
    for (const sample of [DOB, ACCT, ADDR]) {
      expect(run({ "a.txt": sample }).status, `should have failed on: ${sample}`).toBe(1);
    }
  });

  it("refuses to report clean when it scanned nothing", () => {
    // A gate that passes vacuously on an empty or mistyped path is worse than
    // no gate: it reports success for the wrong reason.
    const { status, out } = run({ "a.png": "not a scanned suffix" });
    expect(status).toBe(2);
    expect(out).toContain("Refusing to report clean");
  });
});

describe("the gate stays quiet on ordinary court-record text", () => {
  it("does not fire on case numbers, rule citations or filing dates", () => {
    const record = [
      "Case No. 26-104594-DO was filed on 2026-04-15.",
      "MCR 1.109(D)(9) governs protected personal identifying information.",
      "The motion filed 2026-07-02 alleges the account was misused.",
      "Wayne County Circuit Court (Third Judicial Circuit)",
      "Page 3 of 11, exhibit 12.",
    ].join("\n");
    const { status, out } = run({ "a.txt": record });
    expect(status, out).toBe(0);
  });
});

describe("the gate does not publish what it finds", () => {
  it("prints counts but NOT paths by default, because a CI log is public", () => {
    const { status, out } = run({ "filings/secret-doc/p011.txt": `Respondent ${SSN}` });
    expect(status).toBe(1);
    expect(out).toContain("ssn");
    // The map, not the fact, is what must not be published.
    expect(out, "the failing path was printed into a public log").not.toContain("secret-doc");
    expect(out).not.toContain("p011.txt");
    expect(out).toContain("LOCATIONS ARE NOT PRINTED HERE");
  });

  it("prints locations only when asked, for local runs", () => {
    const { status, out } = run({ "filings/secret-doc/p011.txt": `Respondent ${SSN}` }, ["--detail"]);
    expect(status).toBe(1);
    expect(out).toContain("secret-doc");
  });

  it("never prints the matched value, in either mode", () => {
    for (const args of [[], ["--detail"]]) {
      const { out } = run({ "a.txt": `Respondent ${SSN} appears here.` }, args);
      expect(out, `the raw value was printed with args ${JSON.stringify(args)}`).not.toContain(SSN);
    }
  });

  it("masks a match rather than omitting it, so a finding is still reviewable", () => {
    const { out } = run({ "a.txt": `Respondent ${SSN}` }, ["--detail"]);
    expect(out).toMatch(/match=\S*\*{3,}\S*/);
  });
});

describe("the allowlist accepts by hash, never by value", () => {
  it("suppresses a match whose hash is accepted", () => {
    // Derive the hash the way the gate does, without ever writing the value
    // into the allowlist file.
    const hash = execFileSync(
      "python3",
      ["-c", `import hashlib;print(hashlib.sha256(("rockenhaus-pii-allowlist-v1"+"${SSN}").encode()).hexdigest()[:32])`],
      { encoding: "utf8" },
    ).trim();

    const dir = mkdtempSync(join(tmpdir(), "pii-allow-"));
    try {
      writeFileSync(join(dir, "a.txt"), `Respondent ${SSN}`, "utf8");
      const allowlist = join(ROOT, "_data", "pii_allowlist.json");
      // Proven against the real allowlist path by construction: the gate reads
      // exactly one file, and this asserts the hash it would need.
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
      expect(allowlist).toContain("pii_allowlist.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The allowlist, and the promise it must not quietly break.
//
// An allowlist is where a gate goes to die. The failure mode is not dramatic:
// somebody hits a red build, adds the hash, and the category that mattered is
// now permanently accepted with a one-line reason nobody rereads. These tests
// make the two things that must stay true into assertions.
// ---------------------------------------------------------------------------

describe("the allowlist cannot swallow the categories that matter", () => {
  const allowlist = JSON.parse(
    readFileSync(join(ROOT, "_data", "pii_allowlist.json"), "utf8"),
  ) as {
    policy: { high_severity_patterns_never_allowlisted: string[] };
    accepted: Array<{ hash: string; pattern: string; reason: string }>;
  };

  it("has entries, so these tests are checking something", () => {
    expect(allowlist.accepted.length).toBeGreaterThan(0);
  });

  it("contains no entry for a high-severity pattern", () => {
    // Every high-severity match found on 2026-07-31 was resolved by REMOVING
    // the document or withholding the page. None was allowlisted, and none may
    // be: an SSN accepted here is an SSN published with a note saying it is
    // fine. This is the assertion that makes that a rule rather than a habit.
    const forbidden = new Set(allowlist.policy.high_severity_patterns_never_allowlisted);
    expect(forbidden.size).toBeGreaterThan(0);
    const violations = allowlist.accepted.filter((e) => forbidden.has(e.pattern));
    expect(
      violations.map((v) => v.pattern),
      "a high-severity match was allowlisted; it must be removed at the source instead",
    ).toEqual([]);
  });

  it("stores a hash and never a value or a location", () => {
    // The allowlist lives in a public repository. A value would be the
    // disclosure; a document name would be a map to it.
    for (const e of allowlist.accepted) {
      expect(e.hash, "an entry has no hash").toMatch(/^[a-f0-9]{32}$/);
      expect(Object.keys(e).sort()).toEqual(["hash", "occurrences", "pattern", "reason", "status"]);
      expect(JSON.stringify(e)).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    }
  });

  it("gives every entry a reason", () => {
    for (const e of allowlist.accepted) {
      expect(e.reason.length, `entry ${e.hash} has no meaningful reason`).toBeGreaterThan(20);
    }
  });
});

describe("the gate is armed", () => {
  // A gate that exists but runs nowhere is a comfort. These assert it is
  // actually wired, and wired BEFORE the step that publishes.
  const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const deploy = readFileSync(join(ROOT, ".github", "workflows", "cloudflare-pages.yml"), "utf8");

  it("runs in CI over the corpus, the data files AND the built site", () => {
    expect(ci).toContain("scripts/check_pii.py");
    const line = ci.split("\n").find((l) => l.includes("scripts/check_pii.py"))!;
    for (const path of ["_corpus", "_data", "_site"]) {
      expect(line, `CI scan omits ${path}`).toContain(path);
    }
  });

  it("runs on deploy BEFORE the upload, which is the last stoppable point", () => {
    // Compared by STEP ORDER, not by string position. The first version of
    // this test used indexOf("pages deploy"), which matched a COMMENT near the
    // top of the file explaining the merge, so it reported the gate as running
    // after a deploy that had not happened yet. It was the test that was wrong,
    // not the wiring, and a substring in prose is not a step.
    const steps = deploy
      .split("\n")
      .map((l, i) => ({ i, m: /^\s{6}- name:\s*(.+)$/.exec(l) }))
      .filter((x) => x.m)
      .map((x) => ({ line: x.i, name: x.m![1]!.trim() }));

    expect(steps.length, "no steps parsed; this test is checking nothing").toBeGreaterThan(3);

    const scanStep = steps.find((st) => {
      const next = steps[steps.indexOf(st) + 1];
      const body = deploy.split("\n").slice(st.line, next ? next.line : undefined).join("\n");
      return body.includes("scripts/check_pii.py");
    });
    const deployStep = steps.find((st) => {
      const next = steps[steps.indexOf(st) + 1];
      const body = deploy.split("\n").slice(st.line, next ? next.line : undefined).join("\n");
      return /command:\s*pages deploy/.test(body);
    });

    expect(scanStep, "no step runs the scan").toBeDefined();
    expect(deployStep, "no step runs `pages deploy`").toBeDefined();
    expect(
      scanStep!.line,
      `the scan (${scanStep!.name}) runs after the upload (${deployStep!.name}), which is cleanup rather than a gate`,
    ).toBeLessThan(deployStep!.line);
  });

  it("scans _data on deploy too, not only the corpus", () => {
    // The false-clean that actually happened: _data/ocr-cache.json holds a
    // second text copy of every scanned page, so a corpus-only scan reports
    // zero while the same string is still published.
    const line = deploy.split("\n").find((l) => l.includes("scripts/check_pii.py"))!;
    expect(line).toContain("_data");
  });
});

// ---------------------------------------------------------------------------
// The gate must state its own blind spot.
//
// "A clean scan is not evidence of absence" is only useful if the gate says so
// itself. A green line read by somebody who was not part of the conversation
// that produced it will be taken as "the corpus is clean", and the difference
// between that and "no match in the text we could extract" is 36 pages.
// ---------------------------------------------------------------------------

describe("the gate reports what it cannot read", () => {
  const out = (() => {
    try {
      return execFileSync("python3", [SCRIPT, "_corpus", "_data"], { encoding: "utf8", cwd: ROOT, stdio: "pipe" });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      return (e.stdout ?? "") + (e.stderr ?? "");
    }
  })();

  it("prints per-page-state counts on every run", () => {
    expect(out).toContain("corpus coverage");
    expect(out).toContain("native text");
    expect(out).toContain("OCR text");
    expect(out).toContain("no text layer");
  });

  it("says plainly that no-text pages are NOT scanned", () => {
    // The wording is load-bearing. "0 findings" next to a page count reads as
    // coverage; this has to say the opposite about those pages.
    expect(out).toContain("NOT SCANNED");
  });

  it("names the unreadable pages rather than counting them", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "_corpus", "manifest.json"), "utf8")) as {
      pages: Array<{ doc_slug: string; page: number; text_source: string }>;
    };
    const unreadable = manifest.pages.filter((p) => p.text_source === "none");
    expect(unreadable.length, "no unreadable pages; this test is checking nothing").toBeGreaterThan(0);
    for (const p of unreadable) {
      expect(out, `${p.doc_slug} p${p.page} is unreadable but not named in the output`).toContain(p.doc_slug);
    }
  });

  it("does not claim more than it checked, even when clean", () => {
    expect(out).toContain("no match in the text that could be extracted");
  });
});

describe("local and CI scan scopes do not diverge quietly", () => {
  it("warns loudly when a path CI scans is missing here", () => {
    // _site exists only after a full build, and building the Jekyll half needs
    // Ruby, which is not on the crew box. So a local run is routinely narrower
    // than CI, and the danger is reading its clean result as clean.
    const r = spawnSync("python3", [SCRIPT, "_corpus", "_data", "_definitely_absent_path"], {
      encoding: "utf8", cwd: ROOT,
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    expect(out).toContain("SCOPE IS NARROWER THAN CI");
    expect(out).toContain("_definitely_absent_path");
  });

  it("still scans the paths that DO exist rather than refusing outright", () => {
    // A missing path must not become a reason to scan nothing: that would turn
    // a narrower scan into no scan, which is worse.
    const r = spawnSync("python3", [SCRIPT, "_corpus", "_definitely_absent_path"], {
      encoding: "utf8", cwd: ROOT,
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    expect(out).toMatch(/\d+ file\(s\) scanned/);
  });

  it("runs the same three paths locally as in CI", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
    const ciLine = ci.split("\n").find((l) => l.includes("scripts/check_pii.py"))!;
    for (const path of ["_corpus", "_data", "_site"]) {
      expect(pkg.scripts.pii, `npm run pii omits ${path}, which CI scans`).toContain(path);
      expect(ciLine).toContain(path);
    }
  });
});

// ---------------------------------------------------------------------------
// A routing number is not an account number.
//
// The gate reported eight account_number matches. All eight were routing
// numbers, matched because "routing" was one of the trigger words in the
// account pattern. That is not a small mislabel: an account number identifies a
// person's account and is named in MCR 1.109(D)(9), while a routing number
// identifies a BANK, is printed on every cheque, and is published by the
// institutions themselves. One of the filings carrying these argues exactly
// that in its own text.
//
// Reporting eight protected identifiers where there are none is the same class
// of defect as reporting none where there are some: the number stops meaning
// what it says, and the next person reads past it.
// ---------------------------------------------------------------------------

describe("routing numbers are classified separately from account numbers", () => {
  function scan(text: string): string[] {
    const r = spawnSync("python3", ["-c", [
      "import importlib.util,sys,json",
      `spec=importlib.util.spec_from_file_location("m", "${SCRIPT}")`,
      "m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "print(json.dumps([f['pattern'] for f in m.scan_text(sys.argv[1], 'x', {})]))",
    ].join("\n"), text], { encoding: "utf8", cwd: ROOT });
    return JSON.parse(r.stdout.trim());
  }

  it("reports a routing number as a routing number", () => {
    const hits = scan("The routing number 000000000 identifies USAA Federal Savings Bank.");
    expect(hits).toContain("routing_number");
    expect(hits, "a routing number must not be counted as an account number").not.toContain("account_number");
  });

  it("still reports a genuine account number as one", () => {
    // The control. Splitting the pattern must not blunt the one that matters.
    const hits = scan("USAA account no. 0000000000 was drawn on.");
    expect(hits).toContain("account_number");
  });

  it("does not fire account_number on a last-four reference", () => {
    // How the filings actually write it, having complied with the redaction
    // order: the account is already reduced to four digits at the source.
    const hits = scan("records of the account ending in -0000 at which payments landed");
    expect(hits).not.toContain("account_number");
  });
});

describe("account_number can no longer be allowlisted", () => {
  const allowlist = JSON.parse(
    readFileSync(join(ROOT, "_data", "pii_allowlist.json"), "utf8"),
  ) as {
    policy: { high_severity_patterns_never_allowlisted: string[] };
    accepted: Array<{ pattern: string }>;
  };

  it("is on the never-allowlist list", () => {
    // Added while the true count is zero, which is the only comfortable moment
    // to close a door: nobody is under pressure to open it.
    expect(allowlist.policy.high_severity_patterns_never_allowlisted).toContain("account_number");
  });

  it("has no entry, because the true count is zero", () => {
    expect(allowlist.accepted.filter((e) => e.pattern === "account_number")).toEqual([]);
  });

  it("allowlists the routing numbers instead, with a reason that says why", () => {
    const routing = allowlist.accepted.filter((e) => e.pattern === "routing_number");
    expect(routing.length).toBeGreaterThan(0);
    for (const e of routing) {
      expect((e as { reason: string }).reason).toMatch(/identifies a financial institution/i);
    }
  });
});

// ---------------------------------------------------------------------------
// A stale allowlist entry is a standing pre-authorisation.
//
// An entry says "this exact value does not stop the build". Once the value has
// been resolved at the source, by withdrawing a document or withholding a page,
// the entry outlives the thing it described: if that value ever reappears,
// through a restored document or a re-added exhibit, the gate stays green and
// nobody is told.
//
// This repository restored a withdrawn document today, so reappearance is not
// hypothetical. Until now the property held only because the file happened to
// be regenerated from the live corpus each time it changed.
// ---------------------------------------------------------------------------

describe("the allowlist cannot outlive what it describes", () => {
  function runWithAllowlist(extra: object | null): { status: number; out: string } {
    const path = join(ROOT, "_data", "pii_allowlist.json");
    const original = readFileSync(path, "utf8");
    try {
      if (extra) {
        const d = JSON.parse(original) as { accepted: object[] };
        d.accepted.push(extra);
        writeFileSync(path, JSON.stringify(d, null, 2) + "\n", "utf8");
      }
      const r = spawnSync("python3", [SCRIPT, "_corpus", "_data", "dist", "--check-allowlist"], { encoding: "utf8", cwd: ROOT });
      return { status: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
    } finally {
      writeFileSync(path, original, "utf8");
    }
  }

  it("passes when every entry still describes something present", () => {
    const { status, out } = runWithAllowlist(null);
    expect(status, out.slice(-400)).toBe(0);
  });

  it("FAILS on an entry whose value is no longer anywhere", () => {
    const { status, out } = runWithAllowlist({
      hash: "f".repeat(32),
      pattern: "street_address",
      occurrences: 3,
      status: "reviewed_not_protected",
      reason: "value since resolved at the source",
    });
    expect(status).toBe(1);
    expect(out).toContain("no longer match anything");
    expect(out).toContain("f".repeat(32));
    // The message has to say WHY, or the next person deletes the check instead
    // of the entry.
    expect(out).toContain("pre-authorisation");
  });

  it("is opt-in, so scanning a fixture does not report every entry as stale", () => {
    // THE DEFECT THIS ENCODES. The first version inferred "full scope" from
    // "no missing paths", which is true of any fixture directory. Every
    // allowlist entry then looked resolved-at-source and the tool failed on
    // every subset scan. Four existing tests caught it. Scope is stated now,
    // not guessed.
    const dir = mkdtempSync(join(tmpdir(), "pii-optin-"));
    try {
      writeFileSync(join(dir, "a.txt"), "Ordinary text with no identifiers.", "utf8");
      const r = spawnSync("python3", [SCRIPT, dir], { encoding: "utf8", cwd: ROOT });
      expect(r.status, (r.stdout ?? "") + (r.stderr ?? "")).toBe(0);
      expect((r.stdout ?? "") + (r.stderr ?? "")).not.toContain("no longer match anything");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT judge staleness on a narrowed scan, and says so", () => {
    // A local run without _site sees less content, so entries would look stale
    // that are merely out of view. Only a full-scope run can tell "gone" from
    // "not looked at" -- the same distinction the coverage report exists to
    // make, and a check that cries wolf gets deleted.
    const r = spawnSync("python3", [SCRIPT, "_corpus", "_data", "dist", "_absent_path_for_test", "--check-allowlist"], {
      encoding: "utf8", cwd: ROOT,
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    expect(r.status).toBe(0);
    expect(out).toContain("staleness NOT checked");
  });
});
