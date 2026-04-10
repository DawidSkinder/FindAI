# Mobile Reveal Layout Fix

## Date
- 2026-04-10

## Scope
- Fixed the manifesto/reveal state layout on the mobile breakpoint.
- Kept the desktop reveal layout unchanged.

## Problem
- The reveal state was still behaving like a centered fixed poster on mobile.
- On small screens the manifesto content could exceed the viewport height without a normal vertical reading flow.
- The main reveal headline could sit underneath the fixed top-left and top-right UI controls.

## Changes
- Switched the mobile reveal flow from a fixed poster-like overlay to a stage-level vertical scroll path during state E.
- Made the mobile `manifesto-panel` behave like full-height document content instead of a centered fixed sheet.
- Added touch-friendly scrolling behavior for the reveal state.
- Added a mobile-only dot-pattern CSS background directly on the scrollable manifesto layer, because the viewport canvas alone was not reliably covering the full scrolled reveal height on iOS.
- Top-aligned the effective reveal reading area by increasing mobile top padding.
- Reserved extra top space for the fixed corner controls and safe-area inset.
- Reserved bottom space so the manifesto CTA and closing content are less likely to sit under fixed bottom UI.

## Validation
- Reviewed the mobile breakpoint rules in `styles.css` to confirm the reveal panel now:
  - scrolls vertically
  - clears the top corner controls
  - preserves the desktop layout path outside the mobile breakpoint
