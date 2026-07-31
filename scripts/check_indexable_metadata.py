#!/usr/bin/env python3
"""Fail if a denylisted term reaches INDEXABLE metadata on any built page.

The defect that put this site in the hole was structured data: FAQPage blocks
whose every `text` field asserted that a named private individual is a neo-Nazi.
Search engines read structured data as machine-readable claims, so that is the
worst possible place for an accusation to live.

WHERE THE LIST COMES FROM, and why that changed
  This script used to carry its own four-pattern list: neo-nazi, neo nazi,
  nazzy, do not hire. No names. src/lib/guard.ts carried a different list of
  fifteen, names included, but ran only at Astro build time and so could not see
  the Jekyll-era pages. The two guards had different reaches AND different
  lists, and the gap between them was not theoretical: /retractions/rob-hein/
  shipped a non-party name seven times inside its <head> with CI green.

  Both consumers now read _data/metadata_denylist.json. tests/guard.test.ts
  asserts this script and guard.ts resolve to the same terms, so a term added in
  one place cannot silently fail to apply in the other.

WHAT IS CHECKED
  - the <head> of EVERY page, including noindex ones
  - every application/ld+json block, wherever it appears in the document

  noindex pages are deliberately still checked. Exhibit pages under /evidence/
  are noindex, but if accusation text ever reached one of their own titles or
  descriptions this should still catch it. noindex is a request to a search
  engine, not a guarantee, and it is not a licence to put a claim in a title.

WHAT IS NOT CHECKED, deliberately
  - page bodies

  Exhibit pages reproduce what an artifact shows on its face, verbatim. That
  quotation is legitimate and is the entire point of an exhibit index; a check
  that blocked it would force the evidence to be paraphrased, which is worse
  evidence.

WHY THIS PARSES RATHER THAN SLICES
  An earlier version extracted the head with a LINE based sed range. Astro emits
  minified single-line HTML, so the range never terminated and the head check
  silently scanned the entire document body. Measured on a real built page: the
  slice returned 3540 bytes of a 3540 byte file. Parsing the markup fixes that.

Usage: python3 scripts/check_indexable_metadata.py [site_dir]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DENYLIST_PATH = ROOT / "_data" / "metadata_denylist.json"


def load_terms() -> list[str]:
    """The single denylist, shared with src/lib/guard.ts.

    WHICH TIERS APPLY IS DATA, NOT CODE. `denied_tiers` in the JSON names them,
    and guard.ts reads the same key. This used to hardcode `third_party` and
    `party_handles` in both files, so Conrad's 2026-07-31 ruling, which renamed a
    tier and widened it, would have been a change in four places of which two
    could be forgotten and neither would have failed loudly.

    Every denied tier applies identically. Tier membership is an argument about
    WHY a term is listed, not a difference in how metadata is treated: metadata
    names the CASE, not PEOPLE.
    """
    data = json.loads(DENYLIST_PATH.read_text(encoding="utf-8"))
    tiers = data["denied_tiers"]
    if not tiers:
        raise SystemExit("denylist has no denied_tiers; refusing to run a guard that cannot fail")
    terms: list[str] = []
    for tier in tiers:
        if tier not in data:
            raise SystemExit(f"denied_tiers names {tier!r}, which is not in the denylist")
        terms.extend(data[tier]["terms"])
    return terms


TERMS = load_terms()

# Word-ish boundaries on both sides, matching the guard.ts matcher, so that a
# short term cannot fire inside an unrelated longer token.
PATTERN_RE = re.compile(
    "|".join(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])" for t in TERMS),
    re.IGNORECASE,
)
HEAD_RE = re.compile(r"<head\b[^>]*>(.*?)</head>", re.IGNORECASE | re.DOTALL)
LDJSON_RE = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


def indexable_regions(html: str) -> list[tuple[str, str]]:
    """(label, text) regions that a search engine would read as claims."""
    regions: list[tuple[str, str]] = []
    head = HEAD_RE.search(html)
    if head:
        regions.append(("head", head.group(1)))
    for i, block in enumerate(LDJSON_RE.findall(html)):
        regions.append((f"json-ld[{i}]", block))
    return regions


def check_file(path: Path) -> list[str]:
    try:
        html = path.read_text(encoding="utf-8", errors="replace")
    except OSError as err:
        return [f"{path}: unreadable ({err})"]

    problems = []
    for label, text in indexable_regions(html):
        for match in PATTERN_RE.finditer(text):
            start = max(0, match.start() - 40)
            end = min(len(text), match.end() + 40)
            excerpt = " ".join(text[start:end].split())
            problems.append(f"{path} [{label}] {match.group(0)!r}: ...{excerpt}...")
    return problems


def main() -> int:
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    if not site.is_dir():
        print(f"::error::site directory not found: {site}")
        return 1

    if not TERMS:
        print("::error::denylist resolved to zero terms; this check would pass vacuously")
        return 1

    files = sorted(site.rglob("*.html"))
    if not files:
        print(f"::error::no HTML files under {site}; the build produced nothing to check")
        return 1

    problems: list[str] = []
    for path in files:
        problems.extend(check_file(path))

    if problems:
        print("::error::denylisted term reached indexable metadata:")
        for p in problems:
            print(f"  {p}")
        return 1

    print(
        f"OK: {len(files)} page(s) checked (head + JSON-LD) against {len(TERMS)} "
        "denylisted term(s), no denylisted text in indexable metadata"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
