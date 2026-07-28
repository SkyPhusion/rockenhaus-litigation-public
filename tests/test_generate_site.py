"""Unit tests for the pure helpers in scripts/generate_site.py.

WHY THESE FUNCTIONS: they decide how a filed court document is dated and
labelled on a public court record. A bug in `parse_filing_date` misdates a
filing; a bug in `humanize_filename` mislabels one; a bug in `yaml_quote`
emits front matter that breaks the build for every document at once. Those
are the failures worth a test on this site.

Deliberately no tests over the filesystem/pdftotext paths: those need real
PDFs and are covered end to end by the `ci` job's build.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from generate_site import (  # noqa: E402
    format_filing_date,
    humanize_filename,
    parse_filing_date,
    yaml_quote,
)


class TestParseFilingDate:
    def test_iso_date_in_filename(self):
        assert parse_filing_date("2026-07-02_motion.pdf", "") == "2026-07-02"

    def test_compact_date_in_filename(self):
        assert parse_filing_date("20260702_motion.pdf", "") == "2026-07-02"

    def test_falls_back_to_heading(self):
        assert parse_filing_date("motion.pdf", "Filed 2026-08-26") == "2026-08-26"

    def test_filename_wins_over_heading(self):
        assert parse_filing_date("2026-07-02_x.pdf", "2026-08-26") == "2026-07-02"

    def test_no_date_anywhere_is_none(self):
        assert parse_filing_date("motion.pdf", "Motion to compel") is None

    def test_impossible_month_is_rejected(self):
        # 13 is not a month. Must not silently emit 2026-13-02.
        assert parse_filing_date("20261302_motion.pdf", "") is None

    def test_impossible_day_is_rejected(self):
        assert parse_filing_date("20260732_motion.pdf", "") is None

    def test_rejected_compact_date_still_falls_through_to_heading(self):
        # The filename carries an unusable date; the heading carries a real
        # one. Rejecting the first must not abandon the search.
        assert parse_filing_date("20261302_x.pdf", "served 2026-07-02") == "2026-07-02"


class TestHumanizeFilename:
    def test_underscores_become_spaces_and_words_capitalize(self):
        assert humanize_filename("motion_to_compel.pdf") == "Motion To Compel"

    def test_known_acronyms_stay_upper(self):
        assert humanize_filename("PPO_petition.pdf") == "PPO Petition"
        assert humanize_filename("gal_motion.pdf") == "GAL Motion"

    def test_iso_date_is_preserved_verbatim(self):
        out = humanize_filename("2026-07-02_motion.pdf")
        assert "2026-07-02" in out

    def test_bare_numbers_are_not_capitalized_into_nonsense(self):
        assert humanize_filename("exhibit_12.pdf") == "Exhibit 12"

    def test_collapses_runs_of_whitespace(self):
        assert humanize_filename("motion___to___compel.pdf") == "Motion To Compel"


class TestYamlQuote:
    def test_wraps_in_double_quotes(self):
        assert yaml_quote("plain") == '"plain"'

    def test_escapes_embedded_double_quote(self):
        # An unescaped quote here terminates the YAML scalar early and breaks
        # the front matter for that document.
        assert yaml_quote('Motion re "custody"') == '"Motion re \\"custody\\""'

    def test_escapes_backslash_before_quotes(self):
        # Order matters: escaping quotes first would double-escape the
        # backslash introduced by that escape.
        assert yaml_quote("path\\to") == '"path\\\\to"'

    def test_backslash_and_quote_together(self):
        assert yaml_quote('a\\"b') == '"a\\\\\\"b"'


class TestFormatFilingDate:
    def test_formats_long_form_without_zero_padding(self):
        assert format_filing_date("2026-07-02") == "July 2, 2026"

    def test_double_digit_day(self):
        assert format_filing_date("2026-08-26") == "August 26, 2026"

    def test_rejects_malformed_input(self):
        with pytest.raises(ValueError):
            format_filing_date("not-a-date")
