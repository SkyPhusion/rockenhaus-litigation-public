// Astro builds ONLY the evidence system and the pre-rendered Q&A pages.
//
// output: "static" with no adapter, deliberately. Every page here is
// pre-rendered, which is the entire point: a client-rendered answer widget
// does not rank, so the indexable surface has to be ordinary HTML on disk.
// Static output also means this composes with the existing Jekyll Pages
// deploy instead of replacing it -- dist/ is merged into _site/ and ONE
// `pages deploy` ships both. No new Worker, no routing change, no DNS change.
//
// Path ownership during the transition:
//   Astro  ->  /evidence/*  and  /answers/*
//   Jekyll ->  everything else
// scripts/check-collisions.mjs fails the build if both generators emit the
// same path, so a page migrating from Jekyll to Astro cannot silently
// double-publish or silently disappear.

import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://rockenhaus.net",
  output: "static",
  outDir: "./dist",
  build: {
    // Directory-style URLs so /evidence/foo/ matches the Jekyll permalink
    // style already in use across the site.
    format: "directory",
  },
  // No sitemap integration here on purpose: jekyll-sitemap already owns
  // /sitemap.xml for the merged site. Two generators emitting a sitemap
  // would be exactly the silent collision the collision check exists to catch.
});
