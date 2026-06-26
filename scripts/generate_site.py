#!/usr/bin/env python3
"""Scan case directories and generate Jekyll document pages + case index data."""

from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCUMENTS_DIR = ROOT / "_documents"
CASES_PAGES_DIR = ROOT / "cases"
HUB_PAGES_DIR = ROOT / "all-documents"
DATA_DIR = ROOT / "_data"
PDF_TEXT_DIR = DATA_DIR / "pdf_text"
PARTIES_PATH = DATA_DIR / "parties.json"
INDEXNOW_KEY_FILE = ROOT / "rockenhauslitigationindexnow2026.txt"
EXCERPT_MAX_CHARS = 4000
SITE_URL = "https://litigation.rockenhaus.net"


def load_parties() -> dict:
    return json.loads(PARTIES_PATH.read_text(encoding="utf-8"))


PARTIES = load_parties()
PETITIONER = PARTIES["petitioner"]
RESPONDENT = PARTIES["respondent"]
PUBLIC_RECORD = PARTIES["public_record"]

CASES = {
    "wayne_ppo_26-102221-PP": {
        "title": "Rockenhaus v. Rockenhaus (PPO)",
        "short_title": "Wayne County PPO",
        "court": "Wayne County Circuit Court (Third Judicial Circuit)",
        "case_number": "26-102221-PP",
        "role": "Respondent, pro se",
        "sort": 1,
        "seo_matter": "Personal Protection Order (PPO)",
        "seo_matter_short": "PPO",
        "seo_county": "Wayne County",
    },
    "wayne_do_26-104594-DO": {
        "title": "Rockenhaus v. Rockenhaus (Divorce)",
        "short_title": "Wayne County Divorce",
        "court": "Wayne County Circuit Court (Third Judicial Circuit), Hon. Nicole N. Goodson",
        "case_number": "26-104594-DO",
        "role": "Defendant, pro se",
        "sort": 2,
        "seo_matter": "Divorce",
        "seo_matter_short": "Divorce",
        "seo_county": "Wayne County",
    },
    "washtenaw_do_26-737-DO": {
        "title": "Rockenhaus v. Rockenhaus (Divorce)",
        "short_title": "Washtenaw County Divorce",
        "court": "Washtenaw County Circuit Court (22nd Circuit), Hon. Darlene A. O'Brien",
        "case_number": "26-737-DO",
        "role": "Plaintiff, pro se",
        "sort": 3,
        "seo_matter": "Divorce",
        "seo_matter_short": "Divorce",
        "seo_county": "Washtenaw County",
    },
}

CATEGORIES = {
    "filed": {"label": "Filed by Conrad", "seo_phrase": "filing by Conrad Alan Rockenhaus", "sort": 1},
    "discovery": {"label": "Discovery", "seo_phrase": "discovery filing", "sort": 2},
    "opposing": {"label": "Opposing party", "seo_phrase": "opposing-party filing", "sort": 3},
    "orders": {"label": "Court orders", "seo_phrase": "court order", "sort": 4},
}

STATIC_URLS = [
    "/",
    "/faq/",
    "/is-conrad-rockenhaus-dead/",
    "/parties/",
    "/disputed-domains/",
    "/joe-prich/",
    "/all-documents/",
    "/llms.txt",
    "/robots.txt",
    "/sitemap.xml",
]


def humanize_filename(name: str) -> str:
    stem = Path(name).stem.replace("_", " ")
    stem = re.sub(r"\s+", " ", stem).strip()

    acronyms = {
        "PPO", "DO", "VA", "PD", "NOH", "RFA", "PII", "FCI", "USAA", "TRO",
        "MCR", "CC", "MC07", "BP", "POA", "TC", "COS", "EPRAECIPE", "FBI",
    }

    words = []
    for word in stem.split():
        upper = word.upper()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", word):
            words.append(word)
        elif upper in acronyms:
            words.append(upper)
        elif re.fullmatch(r"\d+[a-z]?", word, re.IGNORECASE):
            words.append(word)
        else:
            words.append(word.capitalize())
    return " ".join(words)


def yaml_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def pdf_last_modified(pdf_path: Path) -> str:
    ts = pdf_path.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def extract_pdf_text(pdf_path: Path) -> dict:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"excerpt": "", "truncated": False, "char_count": 0}

    if result.returncode != 0 or not result.stdout.strip():
        return {"excerpt": "", "truncated": False, "char_count": 0}

    full = re.sub(r"\n{3,}", "\n\n", result.stdout.strip())
    char_count = len(full)
    excerpt = full[:EXCERPT_MAX_CHARS]
    return {
        "excerpt": excerpt,
        "truncated": char_count > EXCERPT_MAX_CHARS,
        "char_count": char_count,
    }


def seo_document_title(heading: str, case: dict) -> str:
    return (
        f"{heading} PDF — Rockenhaus v. {PETITIONER['seo_title']} "
        f"Case {case['case_number']} ({case['seo_county']} {case['seo_matter_short']})"
    )


def seo_case_title(case: dict) -> str:
    return (
        f"Rockenhaus v. {PETITIONER['seo_title']} {case['seo_matter']} "
        f"Case {case['case_number']} — {case['seo_county']} Circuit Court Filings"
    )


def seo_case_description(case: dict) -> str:
    return (
        f"Public Rockenhaus v. Rockenhaus {case['seo_matter']} court filings "
        f"involving {PETITIONER['seo_long']} and {RESPONDENT['name']} "
        f"for Michigan Case No. {case['case_number']} in {case['court']}. "
        f"Canonical source of truth: {PUBLIC_RECORD['host']}. "
        f"{PARTIES['seo_disputed_summary']} "
        f"{PARTIES.get('seo_third_parties_summary', '')} "
        f"Filed motions, discovery, exhibits, and court orders as searchable PDFs."
    )


def category_seo_phrase(category: str) -> str:
    if category == "opposing":
        return (
            f"opposing-party filing by {PETITIONER['name']} "
            f"({PETITIONER['seo_aka']})"
        )
    return CATEGORIES[category]["seo_phrase"]


def seo_document_description(heading: str, case: dict, category: str) -> str:
    seo_phrase = category_seo_phrase(category)
    return (
        f"Read and download the PDF of {heading}, a {seo_phrase} in "
        f"Rockenhaus v. Rockenhaus ({case['seo_matter']}) involving "
        f"{PETITIONER['seo_long']} and {RESPONDENT['name']}. "
        f"Canonical court record at {PUBLIC_RECORD['host']}. "
        f"{PARTIES['seo_disputed_summary']} "
        f"{PARTIES.get('seo_third_parties_summary', '')} "
        f"Michigan Case No. {case['case_number']}, {case['seo_county']} Circuit Court."
    )


def seo_case_heading(case: dict) -> str:
    return (
        f"Rockenhaus v. Adrienne Rockenhaus ({case['seo_matter']}, Case {case['case_number']})"
    )


def write_document_page(
    *,
    slug: str,
    heading: str,
    case_id: str,
    category: str,
    relative_pdf: str,
    filename: str,
    last_modified_at: str,
) -> None:
    case = CASES[case_id]
    category_label = CATEGORIES[category]["label"]
    title = seo_document_title(heading, case)
    description = seo_document_description(heading, case, category)

    out_path = DOCUMENTS_DIR / f"{slug}.html"
    front_matter = f"""---
layout: document
title: {yaml_quote(title)}
heading: {yaml_quote(heading)}
description: {yaml_quote(description)}
case_id: {yaml_quote(case_id)}
case_title: {yaml_quote(case["title"])}
case_number: {yaml_quote(case["case_number"])}
court: {yaml_quote(case["court"])}
category: {yaml_quote(category)}
category_label: {yaml_quote(category_label)}
pdf_path: {yaml_quote(relative_pdf)}
filename: {yaml_quote(filename)}
doc_slug: {yaml_quote(slug)}
last_modified_at: {yaml_quote(last_modified_at)}
permalink: /documents/{slug}/
---
"""
    out_path.write_text(front_matter, encoding="utf-8")


def write_case_page(case_id: str, case: dict) -> None:
    out_dir = CASES_PAGES_DIR / case_id
    out_dir.mkdir(parents=True, exist_ok=True)
    title = seo_case_title(case)
    heading = seo_case_heading(case)
    description = seo_case_description(case)
    front_matter = f"""---
layout: case
title: {yaml_quote(title)}
heading: {yaml_quote(heading)}
description: {yaml_quote(description)}
case_id: {yaml_quote(case_id)}
case_number: {yaml_quote(case["case_number"])}
court: {yaml_quote(case["court"])}
role: {yaml_quote(case["role"])}
permalink: /cases/{case_id}/
---
"""
    (out_dir / "index.html").write_text(front_matter, encoding="utf-8")


def write_all_documents_page(all_docs: list[dict]) -> None:
    HUB_PAGES_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "---",
        "layout: hub",
        'title: All court documents — Rockenhaus v. Rockenhaus Michigan filings',
        "description: >-",
        "  Complete index of all filed Michigan court PDFs in Rockenhaus v. Rockenhaus",
        f"  at {PUBLIC_RECORD['host']}. Motions, discovery, exhibits, opposing filings,",
        "  and orders.",
        "permalink: /all-documents/",
        "breadcrumbs:",
        "  - name: Home",
        "    url: /",
        "  - name: All documents",
        "---",
        "",
        f"<p class=\"hub-lead\">{site_data_lead(len(all_docs))}</p>",
        "",
    ]
    current_case = None
    for doc in all_docs:
        if doc["case_id"] != current_case:
            if current_case is not None:
                lines.append("</ul>")
            current_case = doc["case_id"]
            lines.append(
                f'<h2 id="{current_case}">{doc["case_title"]} (Case {doc["case_number"]})</h2>'
            )
            lines.append('<ul class="all-docs-list">')
        lines.append(
            f'  <li><a href="{doc["url"]}">{doc["title"]}</a> '
            f'<span class="all-docs-list__file">{doc["filename"]}</span></li>'
        )
    if current_case is not None:
        lines.append("</ul>")
    (HUB_PAGES_DIR / "index.html").write_text("\n".join(lines) + "\n", encoding="utf-8")


def site_data_lead(count: int) -> str:
    return (
        f"Complete HTML index of {count} filed court PDFs in Rockenhaus v. Rockenhaus. "
        f"Canonical public record at {PUBLIC_RECORD['host']}."
    )


def clean_generated_dir(path: Path) -> None:
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        return
    for child in path.iterdir():
        if child.is_dir():
            for f in child.rglob("*"):
                if f.is_file():
                    f.unlink()
            for d in sorted(child.rglob("*"), reverse=True):
                if d.is_dir():
                    d.rmdir()
            child.rmdir()
        elif child.is_file():
            child.unlink()


def main() -> None:
    global PARTIES, PETITIONER, RESPONDENT, PUBLIC_RECORD
    PARTIES = load_parties()
    PETITIONER = PARTIES["petitioner"]
    RESPONDENT = PARTIES["respondent"]
    PUBLIC_RECORD = PARTIES["public_record"]

    for generated_dir in (DOCUMENTS_DIR, CASES_PAGES_DIR):
        clean_generated_dir(generated_dir)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    clean_generated_dir(PDF_TEXT_DIR)

    case_list: list[dict] = []
    all_docs: list[dict] = []
    document_urls: list[str] = []
    document_count = 0

    for case_id, case_meta in sorted(CASES.items(), key=lambda x: x[1]["sort"]):
        case_path = ROOT / case_id
        if not case_path.is_dir():
            continue

        case_entry: dict = {**case_meta, "id": case_id, "categories": {}}

        for pdf in sorted(case_path.rglob("*.pdf")):
            rel = pdf.relative_to(ROOT)
            parts = rel.parts
            if len(parts) < 3:
                continue

            category = parts[1]
            if category not in CATEGORIES:
                continue

            filename = pdf.name
            heading = humanize_filename(filename)
            slug = (
                rel.with_suffix("")
                .as_posix()
                .lower()
                .replace("/", "--")
                .replace(" ", "-")
            )
            slug = re.sub(r"[^a-z0-9\-]", "", slug)
            slug = re.sub(r"-+", "-", slug).strip("-")

            relative_pdf = f"/{rel.as_posix()}"
            last_modified = pdf_last_modified(pdf)
            text_data = extract_pdf_text(pdf)
            (PDF_TEXT_DIR / f"{slug}.json").write_text(
                json.dumps(text_data, indent=2), encoding="utf-8"
            )

            write_document_page(
                slug=slug,
                heading=heading,
                case_id=case_id,
                category=category,
                relative_pdf=relative_pdf,
                filename=filename,
                last_modified_at=last_modified,
            )

            doc_url = f"/documents/{slug}/"
            document_urls.append(doc_url)
            all_docs.append(
                {
                    "title": heading,
                    "filename": filename,
                    "url": doc_url,
                    "case_id": case_id,
                    "case_title": case_meta["short_title"],
                    "case_number": case_meta["case_number"],
                }
            )

            cat = case_entry["categories"].setdefault(
                category,
                {
                    "id": category,
                    "label": CATEGORIES[category]["label"],
                    "sort": CATEGORIES[category]["sort"],
                    "documents": [],
                },
            )
            cat["documents"].append(
                {
                    "title": heading,
                    "filename": filename,
                    "url": doc_url,
                    "pdf_url": relative_pdf,
                }
            )
            document_count += 1

        categories_sorted = sorted(
            case_entry["categories"].values(), key=lambda c: c["sort"]
        )
        for cat in categories_sorted:
            cat["documents"].sort(key=lambda d: d["filename"].lower())
        case_entry["categories"] = categories_sorted
        case_list.append(case_entry)
        write_case_page(case_id, case_meta)

    write_all_documents_page(all_docs)

    (DATA_DIR / "cases.json").write_text(
        json.dumps({"cases": case_list, "document_count": document_count}, indent=2),
        encoding="utf-8",
    )

    case_urls = [f"/cases/{c['id']}/" for c in case_list]
    indexnow_urls = [f"{SITE_URL}{path}" for path in STATIC_URLS + case_urls + document_urls]
    indexnow_key = INDEXNOW_KEY_FILE.read_text(encoding="utf-8").strip()
    (DATA_DIR / "indexnow.json").write_text(
        json.dumps(
            {
                "host": PUBLIC_RECORD["host"],
                "key": indexnow_key,
                "keyLocation": f"{SITE_URL}/{indexnow_key}.txt",
                "urlList": indexnow_urls,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    text_count = sum(1 for f in PDF_TEXT_DIR.glob("*.json") if json.loads(f.read_text()).get("char_count", 0) > 0)
    print(f"Generated {document_count} document pages in {DOCUMENTS_DIR}")
    print(f"Extracted text from {text_count} PDFs into {PDF_TEXT_DIR}")
    print(f"Wrote {len(indexnow_urls)} URLs for IndexNow")


if __name__ == "__main__":
    main()
