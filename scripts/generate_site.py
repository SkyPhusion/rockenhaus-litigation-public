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
WITHHELD_PATH = DATA_DIR / "withheld_pages.json"
EXCERPT_MAX_CHARS = 4000

# This generator no longer owns the IndexNow submission list, and no longer
# owns any list of site URLs at all. Both are derived from the deployed
# artifact now: scripts/build-sitemap.mjs walks the merged site and
# scripts/build-indexnow.mjs reads the sitemap it wrote.
#
# The list that used to live here drifted from what the site publishes in both
# directions. It kept naming the three pages deleted in PR #7 and re-submitted
# them to Bing on every deploy for three weeks, and it omitted all 173 filed
# PDFs, which are the record.


def load_parties() -> dict:
    return json.loads(PARTIES_PATH.read_text(encoding="utf-8"))


PARTIES = load_parties()


def load_withheld() -> dict:
    """Pages withheld from a published document, by slug.

    Rendered as a visible notice. An undisclosed removal from a published court
    record is falsification; a disclosed one is redaction, which is what courts
    do routinely. The difference is entirely whether the reader can see it.
    """
    if not WITHHELD_PATH.is_file():
        return {}
    return json.loads(WITHHELD_PATH.read_text(encoding="utf-8")).get("documents", {})


WITHHELD = load_withheld()
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

# The court WITHOUT the assigned judge, for structured data.
#
# Two of the three `court` strings end ", Hon. <name>". That field is emitted
# into JSON-LD as schema.org Courthouse.name on all 173 document pages and all
# three case pages, which is wrong twice over: a courthouse is not a judge, so
# the structured data was factually incorrect regardless of policy, and it put a
# named person into the metadata of every page on the site.
#
# The judge stays in `court`, which the page BODY renders, because the assigned
# judge is docket information and belongs in the record. Only the metadata
# projection drops it.
for _case in CASES.values():
    _case["court_name"] = re.sub(r",\s*Hon\..*$", "", _case["court"]).strip()


CATEGORIES = {
    "filed": {"label": "Filed by Conrad", "seo_phrase": "filing by Conrad Alan Rockenhaus", "sort": 1},
    "discovery": {"label": "Discovery", "seo_phrase": "discovery filing", "sort": 2},
    "opposing": {"label": "Opposing party", "seo_phrase": "opposing-party filing", "sort": 3},
    "orders": {"label": "Court orders", "seo_phrase": "court order", "sort": 4},
}


RETRACTIONS_DATA_PATH = DATA_DIR / "retractions.json"


def humanize_filename(name: str) -> str:
    stem = Path(name).stem.replace("_", " ")
    stem = re.sub(r"\s+", " ", stem).strip()

    acronyms = {
        "PPO", "DO", "VA", "PD", "NOH", "RFA", "PII", "FCI", "USAA", "TRO",
        "MCR", "CC", "MC07", "BP", "POA", "TC", "COS", "EPRAECIPE", "EPRAECIPES",
        "FBI", "GAL",
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


def parse_filing_date(filename: str, heading: str) -> str | None:
    for text in (filename, heading):
        match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
        if match:
            return match.group(1)
        match = re.search(r"(\d{4})(\d{2})(\d{2})", text)
        if match:
            year, month, day = match.group(1), match.group(2), match.group(3)
            if 1 <= int(month) <= 12 and 1 <= int(day) <= 31:
                return f"{year}-{month}-{day}"
    return None


def format_filing_date(iso_date: str) -> str:
    dt = datetime.strptime(iso_date, "%Y-%m-%d")
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"


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


def withheld_front_matter(slug: str) -> str:
    """Front-matter lines for a document with withheld pages, or nothing."""
    w = WITHHELD.get(slug)
    if not w:
        return ""
    pages = ", ".join(str(n) for n in w["withheld_pages"])
    return (
        f"\nwithheld_pages: {yaml_quote(pages)}"
        f"\nwithheld_original_page_count: {w['original_page_count']}"
        f"\nwithheld_published_page_count: {w['published_page_count']}"
        f"\nwithheld_on: {yaml_quote(w['withheld_on'])}"
        f"\nwithheld_reason: {yaml_quote(w['reason'])}"
        f"\nwithheld_authority: {yaml_quote(w['authority'])}"
    )


def seo_document_title(heading: str, case: dict) -> str:
    # CAPTION, not PETITIONER['seo_title']. That field expands to
    # "Adrienne Rockenhaus / Adrienne Blair / Adrienne Hein (@adezero)", which
    # put a private person's name, two aliases and a social handle into the
    # <title> of all 173 document pages. Per Conrad's 2026-07-31 ruling that is
    # not naming her in the record, it is SEO-targeting a person. The caption
    # names the case, which is what a court-record title is for, and both
    # parties share the surname so nothing identifying is lost.
    return (
        f"{heading} PDF | {PARTIES['caption']} "
        f"Case {case['case_number']} ({case['seo_county']} {case['seo_matter_short']})"
    )


def seo_case_title(case: dict) -> str:
    return (
        f"{PARTIES['caption']} {case['seo_matter']} "
        f"Case {case['case_number']} | {case['seo_county']} Circuit Court Filings"
    )


def seo_case_description(case: dict) -> str:
    # NOT case['court']. That string carries the assigned judge for two of the
    # three cases ("... , Hon. Nicole N. Goodson"), which puts a named person
    # into the meta description of a case page. The judge stays in the DATA and
    # on the page body, where docket information belongs; the description names
    # the court. See the PR for why a judge is the one place this ruling was
    # applied to a case Conrad did not anticipate.
    return (
        f"Public Rockenhaus v. Rockenhaus {case['seo_matter']} court filings "
        f"for Michigan Case No. {case['case_number']} in the {case['seo_county']} Circuit Court. "
        f"Filed motions, discovery, exhibits, opposing filings, and court orders "
        f"as searchable PDFs at {PUBLIC_RECORD['host']} (canonical record). "
        f"Disputed third-party domains indexed at /disputed-domains/."
    )


def category_seo_phrase(category: str) -> str:
    # The "opposing" branch used to expand the party's name plus her aliases and
    # handle into the meta description of every opposing-party filing. The
    # category already says whose filing it is in the only sense a docket cares
    # about, and the document page body still names her. Metadata names the case.
    return CATEGORIES[category]["seo_phrase"]


def seo_document_description(heading: str, case: dict, category: str) -> str:
    seo_phrase = category_seo_phrase(category)
    return (
        f"{heading}: {seo_phrase} in Rockenhaus v. Rockenhaus ({case['seo_matter']}), "
        f"Michigan Case No. {case['case_number']}, {case['seo_county']} Circuit Court. "
        f"PDF and searchable text at {PUBLIC_RECORD['host']} (canonical court record). "
        f"Disputed third-party domains: /disputed-domains/."
    )


def seo_document_keywords(heading: str, case: dict, filename: str) -> str:
    """Comma-separated meta keywords tuned for search discovery."""
    # NO PERSON IDENTIFIERS. This list used to carry PETITIONER["name"],
    # "Adrienne Blair", "Adrienne Hein" and "@adezero", appended to the meta
    # keywords of all 173 document pages. That is the keyword stuffing Conrad's
    # 2026-07-31 ruling names directly, and it is the single largest source of a
    # person's name in this site's indexable metadata.
    #
    # RESPONDENT["name"] stays. See the `allowed` block in
    # _data/metadata_denylist.json for that reading of the ruling and the one
    # inference it rests on.
    parts = [
        "Rockenhaus v Rockenhaus",
        case["case_number"],
        case["seo_county"],
        case["seo_matter_short"],
        RESPONDENT["name"],
        "Michigan court filing",
        "rockenhaus.net",
        "litigation.rockenhaus.net",
    ]
    lower_heading = heading.lower()
    lower_name = filename.lower()
    if "epraecipe" in lower_name or "praecipe" in lower_heading:
        parts.extend([
            "ePraecipe",
            "praecipe accepted",
            "motion hearing",
            "August 26 2026",
            "August 26 2026 11:30 AM",
            "Wayne County divorce",
        ])
    if re.search(r"8[-_]?26", lower_name) or "august 26" in lower_heading:
        parts.extend([
            "August 26 2026 hearing",
            "August 26 2026 11:30 AM",
            "Wayne County divorce hearing",
        ])
    if "consolidated" in lower_heading and "hearing" in lower_heading:
        parts.extend([
            "consolidated notice of hearing",
            "NOH",
            "August 26 2026",
            "eleven motions",
        ])
    if "in_person" in lower_name or "in person" in lower_heading:
        parts.extend([
            "in person hearing",
            "CAYMC",
            "2 Woodward Avenue Detroit",
            "Room 1501",
            "Hon Nicole N Goodson",
        ])
    elif "zoom" in lower_name or "zoom" in lower_heading:
        parts.append("Zoom hearing")
    if "gal" in lower_name or "guardian ad litem" in lower_heading:
        parts.extend([
            "guardian ad litem",
            "GAL",
            "MCR 2.201(E)",
            "plaintiff capacity",
        ])
    if "notice of hearing" in lower_heading or "noh" in lower_name:
        parts.extend(["notice of hearing", "August 26 2026"])
    if "default judgment" in lower_heading:
        parts.append("default judgment counterclaim")
    if "preservation" in lower_heading or "spoliation" in lower_heading:
        parts.extend(["preservation order", "spoliation of evidence"])
    if "omnibus" in lower_heading:
        parts.extend(["omnibus motion", "rockenhaus.com TRO"])
    if "usaa" in lower_heading or "dissipation" in lower_heading:
        parts.extend(["USAA account", "VA benefits", "dissipation TRO"])
    return ", ".join(dict.fromkeys(parts))


def seo_case_heading(case: dict) -> str:
    # This looks like a body heading and is one, but _layouts/case.html also
    # feeds it to the JSON-LD `name` field, so it is metadata as well and the
    # ruling reaches it. Checked rather than assumed: the guard scope is titles,
    # descriptions and every string inside a JSON-LD block.
    return f"{PARTIES['caption']} ({case['seo_matter']}, Case {case['case_number']})"


def write_document_page(
    *,
    slug: str,
    heading: str,
    case_id: str,
    category: str,
    relative_pdf: str,
    filename: str,
    last_modified_at: str,
    date_published: str | None,
) -> None:
    case = CASES[case_id]
    category_label = CATEGORIES[category]["label"]
    title = seo_document_title(heading, case)
    description = seo_document_description(heading, case, category)
    keywords = seo_document_keywords(heading, case, filename)

    out_path = DOCUMENTS_DIR / f"{slug}.html"
    date_line = ""
    if date_published:
        date_line = f"date_published: {yaml_quote(date_published)}\n"
    front_matter = f"""---
layout: document
title: {yaml_quote(title)}
heading: {yaml_quote(heading)}
description: {yaml_quote(description)}
keywords: {yaml_quote(keywords)}
case_id: {yaml_quote(case_id)}
case_title: {yaml_quote(case["title"])}
case_number: {yaml_quote(case["case_number"])}
court: {yaml_quote(case["court"])}
court_name: {yaml_quote(case["court_name"])}
category: {yaml_quote(category)}{withheld_front_matter(slug)}
category_label: {yaml_quote(category_label)}
pdf_path: {yaml_quote(relative_pdf)}
filename: {yaml_quote(filename)}
doc_slug: {yaml_quote(slug)}
last_modified_at: {yaml_quote(last_modified_at)}
{date_line}permalink: /documents/{slug}/
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
court_name: {yaml_quote(case["court_name"])}
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
        'title: All court documents | Rockenhaus v. Rockenhaus Michigan filings',
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


def write_latest_filings(filed_docs: list[dict]) -> None:
    dated = [doc for doc in filed_docs if doc.get("date_published")]
    if not dated:
        (DATA_DIR / "latest_filings.json").write_text(
            json.dumps({"date": None, "date_display": None, "groups": []}, indent=2),
            encoding="utf-8",
        )
        return

    max_date = max(doc["date_published"] for doc in dated)
    latest = [doc for doc in dated if doc["date_published"] == max_date]
    groups_map: dict[str, list[dict]] = {}
    for doc in latest:
        groups_map.setdefault(doc["case_id"], []).append(doc)

    groups: list[dict] = []
    for case_id in sorted(groups_map, key=lambda cid: CASES[cid]["sort"]):
        case = CASES[case_id]
        filings = sorted(groups_map[case_id], key=lambda doc: doc["filename"])
        groups.append(
            {
                "case_id": case_id,
                "case_label": f"{case['short_title']} {case['case_number']}",
                "case_url": f"/cases/{case_id}/",
                "filings": [
                    {"title": filing["title"], "url": filing["url"]}
                    for filing in filings
                ],
            }
        )

    (DATA_DIR / "latest_filings.json").write_text(
        json.dumps(
            {
                "date": max_date,
                "date_display": format_filing_date(max_date),
                "groups": groups,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def process_retraction_letters() -> list[str]:
    """Extract OCR/searchable text from retraction PDFs; return permalink paths."""
    if not RETRACTIONS_DATA_PATH.is_file():
        return []

    data = json.loads(RETRACTIONS_DATA_PATH.read_text(encoding="utf-8"))
    urls = ["/retractions/"]
    for letter in data.get("letters", []):
        permalink = letter.get("permalink")
        if permalink:
            urls.append(permalink)

        doc_slug = letter.get("doc_slug")
        pdf_rel = letter.get("pdf_path", "").lstrip("/")
        if not doc_slug or not pdf_rel:
            continue

        pdf_path = ROOT / pdf_rel
        if not pdf_path.is_file():
            print(f"Warning: retraction PDF not found: {pdf_path}")
            continue

        text_data = extract_pdf_text(pdf_path)
        (PDF_TEXT_DIR / f"{doc_slug}.json").write_text(
            json.dumps(text_data, indent=2), encoding="utf-8"
        )

    return urls


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
    filed_docs: list[dict] = []
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
            date_published = parse_filing_date(filename, heading)
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
                date_published=date_published,
            )

            doc_url = f"/documents/{slug}/"
            doc_entry = {
                "title": heading,
                "filename": filename,
                "url": doc_url,
                "case_id": case_id,
                "case_title": case_meta["short_title"],
                "case_number": case_meta["case_number"],
                "category": category,
                "date_published": date_published,
            }
            all_docs.append(doc_entry)
            if category == "filed":
                filed_docs.append(doc_entry)

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
    write_latest_filings(filed_docs)

    (DATA_DIR / "cases.json").write_text(
        json.dumps({"cases": case_list, "document_count": document_count}, indent=2),
        encoding="utf-8",
    )

    process_retraction_letters()

    text_count = sum(1 for f in PDF_TEXT_DIR.glob("*.json") if json.loads(f.read_text()).get("char_count", 0) > 0)
    print(f"Generated {document_count} document pages in {DOCUMENTS_DIR}")
    print(f"Extracted text from {text_count} PDFs into {PDF_TEXT_DIR}")


if __name__ == "__main__":
    main()
