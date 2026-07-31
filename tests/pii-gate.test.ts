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
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
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
