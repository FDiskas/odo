---
name: mileage-model
description: How the monthly km budget is calculated — cumulative even-pace allowance up to month end minus odometer; overuse/reserve counts against the month.
keywords: [calculation, lease, allowance, carry-over, budget, month]
updated: 2026-10-25
---

### Rule / Fact

- Allowance is cumulative: `startOdometer + annualLimit × elapsed lease years (fractional, per-day)`. Unused or overused km carry over into later lease years.
- Lease years run from the lease start anniversary (not calendar years); 29 Feb anniversaries fall back to 28 Feb.
- "Šį mėnesį dar galite nuvažiuoti" = `allowanceAt(end of calendar month) − latest odometer`, clamped at 0. Accumulated overuse eats into the month; reserve adds to it. Month spilling into the next lease year is handled by `allowanceAt`.
- Monthly ring shows driven this month vs. `monthBudget` (the month's planned share), not used + remaining.
- When the month allowance is 0, the hero shows the overrun vs. even pace and the long-term pace `dailyBudget` = (year-end target − odometer) / days left in lease year.
- Projection uses the average daily pace over the current lease year (falls back to the last 90 days if the year has < 14 days of data).

### Context & Why

The developer asked "how much can I drive this month without exceeding the yearly limit". Spreading the yearly remainder evenly over remaining days was rejected: it hid accumulated overuse (showed 277 km "left" while already 485 km over pace and over the month's quota), and the ring's total grew together with the overrun.

### Practical Impact

Logic lives in `src/calc.ts` (pure, tested in `src/calc.test.ts`). Change the model there, not in the UI. Headline per-day figure = monthRemaining / daysLeftMonth, so it stays consistent with the headline.
