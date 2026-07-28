#!/usr/bin/env python3
"""Fail if a third-party characterisation reaches INDEXABLE metadata.

The defect that put this site in the hole was structured data: FAQPage blocks
whose every `text` field asserted that a named private individual is a neo-Nazi.
Search engines read structured data as machine-readable claims, so that is the
worst possible place for an accusation to live.

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

WHY THIS REPLACED THE INLINE SHELL VERSION
  The previous check extracted the head with `sed -n '/<head>/,/<\\/head>/p'`,
  which is LINE based. Astro emits minified single-line HTML, so the range never
  terminated and the "head" check silently scanned the entire document body. It
  reported a real string in a legitimate place and would have kept doing so for
  any minified page. Parsing the markup instead of slicing lines fixes it, and
  extending the check to JSON-LD anywhere in the document makes it strictly
  stronger than what it replaces.

Usage: python3 scripts/check_indexable_metadata.py [site_dir]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERNS = [
    r"neo-nazi",
    r"neo nazi",
    r"nazzy",
    r"do not hire",
]

PATTERN_RE = re.compile("|".join(PATTERNS), re.IGNORECASE)
HEAD_RE = re.compile(r"<head\b[^>]*>(.*?)</head>", re.IGNORECASE | re.DOTALL)
LDJSON_RE = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)
NOINDEX_RE = re.compile(
    r"<meta[^>]*name\s*=\s*[\"']robots[\"'][^>]*content\s*=\s*[\"'][^\"']*noindex",
    re.IGNORECASE,
)


def is_noindex(html: str) -> bool:
    return bool(NOINDEX_RE.search(html))


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
    site = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    if not site.is_dir():
        print(f"::error::site directory not found: {site}")
        return 1

    files = sorted(site.rglob("*.html"))
    if not files:
        print(f"::error::no HTML files under {site}; the build produced nothing to check")
        return 1

    problems: list[str] = []
    for path in files:
        problems.extend(check_file(path))

    if problems:
        print("::error::accusation text reached indexable metadata:")
        for p in problems:
            print(f"  {p}")
        return 1

    print(
        f"OK: {len(files)} page(s) checked (head + JSON-LD), "
        "no accusation text in indexable metadata"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
