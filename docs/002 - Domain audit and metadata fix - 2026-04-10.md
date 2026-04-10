# Domain Audit And Metadata Fix

## Date
- 2026-04-10

## Scope
- Audited the repo for self-referential domain usage after the move to `https://findai.dawidskinder.pl`.
- Verified the GitHub Pages custom domain file in `CNAME`.
- Corrected site metadata so crawlers and share surfaces resolve the live custom domain reliably.

## Findings
- The deployed site domain was already configured correctly in `CNAME`.
- The runtime share URL in `script.js` already pointed to `https://findai.dawidskinder.pl`.
- The main issue was HTML metadata still using relative image URLs, which is fragile for Open Graph and Twitter scrapers.
- No stale `github.io` references were found in tracked source files.

## Changes
- Added a canonical URL tag in `index.html`.
- Added `og:url`.
- Converted `og:image` and `twitter:image` to absolute URLs on `https://findai.dawidskinder.pl`.
- Added image alt metadata for social previews.
- Normalized the self URL constant in `script.js` to the canonical root URL with a trailing slash.

## Validation
- Searched tracked repo files for custom-domain, GitHub Pages, and absolute URL references.
- Re-checked the repo after edits to confirm self-referential URLs now resolve to `https://findai.dawidskinder.pl`.
- Confirmed no stale `github.io` references remain.
