# DESIGN World Runtime Mode Cleanup Audit

## Date
- 2026-04-10

## Scope
- Short cleanup audit of the current DESIGN-world runtime split after the desktop WebP rollout and the mobile loader rollback / restore.
- No code changes were made as part of this audit.

## Current Runtime Truth

### Desktop
- Manifest:
  - `manifest.json`
- Assets:
  - WebP tiles
  - WebP overview
- Loader behavior:
  - decode-before-attach
  - eager loading
  - bounded LRU retention
  - hysteresis
  - settled-fill behavior

### Mobile
- Manifest:
  - `manifest-mobile.json`
- Assets:
  - PNG tiles
  - no overview in practice because `useOverview: false`
- Loader behavior:
  - attach-before-load
  - lazy loading
  - visible-only eviction
  - strict retained-tile cap
  - reduced max zoom / reduced level ceiling

## Findings

### 1. The split is real and should now be treated as intentional
- Desktop and mobile no longer share one coherent renderer policy.
- They share one class, but they do **not** share one loading model anymore.
- That is acceptable, but only if it is named and maintained intentionally.

### 2. The current config shape still relies too much on implicit defaults
- `activeDesignWorldConfig` is assembled by pointer class and then partially passed through.
- Some options only exist on one branch and rely on constructor defaults on the other branch.
- That works, but it is easy to misread and easy to break during future edits.

### 3. `manifest-mobile.json` still carries fields that are irrelevant to the real mobile path
- Mobile currently sets `useOverview: false`.
- That means the manifest `overview` field is not operationally important for the current runtime.
- Keeping non-operative fields is not a bug, but it adds noise during debugging.

### 4. The shared loader now contains two fundamentally different attachment models
- Desktop:
  - deferred attach
- Mobile:
  - attach-first
- This is the right practical outcome for now, but it means loader changes need mode-aware testing from now on.

### 5. Some recent docs are already superseded by later fixes
- The repo record is honest, but the real current mobile story is spread across:
  - `015`
  - `016`
  - `017`
  - `018`
- Future work should treat `018` as the real current mobile loader baseline, not `015`.

## Recommended Cleanup Direction

### 1. Replace the one inline conditional config with named mode configs
- Create explicit objects for:
  - `desktopDesignWorldConfig`
  - `mobileDesignWorldConfig`
- Then pick between them once.
- This is the highest-value cleanup because it removes hidden default-driven behavior.

### 2. Name the two loader strategies explicitly
- Example direction:
  - desktop strategy: `decode_before_attach`
  - mobile strategy: `attach_before_load`
- Right now that split is encoded indirectly through booleans.

### 3. Document the operational baseline clearly
- Current truth should be treated as:
  - desktop = quality and smoothness first
  - mobile = stability first

### 4. Do not try to unify mobile and desktop again casually
- The recent failures are evidence that Safari mobile and desktop have different safe operating envelopes in this project.
- Any future “cleanup” that tries to force one shared loading model should be treated as risky.

## Conclusion
- The repo is not in a broken conceptual state, but it is carrying too much implicit mode logic.
- The immediate cleanup need is not another performance change.
- The immediate cleanup need is to make the desktop/mobile split more explicit so future edits do not accidentally reintroduce the same overlap.
