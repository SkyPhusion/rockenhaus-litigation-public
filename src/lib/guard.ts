// Build-time guard: no third-party characterisation may reach indexable metadata.
//
// This exists because the defect that put this site in the hole was structured
// data. The site emitted FAQPage blocks whose every `text` field asserted that a
// named private individual is a neo-Nazi. Search engines read structured data as
// machine-readable claims, so that is the single worst place for an accusation
// to live.
//
// SCOPE, precisely. This guard applies to INDEXABLE METADATA ONLY:
//   - <title>
//   - <meta name="description">
//   - every string inside a JSON-LD block
//
// It deliberately does NOT apply to page bodies. Exhibit pages quote what an
// artifact shows on its face, verbatim, and those pages are noindex. Quotation
// of a public post on a noindex page is legitimate and is the whole point of an
// exhibit index; a guard that blocked it would force the evidence to be
// paraphrased, which is worse evidence. The distinction is not cosmetic: it is
// the difference between publishing a claim and reproducing an artifact.
//
// WHERE THE LIST LIVES, and why it moved out of this file. It used to be the
// array below. That meant two guards with two lists: this one, 15 terms but
// reaching only the Astro pages, and scripts/check_indexable_metadata.py,
// reaching every built page but carrying four characterisation patterns and no
// names at all. So /retractions/rob-hein/ shipped a non-party name seven times
// inside its <head> with CI green: the stronger guard could not see the page,
// and the guard that could see it was not looking for names. Both consumers now
// read _data/metadata_denylist.json, and tests/guard.test.ts asserts they agree,
// so they cannot drift apart again.

import denylist from "../../_data/metadata_denylist.json";

/**
 * Terms that must never appear in indexable metadata. Matched case-insensitively
 * on word-ish boundaries so that ordinary prose cannot trip them by accident.
 *
 * WHICH TIERS APPLY IS DATA, NOT CODE. `denied_tiers` in the JSON names them.
 * The previous version hardcoded `third_party` and `party_handles` here and in
 * the Python, so Conrad's 2026-07-31 ruling, which renamed one tier and widened
 * it, would have been a four-file change of which two files could be forgotten.
 * Now a tier is added, renamed or retired in the data file alone.
 *
 * The tiers are unioned because the rule for metadata is the same for all of
 * them: metadata names the CASE, not PEOPLE. They stay separate in the data file
 * because they rest on different arguments and a future ruling could move one
 * without the other. The case caption, the case numbers and the name Conrad Alan
 * Rockenhaus are in no denied tier: this is his court record.
 */
interface Tier {
  terms: string[];
}

/**
 * The denylist JSON has heterogeneous values: string arrays for `_comment`,
 * `ruling`, `scope` and `denied_tiers`, and tier objects for the rest. Reading
 * a tier by name therefore needs a widening step, and it is done through
 * `unknown` and a runtime check rather than a direct cast, which does not
 * typecheck and would be a lie either way: the compiler cannot know a name in
 * `denied_tiers` corresponds to a tier object, so something has to verify it.
 * That something should fail loudly at build time rather than yield undefined.
 */
function tier(name: string): Tier {
  const value = (denylist as unknown as Record<string, unknown>)[name];
  if (!value || !Array.isArray((value as Tier).terms)) {
    throw new Error(
      `metadata_denylist.json: denied_tiers names "${name}", which is not a tier with a terms array.`,
    );
  }
  return value as Tier;
}

const DENIED_TIERS: readonly string[] = denylist.denied_tiers;

if (DENIED_TIERS.length === 0) {
  throw new Error("metadata_denylist.json: denied_tiers is empty; refusing to run a guard that cannot fail.");
}

export const DENYLIST: readonly string[] = DENIED_TIERS.flatMap((name) => tier(name).terms);

export interface DenylistHit {
  term: string;
  field: string;
  excerpt: string;
}

function excerptAround(haystack: string, index: number, term: string): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(haystack.length, index + term.length + 30);
  return (start > 0 ? "..." : "") + haystack.slice(start, end).replace(/\s+/g, " ") + (end < haystack.length ? "..." : "");
}

/** Every denylist term present in `text`, with context. Empty array when clean. */
export function findDenylisted(text: string, field = "text"): DenylistHit[] {
  if (!text) return [];
  const hay = text.toLowerCase();
  const hits: DenylistHit[] = [];
  for (const term of DENYLIST) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(term, from);
      if (at === -1) break;
      // Require a non-word character (or string edge) on both sides so that
      // "prichard" does not fire inside an unrelated longer token.
      const before = at === 0 ? "" : hay[at - 1];
      const after = hay[at + term.length] ?? "";
      const wordish = /[a-z0-9]/;
      if (!wordish.test(before) && !wordish.test(after)) {
        hits.push({ term, field, excerpt: excerptAround(text, at, term) });
        break;
      }
      from = at + term.length;
    }
  }
  return hits;
}

/**
 * Throw if any denylisted term reaches indexable metadata. Called at build time
 * from every page that emits a title, description, or JSON-LD block, so the
 * build fails rather than the defect shipping.
 */
export function assertCleanMetadata(fields: Record<string, unknown>, context: string): void {
  const hits: DenylistHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (value == null) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    hits.push(...findDenylisted(text, field));
  }
  if (hits.length) {
    const detail = hits
      .map((h) => `  [${h.field}] "${h.term}" in: ${h.excerpt}`)
      .join("\n");
    throw new Error(
      `Denylisted term reached indexable metadata on ${context}:\n${detail}\n\n` +
        "Accusations and third-party characterisations must not appear in a title,\n" +
        "description, or structured-data field. Page bodies on noindex exhibit pages\n" +
        "may quote an artifact; metadata may not characterise a person.",
    );
  }
}
