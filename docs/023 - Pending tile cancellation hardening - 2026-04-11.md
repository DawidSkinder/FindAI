# Pending Tile Cancellation Hardening

## Date
- 2026-04-11

## Scope
- Finish the remaining pending-load cleanup gap from the mobile DESIGN-world crash mitigation pass.
- Keep runtime behavior unchanged for zoom, tile format, tile cache policy, interaction, and visual rendering.

## Goal
- Make pending off-DOM tile loads explicitly cancellable.
- Prevent late image load/decode completions from attaching stale tiles after renderer cleanup.
- Release pending image `src` references during tile cleanup.

## Safety Boundary
- This change should not affect the current mobile attach-before-load path in normal operation.
- It mainly hardens the shared renderer for desktop decode-before-attach and future experiments.

## Implemented
- Pending tile records now keep:
  - the off-DOM image element
  - an explicit `cancelled` flag
- `clearTiles()` now cancels every pending tile before resetting renderer state.
- `pruneTiles()` now cancels pending tiles that leave the target visible set.
- `removeTileElement()` also cancels matching pending work if it exists.
- Late load/decode completions now check the cancellation flag before attaching a tile.
- Cancelled image elements have their `src` removed.
- Cancelled image elements suppress diagnostic image-error logging if `src` removal triggers an error event.

## Files Changed
- `design-world.js`
- `docs/023 - Pending tile cancellation hardening - 2026-04-11.md`

## Validation
- `node --check design-world.js`
- `node --check script.js`
- `git diff --check`

## Conclusion
- Point 7 is now complete at implementation level.
- Pending off-DOM image work is explicitly cancelled and late completions cannot attach stale tiles after cleanup.
- Real-device replay testing is still useful, but this change is intentionally narrow and should not alter the visible mobile experience.
