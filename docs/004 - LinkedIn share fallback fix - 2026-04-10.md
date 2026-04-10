# LinkedIn Share Fallback Fix

## Date
- 2026-04-10

## Scope
- Audited the LinkedIn share button behavior.
- Added a more resilient LinkedIn sharing flow that matches current platform constraints better than a plain offsite link alone.

## Findings
- The repo was already using LinkedIn's common offsite share URL pattern.
- The issue was not a malformed project URL.
- LinkedIn's current help guidance is less reliable than X for third-party share buttons:
  - link sharing is centered around LinkedIn's own post composer
  - direct third-party sharing may only be available on desktop depending on context

## Changes
- Kept the LinkedIn offsite share URL for desktop behavior.
- Added a centered popup flow for desktop so the user gets a dedicated share window instead of a full-tab handoff when the browser allows it.
- Added a mobile/tablet fallback that uses the native Web Share sheet when available, so users can hand the site URL to the LinkedIn app directly if installed.
- Preserved direct navigation to LinkedIn as the last fallback if the popup is blocked and native share is unavailable.

## Validation
- Ran `node --check script.js`.
- Reviewed final share-link generation and the LinkedIn click handler flow.
- Confirmed the canonical shared URL remains `https://findai.dawidskinder.pl/`.
