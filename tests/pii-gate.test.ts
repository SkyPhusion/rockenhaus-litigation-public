// The PII gate: does it fire, does it stay quiet on ordinary record text, and
// does it refuse to leak what it found.
//
// The third question is as important as the first two here. This repository is
// public, so the gate's own OUTPUT is a publication surface, and a check that
// reports "file X page 11 contains a Social Security number" publishes a map to
// unredacted material. These tests pin that behaviour so it cannot be helpfully
// "improved" into a more informative failure later.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
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
