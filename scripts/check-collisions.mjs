#!/usr/bin/env node
// Two generators, one domain, one Pages project. This is the check that keeps
// that honest.
//
// Jekyll builds _site/. Astro builds dist/. CI merges dist/ into _site/ and runs
// one `pages deploy`. The failure mode that matters is a SILENT collision: both
// generators emit the same path, the merge picks one, and a page either
// double-publishes with different content or quietly disappears. Nobody notices
// until someone goes looking for a filing.
//
// So: fail the build if any path exists in both trees. As Jekyll pages migrate
// to Astro one at a time, this check is what proves each handoff was clean.
//
// Usage: node scripts/check-collisions.mjs [jekyllDir] [astroDir]

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Paths Astro owns. Anything it emits must be under one of these. */
export const ASTRO_OWNED_PREFIXES = ["evidence/", "answers/"];

export function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, base, out);
    else out.push(relative(base, abs));
  }
  return out;
}

/** Paths present in both trees. */
export function findCollisions(jekyllFiles, astroFiles) {
  const jekyll = new Set(jekyllFiles);
  return astroFiles.filter((f) => jekyll.has(f)).sort();
}

/** Astro output that escapes the prefixes Astro is supposed to own. */
export function findOutOfLane(astroFiles, prefixes = ASTRO_OWNED_PREFIXES) {
  return astroFiles
    .filter((f) => !prefixes.some((p) => f.startsWith(p)))
    // Astro emits build metadata at the root; it is not a published page.
    .filter((f) => !f.startsWith("_astro/") && f !== "favicon.svg")
    .sort();
}

function main() {
  const jekyllDir = process.argv[2] || join(ROOT, "_site");
  const astroDir = process.argv[3] || join(ROOT, "dist");

  if (!existsSync(astroDir)) {
    console.error(`check-collisions: astro output not found at ${astroDir}. Run \`npm run build\`.`);
    process.exit(1);
  }
  if (!existsSync(jekyllDir)) {
    console.log(
      `check-collisions: no Jekyll output at ${jekyllDir}; checking lane ownership only. ` +
        "(Ruby is not installed on every machine that can build the Astro half.)",
    );
  }

  const astroFiles = walk(astroDir);
  const jekyllFiles = walk(jekyllDir);

  const outOfLane = findOutOfLane(astroFiles);
  if (outOfLane.length) {
    console.error("check-collisions: Astro emitted files outside the paths it owns:");
    outOfLane.slice(0, 20).forEach((f) => console.error(`  ${f}`));
    console.error(`\nAstro owns: ${ASTRO_OWNED_PREFIXES.join(", ")}`);
    console.error("Jekyll owns everything else. Widen ASTRO_OWNED_PREFIXES deliberately, or move the page.");
    process.exit(1);
  }

  if (jekyllFiles.length) {
    const collisions = findCollisions(jekyllFiles, astroFiles);
    if (collisions.length) {
      console.error("check-collisions: both generators emit these paths:");
      collisions.slice(0, 20).forEach((f) => console.error(`  ${f}`));
      console.error(
        "\nThe merge would silently pick one. Remove the page from whichever generator\n" +
          "is no longer meant to own it.",
      );
      process.exit(1);
    }
  }

  console.log(
    `check-collisions: OK. ${astroFiles.length} Astro files, ` +
      `${jekyllFiles.length} Jekyll files, no collisions.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
