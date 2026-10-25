---
name: mileage-model
description: How the monthly km budget is calculated — cumulative even-pace allowance, remaining yearly km spread evenly over remaining days.
keywords: [calculation, lease, allowance, carry-over, budget]
updated: 2026-10-25
---

### Rule / Fact

- Allowance is cumulative: `startOdometer + annualLimit × elapsed lease years (fractional, per-day)`. Unused or overused km carry over into later lease years.
- Lease years run from the lease start anniversary (not calendar years); 29 Feb anniversaries fall back to 28 Feb.
- "Šį mėnesį dar galite nuvažiuoti" = (year-end target − latest odometer) / days left in lease year (today included) × days left in calendar month. If the month spills into the next lease year, that year's per-day accrual is added.
- Projection uses the average daily pace over the current lease year (falls back to the last 90 days if the year has < 14 days of data).

### Context & Why

The developer asked "how much can I drive this month without exceeding the yearly limit". Most lease contracts settle total km at the end, hence carry-over. Spreading the remainder evenly answers the question directly; the even-pace reserve tile shows ahead/behind schedule separately.

### Practical Impact

Logic lives in `src/calc.ts` (pure, tested in `src/calc.test.ts`). Change the model there, not in the UI.
