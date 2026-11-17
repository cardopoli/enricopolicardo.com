# Positive Film: a measured formula for the Ricoh GR look

Enrico Policardo, November 2026. Version 0.1. Free to use and build on.

Tool: https://cardopoli.github.io/enricopolicardo.com/tools/positive-film/

## Summary

Positive Film is the colour setting on Ricoh GR cameras that people copy most. Existing emulations are either sealed paid profiles or "recipes" that only work on a GR because they sit on top of Positive Film itself. This study measures the look from the camera's own files and writes it down as a readable formula: one tone curve plus a small set of colour shifts. Applied to RAW files, the formula lands within 1.3 to 2.1 ΔE 2000 of the GR's own JPEGs, which is hard to tell apart side by side.

## Source material

Six frames from an original Ricoh GR (2013), each shot as RAW (DNG) plus a JPEG on Positive Film at default settings, as-shot white balance:

| Frame | Light | Main colours |
|---|---|---|
| Street, shop front | Evening daylight | Saturated reds, deep blue shutter, green bin, sky |
| Dog | Overcast | Foliage, autumn leaves, warm greys |
| Tower block | Sun, blue sky | Sky, red brick, white panels |
| Portrait | Interior window light | Skin, grey fabric, cream wall |
| Interior | Window, backlit | Mostly tonal information |
| Festival | Daylight plus LED screen | Crowd, skin, reds, blues |

DNG size 4368 × 3280; JPEG 2576 × 1932.

## Method

1. **Neutral render.** Each DNG was developed with LibRaw (via rawpy): camera white balance, no tone curve (linear), no auto-brightening, half-size demosaic, output in CIE XYZ. LibRaw's direct linear sRGB output matches this route exactly, which is what the browser tool uses.
2. **Alignment.** Both images were downsampled to 644 × 483 and aligned by phase correlation on log luminance. Shifts were under one pixel; correlation 0.91 to 0.99.
3. **Masking.** Clipped raw or JPEG pixels, high-gradient edges (top 30%) and an 8-pixel border were left out. Both images were lightly blurred (σ 1.2 px) to remove sharpening and demosaic differences.
4. **Tone curve.** JPEG lightness (CIE L\*) was fitted against scene luminance in stops (log2 Y) on near-neutral pixels (chroma under 6), as one monotone (isotonic) curve shared across all six frames. Per-frame exposure offsets were allowed but came out at zero (one at +0.05 stops), so the GR appears to apply the same curve every time. Residual: 0.98 L\* RMS. The final curve was smoothed (Gaussian, about 0.15 stops) and sampled every 0.05 stops.
5. **Curve per channel.** Applying the curve to the red, green and blue channels separately fits clearly better than applying it to luminance only (for example 4.44 → 2.54 ΔE on the tower frame). A per-channel curve also explains why saturation rises in the shadows and falls in the highlights.
6. **Colour stage.** After the curve, the remaining differences were fitted in CIE LCh: saturation (as a log gain), hue shift and lightness shift for 8 hue bands, with linear interpolation between neighbouring bands, plus 4 lightness bands for saturation and lightness. The fit is a Huber regression, so outliers carry little weight. A constant a\*/b\* cast was measured on near-neutral pixels.
7. **Validation.** Mean ΔE 2000 against the real JPEG for each frame, plus leave-one-out: refit without a frame, then test on it.

## The formula

### 1. Tone curve

Apply to each linear RGB channel (camera white balance, linear sRGB primaries, 1.0 = raw clipping point). Input in stops relative to 18% grey; output in CIE L\*.

| Stops | L\* | Stops | L\* |
|---|---|---|---|
| -4.0 | 2 | 0.0 | 69 |
| -3.0 | 7 | +0.5 | 77 |
| -2.5 | 14 | +1.0 | 83 |
| -2.0 | 23 | +1.5 | 89 |
| -1.5 | 35 | +2.0 | 94 |
| -1.0 | 48 | +2.5 | 98 (clip) |
| -0.5 | 59 | | |

The full 0.05-stop table is in `positive-film-formula.json`. In short, the curve has a deep toe (near black below -3 stops), bright mid-tones, a soft shoulder and a hard clip about 2.5 stops over mid grey.

### 2. Colour, after the curve (CIE LCh)

Hue band centres (Lab hue angle): red 20°, orange 50°, yellow 85°, green 135°, cyan 190°, blue 250°, purple 300°, magenta 340°. A pixel takes a weighted mix of its two nearest bands.

| Band | Saturation | Hue shift | Lightness | Data |
|---|---|---|---|---|
| Red | +16% | -0.5° | +1.7 | solid |
| Orange | +19% | -15.2° (towards red) | +1.3 | solid |
| Yellow | -15% | -25.8° (towards orange) | +1.1 | solid |
| Green | -49% | +2.4° (towards cyan) | +0.1 | solid |
| Cyan | 0% | +40.2° (towards blue) | -2.5 | thin |
| Blue | +13% | +6.4° (towards purple) | +0.2 | solid |
| Purple | -14% | +1.5° | +0.7 | solid |
| Magenta | +5% | +7.0° (towards red) | -3.6 | thin |

Lightness bands, interpolated (saturation multiplier / lightness shift): L\* 25: ×1.11 / -1.0 · L\* 45: ×1.01 / +0.1 · L\* 65: ×1.00 / -0.2 · L\* 85: ×0.94 / 0.0.

### 3. Grey cast

a\* +1.11, b\* -0.68: a slight magenta-blue tint, constant across tones.

### In plain words

Positive Film is less about adding colour than taking it away from the right places. It pulls greens back by about half, turns yellow towards ochre, warms orange towards red, keeps reds and blues at full strength, crushes the blacks and leaves a faint magenta-blue tint in the greys.

## Accuracy

Mean ΔE 2000 between each RAW put through the formula and the GR's own Positive Film JPEG (masked, blurred pixels as above).

| Frame | Curve only | Full formula | Frame left out |
|---|---|---|---|
| Street, shop front | 3.38 | 1.98 | 2.02 |
| Dog | 3.94 | 1.42 | 1.48 |
| Tower block | 2.54 | 1.27 | 1.19 |
| Portrait | 2.52 | 1.61 | 1.83 |
| Interior | 1.67 | 1.65 | 1.93 |
| Festival | 3.61 | 2.12 | 2.35 |

The leave-one-out column barely moves, so the formula is not just memorising these frames. The browser implementation matches the Python model to 0.05 ΔE on 20,000 sample pixels. An end-to-end run in Chrome on the street frame landed 2.55 ΔE from the real JPEG, including resampling and JPEG compression.

## Comparison with earlier work

bastibe's darktable styles (public domain) measured the GR III's Positive Film from a ColorChecker with darktable-chart. That data also shows greens and yellows pulled back by 30 to 38%, blues darkened and the darkest grey crushed (L\* 22 → 17). The original GR measured here is stronger: greens about -49%, and yellow pushed harder towards orange. That fits the common view that later GRs render Positive Film more gently. The two studies use different baselines (darktable's sigmoid against the curve here), so compare the direction of each change rather than its exact size.

Forum users had already spotted the pattern by eye. In a DPReview thread on emulating GR II Positive Film in Lightroom, a user noted that it desaturates the colours it doesn't favour. Another, on the GR III, described it as desaturating and darkening greens.

## Limits

- Cyan and magenta were rare in the test frames, so those rows are estimates.
- Mixed artificial light fits worst (the festival frame runs slightly over-saturated in blues and purples).
- The formula is defined on LibRaw's standard colour matrices. Another camera reaches the same scene colour through its own matrix, then takes the same formula. Results will vary with how well that camera's matrix is calibrated.
- Each sensor clips its highlights at a different point. The tool's exposure slider compensates.
- Sharpening, noise reduction and vignetting are not modelled.
- Six frames from one camera body.

## Further work

- Add frames with turquoise and pink in daylight to firm up the cyan and magenta rows.
- Measure later GR bodies the same way and compare.
- Turn the formula into darktable styles, DaVinci Resolve nodes and a Lightroom approximation.
- Fit the closest in-camera settings for cameras with only basic sliders (for example Panasonic Photo Styles), using in-camera RAW processing sweeps.

## Files

- `positive-film-formula.json`: the complete formula (curve table and colour coefficients).
- `positive-film-pipeline.zip`: the Python analysis code and the JavaScript implementation, with instructions. The source photographs are not included.

## Sources

- bastibe, Darktable Film Simulation Panel: https://github.com/bastibe/Darktable-Film-Simulation-Panel
- DPReview forum, "Lightroom Settings to Emulate GR II Positive Film?": https://www.dpreview.com/forums/thread/4260861
- DPReview forum, "Ricoh griii/x Standard Colour Profile": https://www.dpreview.com/forums/thread/4605993
- RicohCookBook, Positive Film recipes: https://ricohcookbook.com/positive-film-recipes
- GR4-LUTSmith (fitting LUTs to GR IV image controls): https://github.com/lemonadesaltbagel/GR4-LUTSmith
- LibRaw: https://www.libraw.org/ · rawpy: https://github.com/letmaik/rawpy · LibRaw-Wasm: https://github.com/ybouane/LibRaw-Wasm
- colour-science (Python colour library): https://www.colour-science.org/

Positive Film is Ricoh's name for its own camera setting. This is an independent measurement, not connected to Ricoh.
