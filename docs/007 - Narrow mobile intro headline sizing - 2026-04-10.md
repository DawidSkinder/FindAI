# Narrow Mobile Intro Headline Sizing

## Date
- 2026-04-10

## Scope
- Adjusted the state A intro headline sizing for narrow mobile screens only.

## Problem
- Between roughly 320 px and 420 px widths, the intro text `Find AI symbol` could scale down too aggressively relative to the AI symbol graphic.
- Above that range, the existing responsive sizing behaved acceptably.

## Changes
- Added a narrow-mobile override at `max-width: 420px`.
- Increased the `intro-headline-main` font size in that range, but kept it restrained enough for `Find AI` to remain on one line with the symbol.
- Rebalanced the symbol width and headline gap for a stronger text-to-symbol proportion without forcing the first line to break.

## Validation
- Reviewed the narrow-mobile CSS override path in `styles.css`.
- Kept the change scoped to the `max-width: 420px` breakpoint so larger mobile widths keep the previous scaling behavior.
