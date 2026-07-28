// Content collections with schema validation.
//
// The evidentiary point of this file: an exhibit that is missing its provenance
// FAILS THE BUILD. Provenance stops being something a human remembers to fill in
// and becomes something the site cannot ship without.
//
// The data lives in _data/*.json rather than src/content/ so the Jekyll half of
// the site keeps its existing data convention during the transition. Astro reads
// those same files through the file() loader and validates them with Zod.
//
// NOT LOADED HERE, deliberately: _data/faq.json, _data/social_evidence.json and
// _data/parties.json. Those carry roughly 400 accusation references and are a
// separate cleanup pass with a different owner.

import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

/**
 * Date precision. A date that is not known to the day must SAY it is not known
 * to the day. This is the field that stops inference being presented as fact.
 */
const datePrecision = z.enum(["day", "month", "range", "unknown"]);

/**
 * Where a date came from. "filename_inference" is publishable, but only while
 * labelled as inference: the superseded exhibit index recorded filename-derived
 * post dates in a field called `captured`, which is how a guess became provenance.
 */
const dateSource = z.enum([
  "visible_in_artifact",
  "archive_record",
  "filename_inference",
]);

const exhibits = defineCollection({
  loader: file("_data/exhibits.json", {
    parser: (text) => {
      const parsed = JSON.parse(text) as { exhibits: Array<{ id: string }> };
      return Object.fromEntries(parsed.exhibits.map((e) => [e.id, e]));
    },
  }),
  schema: z
    .object({
      id: z.string().min(1),
      file: z.string().startsWith("/assets/"),
      label: z.string().min(1),
      artifact_type: z.enum(["screenshot_of_public_post", "pdf_correspondence"]),
      source_kind: z.enum(["public_x_account", "correspondence"]),

      // Null when the posting account is not visible on the face of the capture.
      // Four of the fourteen exhibits are cropped that way; recording it is the
      // difference between an exhibit and an assertion.
      source_account: z.string().nullable(),
      author_visible_in_artifact: z.boolean(),

      status_id: z.string().nullable(),

      posted_date: z.string().nullable(),
      posted_date_end: z.string().nullable(),
      posted_date_precision: datePrecision,
      posted_date_source: dateSource,

      // Genuinely unknown for every current exhibit. Bounded above by the first
      // commit containing the asset, which is a fact rather than a guess.
      captured_date: z.string().nullable(),
      captured_date_precision: datePrecision,
      captured_upper_bound: z.string().nullable(),

      // How this exhibit is evidenced, so a page renders the strongest chain it
      // currently has and upgrades visibly rather than being rebuilt around a
      // stronger source later. `subpoena-return` is an authenticated platform
      // record and outranks both a screenshot and a third-party crawl, because
      // it answers a fabrication challenge directly.
      evidence_source: z.enum([
        "screenshot",
        "archive-capture",
        "subpoena-return",
        "correspondence",
      ]),

      // Nullable and expected to stay null. The source account was suspended and
      // the posts are down, so no third-party archive capture exists or can be
      // made for any exhibit here. Retained only in case an incidental
      // pre-suspension crawl surfaces. A null here is NOT a defect to chase.
      archived_url: z.string().url().nullable(),

      shows_on_face: z.string().min(20),
      supports_links: z.array(z.string()),
    })
    .strict()
    .superRefine((e, ctx) => {
      // A range needs both ends, or it is not a range.
      if (e.posted_date_precision === "range" && !e.posted_date_end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `exhibit ${e.id}: posted_date_precision is "range" but posted_date_end is null`,
        });
      }
      // A date that exists must declare where it came from, and a date that does
      // not exist must not claim a precision it cannot have.
      if (e.posted_date && e.posted_date_precision === "unknown") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `exhibit ${e.id}: has a posted_date but declares precision "unknown"`,
        });
      }
      if (!e.posted_date && e.posted_date_precision !== "unknown") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `exhibit ${e.id}: no posted_date but precision is "${e.posted_date_precision}"`,
        });
      }
      // If the author is not visible, an account attribution is not supportable
      // from the artifact alone.
      if (!e.author_visible_in_artifact && e.source_account) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `exhibit ${e.id}: source_account is set but author_visible_in_artifact is false. ` +
            "An account cannot be attributed from a capture that crops the account out.",
        });
      }
    }),
});

const chainLinkStatus = z.enum([
  "supported",
  "self_identification_only",
  "asserted_in_filed_pleadings",
  "no_exhibit_in_this_archive",
]);

const chains = defineCollection({
  loader: file("_data/identification_chains.json", {
    parser: (text) => {
      const parsed = JSON.parse(text) as { chains: Array<{ id: string }> };
      return Object.fromEntries(parsed.chains.map((c) => [c.id, c]));
    },
  }),
  schema: z
    .object({
      id: z.string().min(1),
      subject: z.string().min(1),
      summary: z.string().min(1),
      links: z
        .array(
          z
            .object({
              id: z.string().min(1),
              statement: z.string().min(1),
              status: chainLinkStatus,
              evidence: z.array(z.string()),
              note: z.string().optional(),
              caveats: z.array(z.string()).optional(),
            })
            .strict()
            .superRefine((link, ctx) => {
              // The load-bearing rule. A link claiming support must name the
              // exhibits that support it; a link with no evidence must say so
              // in its status rather than sit there looking established.
              if (link.status === "supported" && link.evidence.length === 0) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `chain link ${link.id}: status "supported" with no evidence`,
                });
              }
              if (link.status === "no_exhibit_in_this_archive" && link.evidence.length > 0) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `chain link ${link.id}: status says no exhibit, but evidence is listed`,
                });
              }
              // An unsupported or weakly supported link must explain itself.
              if (
                (link.status === "no_exhibit_in_this_archive" ||
                  link.status === "self_identification_only" ||
                  link.status === "asserted_in_filed_pleadings") &&
                !link.note
              ) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `chain link ${link.id}: status "${link.status}" requires a note explaining the gap`,
                });
              }
            }),
        )
        .min(1),
    })
    .strict(),
});

/**
 * Questions for the pre-rendered Q&A pages.
 *
 * Answers are QUOTED, never generated. Each citation names a document, a page,
 * and the verbatim passage; scripts/verify-citations.mjs proves at build time
 * that the passage actually appears on that page of that filing. A drifted or
 * invented quote fails CI rather than shipping.
 *
 * `framing` is the one human-authored sentence per question. A human owns every
 * word on these pages that is not a quotation from the record.
 */
const questions = defineCollection({
  loader: file("_data/qa_questions.json", {
    parser: (text) => {
      const parsed = JSON.parse(text) as { questions: Array<{ id: string }> };
      return Object.fromEntries(parsed.questions.map((q) => [q.id, q]));
    },
  }),
  schema: z
    .object({
      id: z.string().min(1),
      question: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      framing: z.string().min(1),
      framing_author: z.string().min(1),
      citations: z
        .array(
          z
            .object({
              doc_slug: z.string().min(1),
              page: z.number().int().positive(),
              quote: z.string().min(20),
            })
            .strict(),
        )
        .min(1),
      // Recorded when the record is thin, so the page can say so out loud.
      record_gap: z.string().nullable().default(null),
    })
    .strict(),
});

export const collections = { exhibits, chains, questions };
