#!/usr/bin/env python3
"""Purge Cloudflare cache for rockenhaus.net hostnames after deploy.

P0 SEO fix (2026-08-04): apex rockenhaus.net was observed serving multi-day-old
HTML (Cache-Control max-age ~1y, age ~3.7d) while litigation.rockenhaus.net was
fresh. Hosts purge alone is not enough if HTML is over-cached; we also purge
by prefix for all three hostnames so homepage and hub HTML refresh.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

PURGE_HOSTS = [
    "rockenhaus.net",
    "www.rockenhaus.net",
    "litigation.rockenhaus.net",
]
PURGE_PREFIXES = [
    "https://rockenhaus.net/",
    "https://www.rockenhaus.net/",
    "https://litigation.rockenhaus.net/",
]
API_URL_TEMPLATE = "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache"


def _post_purge(token: str, zone_id: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL_TEMPLATE.format(zone_id=zone_id),
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    zone_id = os.environ.get("CLOUDFLARE_ZONE_ID", "").strip()
    if not token or not zone_id:
        print(
            "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID must be set.",
            file=sys.stderr,
        )
        return 1

    attempts = [
        ("hosts", {"hosts": PURGE_HOSTS}),
        ("prefixes", {"prefixes": PURGE_PREFIXES}),
    ]

    any_ok = False
    for label, payload in attempts:
        try:
            result = _post_purge(token, zone_id, payload)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            print(f"Cloudflare purge ({label}) failed: HTTP {exc.code}", file=sys.stderr)
            print(detail, file=sys.stderr)
            continue
        except urllib.error.URLError as exc:
            print(f"Cloudflare purge ({label}) failed: {exc.reason}", file=sys.stderr)
            continue

        if not result.get("success"):
            print(f"Cloudflare purge ({label}) unsuccessful:", file=sys.stderr)
            print(json.dumps(result, indent=2), file=sys.stderr)
            continue

        print(f"Purged Cloudflare cache via {label}: {payload}")
        any_ok = True

    if not any_ok:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())