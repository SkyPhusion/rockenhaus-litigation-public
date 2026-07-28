// Types for the record layer. The implementation is plain JS in record.mjs so
// that build-corpus.mjs and the Astro pages can share one derivation without a
// build step between them; this file is what lets the Astro side typecheck.

export interface CaseMeta {
  id: string;
  title: string;
  short_title: string;
  court: string;
  case_number: string;
  matter: string;
  role: string;
  sort: number;
}

export interface CategoryMeta {
  id: string;
  label: string;
  sort: number;
}

export interface RecordDocument {
  slug: string;
  title: string;
  filename: string;
  url: string;
  pdf_url: string;
  case_id: string;
  case_title: string;
  case_short_title: string;
  case_number: string;
  court: string;
  category: string;
  category_label: string;
  filed_date: string | null;
}

export interface RecordCategory {
  id: string;
  label: string;
  sort: number;
  documents: RecordDocument[];
}

export interface RecordCase extends CaseMeta {
  categories: RecordCategory[];
}

export interface LatestFilingGroup {
  case_id: string;
  case_label: string;
  case_url: string;
  filings: RecordDocument[];
}

export const ROOT: string;
export const CASES: CaseMeta[];
export const CATEGORIES: CategoryMeta[];
export function humanizeFilename(name: string): string;
export function slugFor(relPath: string): string;
export function parseFilingDate(filename: string, heading: string): string | null;
export function loadDocuments(): RecordDocument[];
export function loadCases(docs?: RecordDocument[]): RecordCase[];
export function latestFilings(docs?: RecordDocument[]): { date: string | null; groups: LatestFilingGroup[] };
