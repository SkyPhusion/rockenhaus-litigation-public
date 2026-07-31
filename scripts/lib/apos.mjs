#!/usr/bin/env node
// Substitute the apostrophe placeholder in the given files.
//
// Why this exists: file content authored from a login shell is written inside a
// single-quoted `bash -lc` wrapper, so a literal apostrophe in the content
// terminates the wrapper and corrupts the write. Authoring with a placeholder
// and substituting here keeps prose readable without ever putting the character
// through the shell. Idempotent: a file with no placeholder is left alone.
//
// The token is assembled from pieces rather than written out, so that running
// this script over its own source does not rewrite the very literals it matches
// on. The first version of this file did exactly that and destroyed itself.
import { readFileSync, writeFileSync } from "node:fs";

const APOS = String.fromCharCode(39);
const TOKEN = "@" + "APOS" + "@";

let total = 0;
for (const path of process.argv.slice(2)) {
  const before = readFileSync(path, "utf8");
  const parts = before.split(TOKEN);
  if (parts.length > 1) {
    writeFileSync(path, parts.join(APOS));
    total += parts.length - 1;
    console.log(`${path}: ${parts.length - 1} substituted`);
  } else {
    console.log(`${path}: none`);
  }
}
console.log(`apos: ${total} substitution(s) total`);
