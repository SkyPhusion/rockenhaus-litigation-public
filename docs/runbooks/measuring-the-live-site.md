# Measuring rockenhaus.net, and the traps in it

How to take a measurement of the live site that another person can reproduce and
attack. Written after two of us measured the same five pages at the same moment
and got different numbers, for reasons that were not obvious to either of us.

## Always state the region

A page reads very differently in `<head>` than in the body, and the difference
is the whole point. A term in a title is a ranking signal; the same term in body
prose on a noindex exhibit page is quotation of an artifact and is legitimate.

Extract the head by parsing the markup, never with a line-based range: Astro
emits minified single-line HTML, so a sed range from head to /head never
terminates and silently scans the whole document. Measured on a real built page,
that slice returned 3540 bytes of a 3540 byte file.

## Always state the term list

This is the one that actually bit. Two measurements of the same five pages
disagreed on four of them, and the cause was not extraction, caching or timing:
one list contained adezero and sockpuppet and the other did not. Every term the
two lists agreed on was an unambiguous non-party name; the two that differed
were exactly the two hard cases, a party handle and a characterisation.

Publish the list with the numbers, or publish the numbers as a diff against
_data/metadata_denylist.json. A count without its list is not a measurement.

## Two pages that cannot be byte-compared

### Any page with an obfuscated email address

Cloudflare rewrites mailto links into a `__cf_email__` span carrying a
`data-cfemail` hex blob, and that blob is re-generated per response. So
/retractions/rob-hein/ differs between any two fetches on exactly one line, and
the diff is not content.

Do not chase it. Diff with that attribute stripped, or compare the parsed head
and the visible text rather than raw bytes. Pages without a mailto link, such as
/retractions/ and /parties/, are byte-stable and can be compared directly.

### Any page at all, for existence

The Pages project serves the homepage with HTTP 200 for every unknown path, so a
200 proves nothing about whether a page exists. Compare the body against the
homepage before concluding a URL is live: /joe-prich/ was deleted in #7 and
still answers 200 with 29,083 bytes identical to the homepage.

This is defect 1 in the redesign and is fixed by a real 404 plus an explicit
_redirects file. Until that ships, no existence check on this site means what it
appears to mean.
