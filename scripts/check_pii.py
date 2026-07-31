#!/usr/bin/env python3
"""Fail the build if protected personal information reaches anything published.

WHY THIS GATE RUNS BEFORE PUBLISH AND NOT AFTER

MCR 1.109(D)(9) names the categories of protected personal identifying
information that stay out of a public filing: Social Security numbers, dates of
birth, financial account numbers, minors' names, home addresses. Upstream
enforcement is uneven, and a document served between parties was never screened
by a clerk at all, so the site cannot assume the documents it publishes arrived
already scrubbed.

The site is dedicated CC0, which invites mirrors. A mirror cannot be recalled.
So there is no effective unpublish, and a scan that runs after publication is
cleanup rather than a control. This runs before, and it fails closed: any hit
stops the build.

WHAT THIS FILE NEVER DOES

It never prints a match, and by default it never prints a LOCATION either.

Writing a suspected Social Security number into a CI log publishes it to
everyone who can read the log, which is the defect rather than the report of it.
So values are always masked. But this repository is public, so a CI log is
itself a published document, and a failure naming file, page and pattern would
be a public index of exactly where unredacted material sits: a worse disclosure
than the one being reported. The default output is therefore counts by pattern
and nothing else, which is all a build needs in order to stop. `--detail` prints
locations and is for local runs, where the output is not published.

The allowlist stores a salted hash rather than the value, and deliberately does
not record which document a hash came from, for the same reason: accepting a
false positive must never require writing the value, or a map to it, into a
public repository.

WHAT IT CAN AND CANNOT DO

Shapes are mechanical and it finds them well: SSN, account-number, date-of-birth
and street-address patterns. Minors' names are NOT mechanically detectable, and
a list of them in a public repository would be the very disclosure being
prevented. So the minor rule is inverted: it flags the CONTEXTS where MCR
1.109(D)(9) requires initials and a full name appears anyway, which produces a
short list a human reads. That is a prompt for review, not a proof of absence.

Usage:
  python3 scripts/check_pii.py <path> [<path> ...]     scan files or directories
  python3 scripts/check_pii.py ... --detail            print locations (local only)
  python3 scripts/check_pii.py ... --check-allowlist   also fail on stale allowlist
                                                       entries; only meaningful
                                                       over the whole published set
  python3 scripts/check_pii.py --self-test             prove the patterns fire
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWLIST_PATH = ROOT / "_data" / "pii_allowlist.json"

# Salt for allowlist hashes. NOT a secret: it exists so that a hash in a public
# file cannot be brute-forced back to a short value like a date of birth by
# anyone who guesses the format. A per-repo constant is enough for that.
HASH_SALT = "rockenhaus-pii-allowlist-v1"

SCAN_SUFFIXES = {".txt", ".html", ".json", ".md", ".xml"}


def digest(value: str) -> str:
    return hashlib.sha256((HASH_SALT + value).encode("utf-8")).hexdigest()[:32]


def mask(value: str) -> str:
    """A match, rendered so the finding is actionable and the value is not."""
    keep = 2 if len(value) > 6 else 1
    return value[:keep] + "*" * max(3, len(value) - 2 * keep) + value[-keep:]


# --- the patterns -----------------------------------------------------------
#
# Each carries the MCR 1.109(D)(9) category it serves. Ordered most specific
# first so a finding names the narrowest rule that caught it.

PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "ssn",
        re.compile(r"(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])"),
        "Social Security number, hyphenated",
    ),
    (
        "ssn_labelled",
        re.compile(
            r"(?:social security(?:\s+(?:number|no\.?|#))?|ssn|ss#)\s*[:#]?\s*(?:x{0,5}[-\s]?)?(\d[\d\s-]{6,})",
            re.IGNORECASE,
        ),
        "digits following a Social Security label",
    ),
    (
        "account_number",
        re.compile(
            r"(?:account|acct\.?|policy|card)\s*(?:number|no\.?|#)?\s*[:#]?\s*(?:x{2,}[-\s]?)?(\d[\d\s-]{5,})",
            re.IGNORECASE,
        ),
        "digits following a financial account label",
    ),
    (
        # SPLIT OUT OF account_number, because they are not the same thing.
        #
        # An account number identifies a person's account and is named in MCR
        # 1.109(D)(9). A routing number identifies a BANK: it is printed on
        # every cheque, published by the institutions themselves, and looked up
        # freely. Every one of the eight "account_number" matches this gate
        # reported was in fact a routing number, and one of the filings that
        # carries them argues the point in its own text.
        #
        # Kept as a pattern rather than dropped: a routing number is worth
        # seeing, and beside a full account number it would matter. Reported
        # under its own name so the account_number count means what it says.
        "routing_number",
        re.compile(
            r"routing\s*(?:number|no\.?|#)?\s*[:#]?\s*(\d[\d\s-]{5,})",
            re.IGNORECASE,
        ),
        "digits following a routing-number label (identifies a bank, not a person)",
    ),
    (
        "date_of_birth",
        re.compile(
            r"(?:date of birth|d\.?o\.?b\.?|born on|birth date)\s*[:#]?\s*"
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4})",
            re.IGNORECASE,
        ),
        "a date following a date-of-birth label",
    ),
    (
        "street_address",
        re.compile(
            r"\b\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}\s+"
            r"(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|"
            r"Boulevard|Blvd\.?|Way|Circle|Cir\.?|Place|Pl\.?|Terrace|Trail|Parkway|Pkwy\.?)"
            r"(?![A-Za-z])",
        ),
        "a street address",
    ),
    (
        "ssn_label_ocr",
        re.compile(r"\bs\.?\s?s\.?\s?n\b[^\n]{0,24}?\d", re.IGNORECASE),
        "digits following an SSN label, tolerant of OCR noise between the two",
    ),
    (
        "drivers_licence_label",
        re.compile(
            r"driver'?s?\s+lic[a-z]{0,4}se[^\n]{0,28}?([A-Za-z]?[\s.-]{0,2}\d[\d\s.-]{6,})",
            re.IGNORECASE,
        ),
        "an identifier following a driver's licence label",
    ),
    (
        "drivers_licence_shape",
        re.compile(r"\b[A-Za-z][\s.-]{0,2}\d{3}[\s.-]{0,2}\d{3}[\s.-]{0,2}\d{3}[\s.-]{0,2}\d{3}\b"),
        "a Michigan driver's licence number shape",
    ),
    (
        "minor_named",
        re.compile(
            r"(?:minor child|minor children|the minor|my minor|our minor)[^.\n]{0,40}?"
            r"\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b",
        ),
        "a full name in a minor-child context, where the rule requires initials",
    ),
]


def page_states(root: Path = ROOT) -> dict:
    """What the gate can and cannot read, from the corpus manifest.

    THE POINT OF THIS FUNCTION. A text-based gate reads text. Pages with no text
    layer are not scanned at all, and OCR pages are scanned imperfectly: today
    the same corpus defeated a tight pattern in one place and a loose one in
    another. So a clean result means "no match in the text we could extract",
    which is a different claim from "the corpus is clean".

    The difference is invisible unless the gate says so itself, which is why
    these counts print on every run, pass or fail, and why the unreadable pages
    are named rather than counted. Scanned pages are where filled-in forms live,
    forms are where identity data is, and a page nobody can machine-read is
    exactly the page a person should look at.
    """
    manifest = root / "_corpus" / "manifest.json"
    if not manifest.is_file():
        return {}
    pages = json.loads(manifest.read_text(encoding="utf-8")).get("pages", [])
    counts: dict[str, int] = {}
    unreadable = []
    for page in pages:
        source = page.get("text_source", "unknown")
        counts[source] = counts.get(source, 0) + 1
        if source == "none":
            unreadable.append(f"{page['doc_slug']} p{page['page']:03d} of {page['total_pages']}")
    return {"counts": counts, "total": len(pages), "unreadable": sorted(unreadable)}


def print_coverage(states: dict) -> None:
    """Print coverage before any verdict, so the verdict is read in context."""
    if not states:
        print("check_pii: no corpus manifest found; page-state coverage unknown.")
        return
    c = states["counts"]
    native, ocr, none = c.get("native", 0), c.get("ocr", 0), c.get("none", 0)
    print(f"check_pii: corpus coverage, {states['total']} page(s)")
    print(f"  {native:5}  native text   scanned")
    print(f"  {ocr:5}  OCR text      scanned, imperfectly: OCR noise can hide a value from any pattern")
    print(f"  {none:5}  no text layer NOT SCANNED, this gate cannot read these at all")
    if states["unreadable"]:
        print("\n  Pages this gate cannot read, which a person has to:")
        for entry in states["unreadable"]:
            print(f"    {entry}")
        print(
            "\n  These are named rather than counted because a silence is not a result.\n"
            "  They are already published, so listing them discloses nothing new; what it\n"
            "  does is turn an unstated blind spot into a review list."
        )
    print()


def stale_allowlist_entries(allowed: dict[str, dict], matched: set[str]) -> list[dict]:
    """Allowlist entries whose value no longer appears anywhere scanned.

    WHY THIS IS A FAILURE AND NOT HOUSEKEEPING. An entry says "this exact value
    does not stop the build". When the value has been resolved at the source,
    by withdrawing a document or withholding a page, the entry outlives the
    thing it described and becomes a standing pre-authorisation: if that value
    ever reappears, through a restored document or a re-added exhibit, the gate
    stays green and nobody is told.

    Resolved-at-source and allowlisted are mutually exclusive states, and until
    now nothing enforced that. It held only because the file happened to be
    regenerated from the live corpus each time it changed.

    NOT CHECKED ON A NARROWED RUN. A local scan without _site sees less content,
    so entries would look stale that are merely out of view, and a check that
    cries wolf gets ignored. Only a full-scope run can distinguish "gone" from
    "not looked at", which is the same distinction the coverage report exists to
    make.
    """
    return [e for h, e in sorted(allowed.items()) if h not in matched]


def load_allowlist() -> dict[str, dict]:
    if not ALLOWLIST_PATH.exists():
        return {}
    data = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    return {entry["hash"]: entry for entry in data.get("accepted", [])}


def scan_text(text: str, path: str, allowed: dict[str, dict], matched: set[str] | None = None) -> list[dict]:
    findings = []
    for name, pattern, description in PATTERNS:
        for m in pattern.finditer(text):
            value = (m.group(1) if m.groups() else m.group(0)).strip()
            if not value:
                continue
            h = digest(value)
            if h in allowed:
                if matched is not None:
                    matched.add(h)
                continue
            line = text.count("\n", 0, m.start()) + 1
            findings.append(
                {
                    "path": path,
                    "line": line,
                    "pattern": name,
                    "description": description,
                    "masked": mask(value),
                    "hash": h,
                }
            )
    return findings


def files_under(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    return [p for p in sorted(target.rglob("*")) if p.is_file() and p.suffix.lower() in SCAN_SUFFIXES]


def self_test() -> int:
    """Prove every pattern fires, and that ordinary record text does not.

    A guard nobody has watched catch something is a guard nobody knows works.
    The positives use invalid, obviously-synthetic values.
    """
    positives = [
        ("ssn", "Respondent SSN 000-00-0000 appears in the exhibit."),
        ("ssn_labelled", "Social Security Number: 000 00 0000"),
        ("account_number", "USAA account no. 0000000000 was drawn on."),
        ("routing_number", "The routing number 000000000 identifies the bank."),
        ("date_of_birth", "Date of Birth: 01/01/1900"),
        ("street_address", "served at 1234 Example Street, Detroit"),
        ("minor_named", "the minor child Example Personname attends school"),
        # OCR noise between a label and its value, which is how the real one
        # was missed: the label rendered with punctuation and a stray letter
        # before the digits, so a tight pattern found nothing.
        ("ssn_label_ocr", "Name Example Person SSN. S 00 or 0 -0000"),
        ("drivers_licence_label", "Driver's license number (if known) B 000 000 000 000"),
        ("drivers_licence_shape", "issued as A 000 000 000 000 by the state"),
    ]
    negatives = [
        # These four are real prose from this corpus. The first draft of the
        # licence pattern matched all of them: a label in a sentence is not a
        # value, and a gate that cannot tell them apart trains people to ignore
        # it. Conrad's own motion to seal PII names every category by design.
        "driver's license, VA ID, bank statements and other records",
        "protected identifiers include a driver's license number or state",
        "Exhibit 5 includes a driver's license photocopy, redacted.",
        "MCR 1.109(D)(9) covers a driver's license number among other identifiers.",
        "Case No. 26-104594-DO was filed on 2026-04-15.",
        "MCR 2.302(B)(3) governs work product.",
        "The motion filed 2026-07-02 alleges the account was misused.",
        "Page 3 of 11, exhibit 12, ECF 44-1.",
        "Wayne County Circuit Court (Third Judicial Circuit)",
    ]

    failures = []
    for name, sample in positives:
        hits = {f["pattern"] for f in scan_text(sample, "<self-test>", {})}
        if name not in hits:
            failures.append(f"pattern {name!r} did not fire on its own positive sample")
    for sample in negatives:
        hits = scan_text(sample, "<self-test>", {})
        if hits:
            failures.append(f"false positive on ordinary record text: {hits[0]['pattern']}")

    if failures:
        print("check_pii --self-test FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    print(f"check_pii --self-test: {len(positives)} patterns fire, {len(negatives)} negative controls clean.")
    return 0


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    detail = "--detail" in sys.argv
    # Opt-in, because staleness is only meaningful over the WHOLE published set.
    # A scan of one directory, a fixture, or a single document is a legitimate
    # use and must not report every entry as stale. The workflows pass this;
    # ad-hoc runs do not.
    check_allowlist = "--check-allowlist" in sys.argv
    if "--self-test" in sys.argv:
        return self_test()

    if not args:
        print("Usage: check_pii.py <path> [<path> ...] | --self-test", file=sys.stderr)
        return 2

    print_coverage(page_states())

    allowed = load_allowlist()
    matched: set[str] = set()
    findings: list[dict] = []
    scanned = 0

    missing = [a for a in args if not Path(a).exists()]
    if missing:
        # NOT a silent skip. The local npm script and the CI workflows must scan
        # the same thing, and _site only exists after a build, so a dev running
        # this locally would otherwise get a narrower scan than CI and read a
        # clean result as clean. Same family as scanning _corpus without _data.
        print(
            "check_pii: SCOPE IS NARROWER THAN CI. These paths do not exist here and were NOT scanned:",
            file=sys.stderr,
        )
        for a in missing:
            print(f"  {a}", file=sys.stderr)
        print(
            "  CI scans _corpus, _data and _site. _site exists only after a full build, so a\n"
            "  local run without it has NOT checked what actually publishes. A clean result\n"
            "  below covers the paths listed as scanned and nothing else.\n",
            file=sys.stderr,
        )

    for arg in args:
        target = Path(arg)
        if not target.exists():
            continue
        for path in files_under(target):
            scanned += 1
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                print(f"check_pii: cannot read {path}: {exc}", file=sys.stderr)
                return 2
            findings.extend(scan_text(text, str(path), allowed, matched))

    if scanned == 0:
        print("check_pii: nothing was scanned. Refusing to report clean on an empty run.", file=sys.stderr)
        return 2

    if check_allowlist and not missing:
        stale = stale_allowlist_entries(allowed, matched)
        if stale:
            print(
                f"::error::{len(stale)} allowlist entry/entries no longer match anything",
                file=sys.stderr,
            )
            print(
                "\nAn allowlist entry says a specific value does not stop the build. These\n"
                "values are no longer present anywhere scanned, which means they were\n"
                "resolved at the source: a document withdrawn, or a page withheld.\n"
                "\n"
                "Leaving the entry is not tidy-up debt. It is a standing pre-authorisation:\n"
                "if that exact value ever comes back, through a restored document or a\n"
                "re-added exhibit, the gate stays green and nobody is told. Resolved at the\n"
                "source and allowlisted are mutually exclusive states.\n",
                file=sys.stderr,
            )
            for e in stale:
                print(f"  {e['hash']}  [{e.get('pattern', 'unknown')}]  {e.get('status', '')}", file=sys.stderr)
            print("\nRemove these entries from _data/pii_allowlist.json.", file=sys.stderr)
            return 1
    elif check_allowlist and allowed:
        print(
            "check_pii: allowlist staleness NOT checked, because the scan scope was narrower\n"
            "  than CI. An entry can only be called stale when everything has been looked at.",
            file=sys.stderr,
        )

    if findings:
        by_pattern: dict[str, int] = {}
        for f in findings:
            by_pattern[f["pattern"]] = by_pattern.get(f["pattern"], 0) + 1

        print("::error::possible protected personal information in published content", file=sys.stderr)
        print(f"\n{len(findings)} match(es) across {len({f['path'] for f in findings})} file(s):\n", file=sys.stderr)
        for name, count in sorted(by_pattern.items(), key=lambda kv: -kv[1]):
            print(f"  {count:5}  {name}", file=sys.stderr)

        if detail:
            print("\n--- locations (--detail) ---", file=sys.stderr)
            for f in findings:
                print(f"  {f['path']}:{f['line']}  [{f['pattern']}] match={f['masked']}  hash={f['hash']}", file=sys.stderr)
        else:
            print(
                "\nLOCATIONS ARE NOT PRINTED HERE, and that is deliberate.\n"
                "\n"
                "This repository is public, so a CI log is a published document. A failure that\n"
                "named the file, the page and the pattern would be a public index of exactly where\n"
                "unredacted material sits, which is a worse disclosure than the one being reported.\n"
                "The summary above is enough to know the build must stop.\n"
                "\n"
                "To see locations, run it locally, where the output is not published:\n"
                "    python3 scripts/check_pii.py _corpus --detail\n"
                "Values stay masked even then: printing one publishes it.",
                file=sys.stderr,
            )

        print(
            "\nA match is either real, and the SOURCE PDF must be redacted and the corpus rebuilt\n"
            "before it can publish, or a false positive, accepted by adding its hash to\n"
            "_data/pii_allowlist.json with a reason. Never paste a matched value anywhere.",
            file=sys.stderr,
        )
        return 1

    print(
        f"check_pii: {scanned} file(s) scanned against {len(PATTERNS)} patterns, no findings.\n"
        "  This means no match in the text that could be extracted. It is not a\n"
        "  statement about pages with no text layer, which are listed above."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
