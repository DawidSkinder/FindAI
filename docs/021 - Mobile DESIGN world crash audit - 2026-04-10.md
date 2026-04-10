# Mobile DESIGN World Crash Audit

## Date
- 2026-04-10

## Scope
- Audited recurring iPhone 16 Pro crashes during state B / active DESIGN-world search.
- Researched whether WebP should be considered safe on modern iOS Safari.
- Reviewed current mobile renderer policy and prior mobile WebP rollback notes.
- No runtime code or asset changes were made.

## Current Mobile Runtime
- Mobile is selected with `matchMedia("(pointer: coarse)")`.
- Mobile uses:
  - `manifest-mobile.json`
  - levels `2-5`
  - PNG tiles
  - no overview image
  - attach-before-load tile insertion
  - `loading="lazy"`
  - `tileBuffer: 0`
  - `interactiveTileBuffer: 0`
  - visible-only eviction
  - `maxRetainedTiles: 6`
  - no level hysteresis
  - no keep-current-level-while-interacting behavior
  - `maxScale: 0.4`

## WebP Research
- WebKit added WebP support in Safari 14 for macOS Big Sur, iOS 14, iPadOS 14, and watchOS 7.
- WebKit described the support as including lossy and lossless formats, alpha transparency, and animations.
- Current Can I Use data lists Safari on iOS as supported from iOS Safari 14 through current iOS Safari versions.
- MDN describes WebP as broadly supported in current major browsers, while still noting that older historical support is less deep than JPEG/PNG.

### Practical Interpretation
- The previous mobile WebP failure should not be interpreted as proof that modern iOS Safari cannot render WebP.
- The documented failure path was more specific:
  - mobile WebP was first tried while the loader was using deferred/off-DOM loading behavior
  - one fix changed lazy loading to eager
  - real-device Safari still failed before the current attach-before-load mobile path was restored
- The likely failure was the interaction between the loader strategy, timing, and Safari mobile behavior, not basic WebP incompatibility.
- Retrying WebP is technically reasonable, but it should be tested under the current attach-before-load mobile path and behind a fast rollback path.

## Asset Pressure Measurement

### Mobile-Safe PNG Levels
- `level-2`: 16 PNG files, 13.99 MiB
- `level-3`: 4 PNG files, 3.64 MiB
- `level-4`: 2 PNG files, 1.00 MiB
- `level-5`: 1 PNG file, 0.29 MiB
- Total mobile-safe PNG payload: 18.93 MiB

### Mobile-Safe WebP Companions
- `level-2`: 16 WebP files, 7.94 MiB
- `level-3`: 4 WebP files, 2.08 MiB
- `level-4`: 2 WebP files, 0.59 MiB
- `level-5`: 1 WebP file, 0.18 MiB
- Total mobile-safe WebP payload: 10.78 MiB

### Result
- Existing mobile-safe WebP files save about 8.15 MiB versus PNG.
- That is roughly 43% less transfer and cache payload.
- This is meaningful for network and resource availability.
- It does not reduce decoded image memory. A decoded 1024 x 1024 RGBA tile is still about 4 MiB regardless of PNG or WebP source format.

## Likely Crash Causes

### 1. Mobile Still Does Too Much During Active Gestures
- `DesignWorldLayer.setView()` applies the transform, then schedules interactive tile rendering on every transform change.
- Touch pan and pinch update the canvas state on every move.
- On mobile, that means active gestures can repeatedly trigger:
  - visible tile calculation
  - level selection
  - new image element creation
  - DOM append
  - `src` assignment
  - hiding/removing old tiles
  - browser image load/decode work
- This is exactly the kind of active-gesture work the desktop optimization reduced.

### 2. Mobile Has No Level Hysteresis
- Mobile sets `levelSwitchHysteresis: 0`.
- Mobile sets `keepCurrentLevelWhileInteracting: false`.
- During pinch zoom, the renderer can switch levels at mathematical crossover points.
- Around those thresholds, Safari may be asked to discard one level and request another while the user is still pinching.
- That creates decode churn and DOM churn at the worst possible moment.

### 3. Visible-Only Eviction May Be Too Aggressive
- Visible-only eviction removes offscreen tile elements instead of keeping a small warm cache.
- This keeps retained decoded memory low, but it can backfire during rapid pan/zoom because recently used tiles must be recreated and decoded again.
- The better mobile target is likely not "retain almost nothing"; it is "retain a small bounded cache and stop thrashing."

### 4. `loading="lazy"` Is Risky For Critical Dynamic Tiles
- Browser-level lazy loading is intended mainly for below-the-fold media.
- The DESIGN-world tiles are dynamic critical viewport content.
- The current attach-before-load path is better than off-DOM lazy loading, but `loading="lazy"` still gives Safari discretion to defer image work.
- For current visible state-B tiles, `loading="eager"` is more predictable.

### 5. The DESIGN Surface Uses Expensive Drop Shadows
- `.design-world-surface` has two `filter: drop-shadow(...)` effects.
- CSS filters operate as post-processing on rendered content, and blur/drop-shadow are specifically expensive on mobile-class devices.
- Applying this to a very large transformed DESIGN surface is a plausible GPU/compositor memory pressure source.
- Removing or simplifying this effect only on mobile state B would not reduce zoom level or file quality.

### 6. Tile Memory May Persist Across State Changes
- The current state transition to postgame/reveal hides the DESIGN world but does not obviously clear all mobile tile elements and pending image work.
- If a user restarts the experience, decoded images may survive longer than needed.
- Mobile should actively release tile elements and pending image sources after the game ends, especially after the fade-out completes.

## Recommended Optimization Order

### 1. Add Mobile Renderer Diagnostics First
- Add a lightweight diagnostic report exposed through `window.__noAiInDesign`.
- Include:
  - current mode: mobile or desktop
  - tile format: PNG or WebP
  - current level
  - visible tile count
  - retained tile count
  - pending tile count
  - total created tiles
  - total removed tiles
  - recent level switches
  - recent image load errors
  - estimated decoded tile memory
- This gives Dawid a copyable report instead of relying on subjective crash descriptions.

### 2. Retry WebP On Mobile Under The Current Attach-First Loader
- Switch only mobile `tileExtension` to `webp`.
- Keep `tileAttachMode: "attach-before-load"`.
- Do not use the previous deferred/off-DOM decode-first path for mobile.
- Prefer `tileLoading: "eager"` for currently visible mobile tiles.
- Keep PNG available as an immediate rollback.
- Optional hardening: run a one-tile WebP support probe before state B and fall back to PNG if decode/load fails.

### 3. Bring Desktop's Interaction Discipline To Mobile, But Not Its Loader
- Keep mobile attach-before-load.
- Add mobile level hysteresis.
- Keep current level during active pan/pinch.
- Delay final level selection until interaction settles.
- Consider increasing `settleDelayMs` from 96 ms to roughly 160-220 ms on mobile.
- This should reduce level churn while preserving the existing zoom ceiling and asset detail.

### 4. Replace Visible-Only Eviction With A Small Mobile LRU Or Grace Cache
- Keep a strict mobile cap, but stop immediately deleting every tile that leaves the viewport.
- Candidate cap: 8-12 retained tiles.
- At 1024 x 1024 RGBA, that is roughly 32-48 MiB of decoded tile memory before browser/GPU overhead.
- That is higher than current visible-only pressure, but likely lower-risk than repeated load/decode churn during fast gestures.

### 5. Disable Heavy Surface Filters On Mobile State B
- Remove or simplify `.design-world-surface` drop shadows for mobile active search.
- This should reduce compositor/GPU pressure without changing artwork resolution, zoom ceiling, or interaction depth.

### 6. Actively Release Tiles After Search Ends
- When leaving game state, clear pending tiles and remove image `src` values after the fade-out.
- This reduces memory persistence before reveal/restart.

## Recommended Test Matrix
- Test on real iPhone Safari, not only desktop responsive mode.
- Compare:
  - current PNG mobile baseline
  - WebP attach-before-load plus eager visible tiles
  - WebP plus mobile hysteresis / keep-current-level-while-interacting
  - WebP plus small LRU / grace cache
  - same with mobile state-B drop shadows disabled
- Stress scenarios:
  - 45 seconds of continuous pan
  - pinch repeatedly around level thresholds
  - pan at max zoom across letter boundaries
  - restart the experience three times without closing Safari
- Capture:
  - crash / no crash
  - blank tiles
  - visible tile count
  - retained tile count
  - level switch count
  - image load error count

## Sources
- WebKit, "New WebKit Features in Safari 14": https://webkit.org/blog/11340/new-webkit-features-in-safari-14/
- Can I Use, WebP image format: https://caniuse.com/webp
- MDN, Image file type and format guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
- web.dev, Browser-level lazy loading for CMSs: https://web.dev/articles/browser-level-lazy-loading-for-cmss
- web.dev, Understanding CSS filter effects: https://web.dev/articles/understanding-css

## Conclusion
- WebP should be retried on mobile, but it is only one part of the fix.
- The highest-probability crash cause is active-gesture renderer churn: level switching, tile attach/remove, image loading, and decode work happening while the user is pinching or panning.
- The best next implementation pass should combine:
  - mobile WebP retry under attach-before-load
  - eager loading for currently visible tiles
  - mobile hysteresis / settled-fill behavior
  - a small bounded tile cache instead of visible-only deletion
  - mobile state-B filter simplification
  - post-game tile cleanup
  - built-in diagnostics for real-device reports
