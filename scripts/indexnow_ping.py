#!/usr/bin/env python3
"""Ping IndexNow after deploy so search engines pick up new/changed URLs."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEXNOW_PATH = ROOT / "_data" / "indexnow.json"
ENDPOINTS = [
    "https://api.indexnow.org/indexnow",
    "https://www.bing.com/indexnow",
]


def main() -> int:
    if not INDEXNOW_PATH.exists():
        print("No indexnow.json found; run generate_site.py first.", file=sys.stderr)
        return 1

    payload = json.loads(INDEXNOW_PATH.read_text(encoding="utf-8"))
    body = json.dumps(payload).encode("utf-8")

    for endpoint in ENDPOINTS:
        req = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                print(f"{endpoint}: HTTP {resp.status}")
        except urllib.error.HTTPError as exc:
            print(f"{endpoint}: HTTP {exc.code}", file=sys.stderr)
        except urllib.error.URLError as exc:
            print(f"{endpoint}: {exc.reason}", file=sys.stderr)

    print(f"Submitted {len(payload.get('urlList', []))} URLs to IndexNow")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
