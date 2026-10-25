import { describe, expect, test } from "bun:test";
import {
  addYears,
  allowanceAt,
  leaseYearIndexAt,
  monthlyBars,
  summarize,
  toDay,
  type Reading,
  type Settings,
} from "./calc";

const settings: Settings = {
  annualLimit: 15000,
  leaseStart: "2026-01-01",
  startOdometer: 10,
  termYears: 3,
};
const r = (date: string, odometer: number): Reading => ({ id: date, date, odometer });

describe("dates", () => {
  test("addYears clamps 29 Feb", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });

  test("lease year index is clamped to the term", () => {
    expect(leaseYearIndexAt(settings, toDay("2026-12-31"))).toBe(0);
    expect(leaseYearIndexAt(settings, toDay("2027-01-01"))).toBe(1);
    expect(leaseYearIndexAt(settings, toDay("2035-01-01"))).toBe(2);
  });
});

describe("allowance", () => {
  test("accrues evenly and carries over between years", () => {
    expect(allowanceAt(settings, toDay("2026-01-01"))).toBe(10);
    expect(allowanceAt(settings, toDay("2027-01-01"))).toBe(15010);
    expect(allowanceAt(settings, toDay("2026-07-02"))).toBeCloseTo(10 + (15000 * 182) / 365);
    expect(allowanceAt(settings, toDay("2040-01-01"))).toBe(45010);
  });
});

describe("summarize", () => {
  test("spreads the remaining yearly km evenly over the remaining days", () => {
    const s = summarize(settings, [r("2026-10-01", 12010)], "2026-10-25");
    expect(s.remainingYear).toBe(3000);
    // 25 Oct .. 31 Dec inclusive = 68 days
    expect(s.daysLeftYear).toBe(68);
    expect(s.dailyBudget).toBeCloseTo(3000 / 68);
    // 25..31 Oct = 7 days
    expect(s.daysLeftMonth).toBe(7);
    expect(s.monthRemaining).toBeCloseTo((3000 / 68) * 7);
  });

  test("month driven uses interpolation from readings", () => {
    const s = summarize(settings, [r("2026-09-30", 11000), r("2026-10-20", 11400)], "2026-10-25");
    // Odometer at 1 Oct interpolates to 11020.
    expect(s.drivenThisMonth).toBeCloseTo(380);
  });

  test("flags exceeding the limit", () => {
    const s = summarize(settings, [r("2026-10-25", 16000)], "2026-10-25");
    expect(s.remainingYear).toBeLessThan(0);
    expect(s.monthRemaining).toBe(0);
    expect(s.status).toBe("critical");
  });

  test("good status when below pace", () => {
    const s = summarize(settings, [r("2026-10-25", 8000)], "2026-10-25");
    expect(s.status).toBe("good");
    expect(s.projectedOver!).toBeLessThan(0);
  });

  test("month spilling into next lease year gains new allowance", () => {
    const mid: Settings = { ...settings, leaseStart: "2026-01-20" };
    const s = summarize(mid, [r("2027-01-10", 15010)], "2027-01-10");
    // Year 1 budget exhausted; 20..31 Jan (12 days) of year 2 accrue.
    expect(s.monthRemaining).toBeCloseTo((15000 * 12) / 365);
  });
});

describe("monthlyBars", () => {
  test("budgets sum to the annual limit", () => {
    const mid: Settings = { ...settings, leaseStart: "2026-03-15" };
    const bars = monthlyBars(mid, [], 0);
    expect(bars).toHaveLength(13);
    expect(bars.reduce((a, b) => a + b.budget, 0)).toBeCloseTo(15000);
  });

  test("actual km per month", () => {
    const bars = monthlyBars(settings, [r("2026-02-01", 1010), r("2026-03-16", 2010)], 0);
    expect(bars[0]!.actual).toBeCloseTo(1000);
    expect(bars[1]!.actual).toBeCloseTo((1000 * 28) / 43);
    expect(bars[2]!.partial).toBe(true);
    expect(bars[3]!.actual).toBeNull();
  });
});
