#!/usr/bin/env python3
"""Purge Cloudflare cache for litigation.rockenhaus.net after deploy."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

PURGE_HOST = "litigation.rockenhaus.net"
API_URL_TEMPLATE = "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache"


def main() -> int:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    zone_id = os.environ.get("CLOUDFLARE_ZONE_ID", "").strip()
    if not token or not zone_id:
        print(
            "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID must be set.",
            file=sys.stderr,
        )
        return 1

    payload = {"hosts": [PURGE_HOST]}
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

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"Cloudflare purge failed: HTTP {exc.code}", file=sys.stderr)
        print(detail, file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Cloudflare purge failed: {exc.reason}", file=sys.stderr)
        return 1

    if not result.get("success"):
        print(json.dumps(result, indent=2), file=sys.stderr)
        return 1

    print(f"Purged Cloudflare cache for host: {PURGE_HOST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
