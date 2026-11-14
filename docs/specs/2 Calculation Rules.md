# CandleLab Studio — 2 Calculation Rules (GramGuard v0.1)

**Status:** Draft 2026-11-14, awaiting owner review. Nothing here is built yet. Items marked **Proposed** are recommendations that need owner confirmation; they are listed in the [[Projects/apps/candle/Specs/Specs Index|Specs Index]].

This note defines the arithmetic. The worked examples at the end are the test vectors: the calculation engine must reproduce every figure exactly, and Codex can check the candidate against them.

## 1. Terms

| Term | Meaning |
| --- | --- |
| Wax weight (W) | Combined grams of all waxes in the formula. |
| Fragrance weight (F) | Combined grams of all fragrance oils. |
| Total mixture (T) | W + F. v0.1 has no other ingredients (dye and additives are out of scope, D-4). |
| Fragrance percentage (p) | The maker's chosen fragrance level. It always carries a basis. |
| Basis | What p is a percentage of: **wax weight** or **total mixture**. |
| Parts | Relative amounts inside a blend. 3 : 2 : 1 and 50 : 33.33 : 16.67 are both valid. Parts need not add to 100. |
| Precision (u) | The smallest step the formula rounds to: 1 g, 0.1 g or 0.01 g. Match it to the maker's scale. |
| Target (planned) | A weight the calculator tells the maker to weigh out. |
| Actual (measured) | A weight the maker typed in after weighing. |

## 2. The two percentage bases

- **CALC-01 — Percentage of wax weight.** F = W × p. Often called fragrance load. 8% means 8 g of fragrance for every 100 g of wax.
- **CALC-02 — Percentage of total mixture.** F = T × p. 8% means 8 g of fragrance in every 100 g of finished mixture.
- **CALC-03 — The basis is never implied.** Every place a fragrance percentage is shown or entered names its basis in words ("8% of wax weight"). The other basis is shown next to it as an equivalent.
- **CALC-04 — Conversion.** p_total = p_wax ÷ (1 + p_wax). p_wax = p_total ÷ (1 − p_total). Equivalents display to 2 decimals.

| % of wax weight | Same blend as % of total mixture | | % of total mixture | Same blend as % of wax weight |
| --- | --- | --- | --- | --- |
| 6% | 5.66% | | 6% | 6.38% |
| 8% | 7.41% | | 8% | 8.70% |
| 10% | 9.09% | | 10% | 11.11% |
| 12% | 10.71% | | 12% | 13.64% |

**Proposed default (D-1):** new formulas start on "% of wax weight". The basis is stored with every formula version and never changes silently.

## 3. Sizing a batch

The maker chooses how to state the batch size. Exactly one mode is stored per version.

| Mode | Maker enters | Derived |
| --- | --- | --- |
| Total mixture | T in grams | W and F |
| Vessels | Vessel count × fill weight per vessel | T = count × fill, then as above |
| Wax weight | W in grams ("I have 500 g of wax") | F and T |

Exact (unrounded) fragrance weight:

| Known | Basis: wax weight | Basis: total mixture |
| --- | --- | --- |
| T (total or vessels mode) | F = T × p ÷ (1 + p) | F = T × p |
| W (wax mode) | F = W × p | F = W × p ÷ (1 − p) |

## 4. Precision and rounding

- **CALC-05 — Grams only.** All weights are grams. Vessel capacity in mL is informational and never enters a calculation (D-14).
- **CALC-06 — Exact inputs, one rounding step.** Inputs are stored exactly as entered. Results are computed from exact inputs and rounded once to the formula precision. Rounded figures are never fed back into later calculations. Scaling recomputes from the scaled inputs (see section 7).
- **CALC-07 — Deterministic arithmetic.** Results must equal exact decimal arithmetic. Binary floating point alone is not acceptable (0.1 + 0.2 problems). The reference approach is integers: weights as whole milligrams, percentages as whole hundredths of a percent, parts as whole hundredths.
- **CALC-08 — Round half up.** A value exactly halfway between two steps rounds up (2.25 → 2.3 at 0.1 g). Signed deviations round half away from zero.
- **CALC-09 — Fragrance first, wax by subtraction.** In total and vessels modes, F is rounded to the precision and W = T − F. In wax mode, F is rounded and T = W + F. Planned wax and fragrance therefore always add up to the planned total.
- **CALC-10 — Blend components always add up (largest remainder).** To split a rounded total among components by parts:
  1. Quota for each component = rounded total × its parts ÷ sum of parts.
  2. Round every quota **down** to the precision.
  3. Hand out the leftover steps one at a time to the components with the largest discarded remainder.
  4. Ties go to the component listed first.
  The planned oils add up exactly to planned F. The planned waxes add up exactly to planned W.
- **CALC-11 — Display.** Weights show fixed decimals for the precision (0, 1 or 2) and always carry "g". Percentages show 2 decimals. No thousands separators anywhere, so display and entry look the same.
- **CALC-12 — Effective blend.** Because of rounding, the planned weights can give a slightly different percentage than requested. Results show the requested percentage and, when it differs at 2 decimals, the effective one ("Planned weights give 7.99% of wax weight").
- **CALC-13 — Rounding warning (Proposed threshold, D-6).** If rounding moves the fragrance total or any component by more than 2.0% of its exact value, show: "At 1 g precision this small batch can't hit 6%. Planned weights give 6.38% of wax weight. Use 0.1 g or 0.01 g precision, or a larger batch." This is a warning and does not block saving.
- **CALC-14 — Zero component.** If any component with parts above zero rounds to 0 g, saving is blocked with: "Lavender rounds to 0 g at this precision. Use a finer precision or a larger batch."

**Proposed default precision (D-2):** 0.1 g, with 1 g and 0.01 g selectable per formula.

## 5. Blends

- **CALC-15 — Oils.** One to ten fragrance oils, each with parts. Share of blend = parts ÷ sum of parts, shown to 2 decimals for information only.
- **CALC-16 — Waxes (Proposed, D-3).** One to five waxes, split by the same parts rule. A single wax is the default and needs no parts entry.
- **CALC-17 — Unscented.** p = 0 is valid. F = 0, no oils are required, any oils listed are ignored with a note.

## 6. Target versus actual

- **CALC-18 — Entry.** Each component has an optional measured weight. Measured weights accept up to 2 decimals whatever the formula precision, and display as entered.
- **CALC-19 — Per-component difference.** Difference in grams = measured − planned (signed). Difference in percent = difference ÷ planned × 100, to 2 decimals. Shown as soon as that component has a measured weight.
- **CALC-20 — Actual blend.** Shown only when every wax and every oil has a measured weight. Until then the summary reads "Enter all measured weights to see the actual blend."
  - Actual wax = sum of measured waxes. Actual fragrance = sum of measured oils. Actual total = both.
  - Actual % of wax weight = actual fragrance ÷ actual wax.
  - Actual % of total mixture = actual fragrance ÷ actual total.
  - Both bases are always shown, with the formula's own basis first.
  - Actual share of each oil = measured oil ÷ actual fragrance.
- **CALC-21 — Off-target flag (Proposed threshold, D-6).** A component is flagged when the absolute difference exceeds the larger of one precision step or 2% of its planned weight. The flag is informational wording ("0.6 g under plan"), never a pass/fail or safety judgement.
- **CALC-22 — Measured values never change the plan.** Planned weights belong to the saved version and stay fixed. Measured weights are stored separately (see [[Projects/apps/candle/Specs/4 Data Model|Data Model]]).

## 7. Scaling

- **CALC-23 — What scales.** Only the batch size changes. Percentage, basis, precision, parts, wick and vessel are copied unchanged.
- **CALC-24 — Ways to scale.**
  - Vessels mode: new vessel count (whole number), optionally a new fill weight.
  - Total or wax mode: a new amount, or a multiplier from 0.01 to 1000.
- **CALC-25 — Multiplier rounding.** New amount = old amount × multiplier, rounded half up to the precision. The dialog shows the resulting amount before saving.
- **CALC-26 — Recompute, never multiply rounded weights.** Scaled targets come from running sections 3 to 5 on the new amount. See WE-9 for why.
- **CALC-27 — A scaled formula is a new version.** The source version is untouched. The new version records which version it came from and the factor used.

## 8. Validation

Rules run on blur and on save. On save, focus moves to the first problem field. Entry fields use a decimal keypad on phones.

| ID | Field | Rule | Message |
| --- | --- | --- | --- |
| V-01 | Any number | Digits with at most one period. No commas, signs, spaces, letters or exponent. | "Use numbers only, with a period for decimals (for example 462.5). No commas." |
| V-02 | Formula name | 1 to 80 characters after trimming. | "Give this formula a name." |
| V-03 | Batch amount (T or W) | Greater than 0, at most 1 000 000 g. | "Enter a weight above 0 g." |
| V-04 | Batch amount | No more decimals than the precision allows. | "This formula rounds to 0.1 g. Enter 500.5 or 500.6, or switch precision to 0.01 g." |
| V-05 | Vessel count | Whole number, 1 to 9999. | "Enter a whole number of vessels." |
| V-06 | Fill weight | Same rules as V-03 and V-04. | As above. |
| V-07 | Fragrance % | 0 to 50, at most 2 decimals, on either basis (Proposed, D-5). | "Enter a fragrance percentage between 0 and 50." |
| V-08 | Fragrance % | Above 12% of wax weight (or its equivalent). Warning only. | "This is above common usage levels. Check your wax supplier's maximum fragrance load." |
| V-09 | Fragrance % | Above the wax's recorded supplier maximum, compared on the supplier's stated basis. Warning only. | "Above the 10% maximum recorded for Soy 464." |
| V-10 | Wax | At least one wax selected. | "Choose a wax." |
| V-11 | Oils | At least one oil when p is above 0. | "Add a fragrance oil, or set fragrance to 0% for an unscented candle." |
| V-12 | Parts | Greater than 0, at most 9999.99, at most 2 decimals. Required when a blend has two or more components. | "Enter parts above 0." |
| V-13 | Blend rows | The same material cannot appear twice in one blend. | "Lavender is already in this blend." |
| V-14 | Result | Wax weight must come out above 0 g. | "This leaves no wax. Lower the fragrance percentage or raise the batch size." |
| V-15 | Result | CALC-14 zero component. | See CALC-14. |
| V-16 | Measured weight | 0 or more, at most 1 000 000 g, at most 2 decimals. Empty means not measured. | "Enter the measured weight in grams." |
| V-17 | Scale multiplier | 0.01 to 1000, at most 2 decimals. | "Enter a multiplier between 0.01 and 1000." |

**Incomplete input.** While required inputs are missing or invalid, the results panel shows no numbers, only "Results appear when the batch size, fragrance percentage and wax are filled in." It never shows partial or stale figures.

Warnings (V-08, V-09, CALC-13) describe supplier guidance and arithmetic. They do not certify that a candle is safe.

## 9. Worked examples (test vectors)

All figures were computed with exact integer arithmetic and checked by script on 2026-11-14. Precision is 0.1 g unless stated.

### WE-1 — Percentage of wax weight, total known
500 g total, 8% of wax weight.
- Exact F = 500 × 0.08 ÷ 1.08 = 37.03704 g → **F = 37.0 g**, **W = 463.0 g**.
- Equivalent: 7.41% of total mixture. Effective from planned weights: 7.99% of wax weight.

### WE-2 — Percentage of total mixture, total known
500 g total, 8% of total mixture.
- F = 500 × 0.08 = **40.0 g**, **W = 460.0 g**.
- Equivalent: 8.70% of wax weight.
- Same inputs as WE-1 except the basis. The fragrance differs by 3.0 g. This is the confusion the labels exist to prevent.

### WE-3 — Percentage of wax weight, wax known
1000 g wax, 10% of wax weight.
- **F = 100.0 g**, **T = 1100.0 g**. Equivalent: 9.09% of total mixture.

### WE-4 — Percentage of total mixture, wax known
450 g wax, 10% of total mixture.
- F = 450 × 0.10 ÷ 0.90 = **50.0 g**, **T = 500.0 g**. Equivalent: 11.11% of wax weight.

### WE-5 — Multi-oil blend by parts, vessels mode
6 vessels × 180 g = 1080 g total, 8% of wax weight, oils A : B : C = 3 : 2 : 1.
- **F = 80.0 g**, **W = 1000.0 g**.
- Quotas 40.0000, 26.6667, 13.3333 → rounded down 40.0, 26.6, 13.3 = 79.9. One step left goes to B (largest remainder).
- **A = 40.0 g, B = 26.7 g, C = 13.3 g** (sum 80.0 g). Shares 50.00%, 33.33%, 16.67%.

### WE-6 — Multi-oil blend with a tie, percentage of total mixture
250 g total, 9% of total mixture, oils 50 : 30 : 20.
- **F = 22.5 g**, **W = 227.5 g**. Equivalent: 9.89% of wax weight.
- Quotas 11.25, 6.75, 4.50 → rounded down 11.2, 6.7, 4.5 = 22.4. One step left. The first two tie, so the first listed gets it.
- At 0.1 g: **11.3 g, 6.7 g, 4.5 g** (sum 22.5 g).
- At 0.01 g: **11.25 g, 6.75 g, 4.50 g**.

### WE-7 — Rounding on a small blend
50 g total, 6% of wax weight, oils 2 : 1. Exact F = 2.83019 g.

| Precision | F | W | Oils | Effective % of wax | Rounding moved F by | Warning |
| --- | --- | --- | --- | --- | --- | --- |
| 1 g | 3 g | 47 g | 2 g, 1 g | 6.38% | +6.00% | Yes (CALC-13) |
| 0.1 g | 2.8 g | 47.2 g | 1.9 g, 0.9 g | 5.93% | −1.07% | No |
| 0.01 g | 2.83 g | 47.17 g | 1.89 g, 0.94 g | 6.00% | −0.01% | No |

### WE-8 — Target versus actual
Plan from WE-5. The maker weighs: wax 1003.2 g, A 40.4 g, B 26.1 g, C 13.9 g.

| Component | Planned | Measured | Difference | Flag (limit) |
| --- | --- | --- | --- | --- |
| Wax | 1000.0 g | 1003.2 g | +3.2 g (+0.32%) | No (20.0 g) |
| Oil A | 40.0 g | 40.4 g | +0.4 g (+1.00%) | No (0.8 g) |
| Oil B | 26.7 g | 26.1 g | −0.6 g (−2.25%) | Yes (0.534 g) |
| Oil C | 13.3 g | 13.9 g | +0.6 g (+4.51%) | Yes (0.266 g) |
| Fragrance total | 80.0 g | 80.4 g | +0.4 g (+0.50%) | |
| Total mixture | 1080.0 g | 1083.6 g | +3.6 g (+0.33%) | |

- Actual blend: **8.01% of wax weight**, **7.42% of total mixture**.
- Actual oil shares: 50.25%, 32.46%, 17.29% (planned 50.00%, 33.33%, 16.67%).
- With only wax and oil A entered, the two differences show and the actual blend line asks for the remaining weights.

### WE-9 — Scaling
- **9a — More vessels.** WE-5 scaled from 6 to 10 vessels: 1800 g total. Exact F = 133.33333 g → **F = 133.3 g**, **W = 1666.7 g**. Oils **66.7 g, 44.4 g, 22.2 g** (sum 133.3 g).
  - Wrong method for comparison: multiplying the rounded WE-5 weights by 10 ÷ 6 gives 66.7, 44.5, 22.2, which adds to 133.4 g and no longer matches the fragrance total. CALC-26 forbids this.
- **9b — Half batch.** WE-5 × 0.5: 540 g total → **F = 40.0 g**, **W = 500.0 g**, oils **20.0 g, 13.3 g, 6.7 g**.
- **9c — Multiplier.** WE-1 × 1.25: 625 g total → exact F = 46.29630 g → **F = 46.3 g**, **W = 578.7 g**.
- **9d — Multiplier needing rounding.** 333.3 g × 1.5 = 499.95 g → new amount **500.0 g** (half up), then as WE-1.

### WE-10 — Wax blend
800 g total, 10% of wax weight, waxes soy : coconut = 70 : 30, one oil.
- Exact F = 72.72727 g → **F = 72.7 g**, **W = 727.3 g**.
- Wax quotas 509.11, 218.19 → rounded down 509.1, 218.1. One step left goes to coconut.
- **Soy 509.1 g, coconut 218.2 g** (sum 727.3 g).

### WE-11 — Unscented
300 g total, 0%. **F = 0.0 g**, **W = 300.0 g**. No oil required.

### WE-12 — Two-decimal percentage at 0.01 g
100 g total, 8.25% of wax weight, oils 60 : 40, precision 0.01 g.
- Exact F = 7.62125 g → **F = 7.62 g**, **W = 92.38 g**. Oils **4.57 g, 3.05 g**.

### WE-13 — Invalid and incomplete input

| Input | Expected |
| --- | --- |
| Batch amount "1,000" | V-01 error. Not read as 1 g or 1000 g. |
| Batch amount "500.55" at 0.1 g | V-04 error. Not rounded silently. |
| Batch amount "0" or empty | V-03 error, results panel empty. |
| Fragrance "80" | V-07 error. |
| Fragrance "13" of wax weight | Saves, with V-08 warning. |
| Fragrance 8%, no oil | V-11 error. |
| Two oils, one with empty parts | V-12 error. |
| Same oil added twice | V-13 error. |
| 5 g total, 1% of wax, 1 g precision | F rounds to 0 g → CALC-14 blocks save. |
| Measured weight "-2" | V-01 error. |
| Vessel count "2.5" | V-05 error. |

## Open

See decisions D-1 to D-6, D-13 and D-14 in the [[Projects/apps/candle/Specs/Specs Index|Specs Index]].

## Related

[[Projects/apps/candle/Specs/1 PRD|PRD]] · [[Projects/apps/candle/Specs/3 App Flow and Wireframes|App Flow and Wireframes]] · [[Projects/apps/candle/Specs/4 Data Model|Data Model]] · [[Projects/apps/candle/Specs/5 TRD and Test Plan|TRD and Test Plan]]
