# Lossless WebP Size Measurement

## Date
- 2026-04-10

## Scope
- Measured how much disk payload the current PNG DESIGN-world pyramid would save if exported as lossless WebP.
- Did **not** replace any website assets.
- Added an offline measurement script at `tools/measure_webp_savings.py`.

## Measurement Method
- Encoder:
  - lossless WebP
  - `quality=100`
  - primary benchmark setting: `method=4`
- Reason for using `method=4` for the main benchmark:
  - `method=6` is materially slower to benchmark across the full pyramid in this environment
  - sample checks showed `method=6` improves size slightly, but not enough to justify blocking the audit on an exhaustive max-compression run

## What Was Measured Exactly
- Exact `method=4` measurements:
  - `overview.png`
  - `level-3`
  - `level-4`
  - `level-5`
- Sample-based `method=4` measurements:
  - `level-0`: 12 evenly spaced tiles out of 180
  - `level-1`: 9 evenly spaced tiles out of 45
  - `level-2`: 4 evenly spaced tiles out of 16

## Measured Results

### Overview
- `overview.png`
  - PNG: `1,235,890` bytes
  - lossless WebP: `731,842` bytes
  - savings: `40.78%`

### Exact Lower-Level Results
- `level-3`
  - PNG: `3,818,728` bytes
  - lossless WebP: `2,177,826` bytes
  - savings: `42.97%`
- `level-4`
  - PNG: `1,051,803` bytes
  - lossless WebP: `616,630` bytes
  - savings: `41.37%`
- `level-5`
  - PNG: `303,192` bytes
  - lossless WebP: `187,528` bytes
  - savings: `38.15%`

### Sampled Heavy-Tier Results
- `level-0` sample
  - sample size: `12 / 180`
  - measured savings: `43.33%`
- `level-1` sample
  - sample size: `9 / 45`
  - measured savings: `41.59%`
- `level-2` sample
  - sample size: `4 / 16`
  - measured savings: `43.34%`

## Estimated Full-Pyramid Result
- Current PNG pyramid total:
  - `323,414,375` bytes
  - about `308.43 MiB`
- Estimated lossless WebP total using the measured ratios above:
  - `184,387,861` bytes
  - about `175.84 MiB`
- Estimated savings:
  - `139,026,514` bytes
  - about `132.59 MiB`
  - about `42.99%`

## Practical Reading
- A realistic lossless WebP export should cut the pyramid payload by roughly `43%`.
- The most important contributor is still `level-0`, because it dominates the current payload.
- This is a storage / transfer win, not a guaranteed runtime smoothness fix by itself.
- Runtime smoothness still depends on:
  - tile retention policy
  - decode timing
  - level switching behavior
  - work done during active movement

## Method 6 Note
- A spot check on a large `level-0` tile showed:
  - `method=4`: `38.52%` savings
  - `method=6`: `39.81%` savings
- That suggests a full `method=6` export would likely save slightly more than the `42.99%` benchmark above, but not enough to change the overall conclusion materially.

## Files Added
- `tools/measure_webp_savings.py`

## Validation
- `python3 -m py_compile tools/measure_webp_savings.py`

## Conclusion
- Switching the current PNG DESIGN-world pyramid to lossless WebP is likely worth about `133 MiB` of saved payload, with the full pyramid dropping from about `308 MiB` to about `176 MiB`.
- This should help transfer cost and initial tile availability, but it should be treated as a complementary optimization rather than a replacement for renderer-side performance work.
