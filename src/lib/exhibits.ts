// Presentation helpers for the exhibit index.

/**
 * A neutral, stable reference for an exhibit.
 *
 * Deliberately NOT derived from the exhibit id. The ids contain account handles,
 * and a handle in a page title is exactly the kind of third-party identifier that
 * should never reach indexable metadata. The URL keeps the descriptive id so a
 * citation is readable; the visible reference and the page title use this instead.
 */
export function exhibitRef(index: number): string {
  return `EX-${String(index + 1).padStart(2, "0")}`;
}

export const STATUS_LABEL: Record<string, string> = {
  supported: "Supported by exhibits in this archive.",
  self_identification_only:
    "Supported only by a statement the account made about itself. Self-description is not independent identification.",
  asserted_in_filed_pleadings:
    "Asserted in filed pleadings, which are linked. Filed allegations are allegations until adjudicated.",
  no_exhibit_in_this_archive: "No exhibit in this archive supports this step.",
};

/** Human-readable artifact description, with no characterisation of anyone. */
export function artifactLabel(artifactType: string): string {
  return artifactType === "pdf_correspondence"
    ? "PDF correspondence"
    : "Screenshot of a public post";
}

/**
 * How an exhibit is evidenced, strongest last.
 *
 * A screenshot shows what a page looked like to whoever captured it. An
 * authenticated platform record is stronger, because it answers a "that
 * screenshot is fabricated" challenge directly rather than inviting it.
 *
 * No third-party archive capture exists for any exhibit in this archive and
 * none can be made: the source account was suspended and the posts are down. A
 * missing archive reference is therefore the permanent expected state.
 */
export const EVIDENCE_SOURCE_LABEL: Record<string, string> = {
  screenshot:
    "Screenshot of a public post. Shows what the page displayed at capture time; it is not an authenticated platform record.",
  "archive-capture":
    "Independent third-party archive capture.",
  "subpoena-return":
    "Authenticated platform record produced by the platform. Stronger than a screenshot or a third-party crawl.",
  correspondence:
    "Correspondence retained as filed or served.",
};

export const EVIDENCE_SOURCE_SHORT: Record<string, string> = {
  screenshot: "screenshot",
  "archive-capture": "archive capture",
  "subpoena-return": "platform record",
  correspondence: "correspondence",
};
