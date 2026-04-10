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
- Turned the mobile `manifesto-panel` into a proper vertical scroll container.
- Added touch-friendly scrolling behavior for the reveal overlay.
- Top-aligned the effective reveal reading area by increasing mobile top padding.
- Reserved extra top space for the fixed corner controls and safe-area inset.
- Reserved bottom space so the manifesto CTA and closing content are less likely to sit under fixed bottom UI.

## Validation
- Reviewed the mobile breakpoint rules in `styles.css` to confirm the reveal panel now:
  - scrolls vertically
  - clears the top corner controls
  - preserves the desktop layout path outside the mobile breakpoint
