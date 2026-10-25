// Pure lease-mileage math. Dates are ISO "YYYY-MM-DD" strings in the UI and
// integer day numbers (days since 1970-01-01, UTC) internally, so DST never
// skews day counts.

export type ISODate = string;

export interface Settings {
  annualLimit: number;
  leaseStart: ISODate;
  startOdometer: number;
  termYears: number;
}

export interface Reading {
  id: string;
  date: ISODate;
  odometer: number;
}

export interface Point {
  day: number;
  odo: number;
}

export interface LeaseYear {
  index: number;
  start: number;
  /** Exclusive. */
  end: number;
  days: number;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export function toDay(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

export function fromDay(day: number): ISODate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function todayISO(now = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Anniversary date; 29 Feb falls back to 28 Feb in non-leap years. */
export function addYears(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y! + n;
  return `${ny}-${pad(m!)}-${pad(Math.min(d!, daysInMonth(ny, m!)))}`;
}

/** First day of the calendar month containing `day`, and of the next one. */
export function monthBounds(day: number): { start: number; end: number } {
  const date = new Date(day * DAY_MS);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return {
    start: Math.round(Date.UTC(y, m, 1) / DAY_MS),
    end: Math.round(Date.UTC(y, m + 1, 1) / DAY_MS),
  };
}

export function isConfigured(s: Settings): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s.leaseStart) &&
    s.annualLimit > 0 &&
    s.termYears >= 1 &&
    s.startOdometer >= 0
  );
}

export function leaseYear(s: Settings, index: number): LeaseYear {
  const start = toDay(addYears(s.leaseStart, index));
  const end = toDay(addYears(s.leaseStart, index + 1));
  return { index, start, end, days: end - start };
}

/** Lease year containing `day`, clamped to the lease term. */
export function leaseYearIndexAt(s: Settings, day: number): number {
  let k = 0;
  while (k < s.termYears - 1 && toDay(addYears(s.leaseStart, k + 1)) <= day) k++;
  return k;
}

/**
 * Odometer value the contract allows by `day`, accrued evenly day by day.
 * Cumulative: unused (or overused) km carry over into the following years.
 */
export function allowanceAt(s: Settings, day: number): number {
  const leaseStart = toDay(s.leaseStart);
  if (day <= leaseStart) return s.startOdometer;
  const k = leaseYearIndexAt(s, day);
  const y = leaseYear(s, k);
  const within = Math.min(day - y.start, y.days);
  return s.startOdometer + s.annualLimit * k + (s.annualLimit * within) / y.days;
}

/** Lease start reading followed by user readings, sorted by date. */
export function buildPoints(s: Settings, readings: Reading[]): Point[] {
  const leaseStart = toDay(s.leaseStart);
  const pts = readings
    .map((r) => ({ day: toDay(r.date), odo: r.odometer }))
    .filter((p) => p.day > leaseStart)
    .sort((a, b) => a.day - b.day);
  return [{ day: leaseStart, odo: s.startOdometer }, ...pts];
}

/** Linear interpolation between readings; null outside the recorded range. */
export function odometerAt(pts: Point[], day: number): number | null {
  if (pts.length === 0 || day < pts[0]!.day || day > pts[pts.length - 1]!.day) return null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (day <= b.day) {
      if (b.day === a.day) return b.odo;
      return a.odo + ((b.odo - a.odo) * (day - a.day)) / (b.day - a.day);
    }
  }
  return pts[0]!.odo;
}

export type Status = "good" | "warning" | "critical";

export interface Summary {
  today: number;
  year: LeaseYear;
  yearTarget: number;
  leaseEnd: number;
  leaseStarted: boolean;
  leaseEnded: boolean;
  hasReadings: boolean;
  currentOdo: number;
  lastReadingDay: number;
  drivenThisYear: number;
  remainingYear: number;
  daysLeftYear: number;
  dailyBudget: number;
  month: { start: number; end: number };
  daysLeftMonth: number;
  drivenThisMonth: number;
  /** Planned km for this calendar month (the part inside the lease). */
  monthBudget: number;
  /** What can still be driven until the end of the calendar month without falling behind the even pace. */
  monthRemaining: number;
  paceAllowance: number;
  /** Positive = below the even-pace allowance (km in reserve). */
  paceDelta: number;
  avgDaily: number | null;
  projectedYearEnd: number | null;
  /** Positive = projected to exceed the limit by this many km. */
  projectedOver: number | null;
  status: Status;
}

export function summarize(s: Settings, readings: Reading[], todayIso = todayISO()): Summary {
  const leaseStart = toDay(s.leaseStart);
  const today = toDay(todayIso);
  const pts = buildPoints(s, readings);
  const last = pts[pts.length - 1]!;
  const leaseEnd = leaseYear(s, s.termYears - 1).end;

  const year = leaseYear(s, leaseYearIndexAt(s, today));
  const yearTarget = s.startOdometer + s.annualLimit * (year.index + 1);
  const currentOdo = last.odo;

  // Today counts as a remaining day: the budget covers the rest of today too.
  const from = Math.max(today, year.start);
  const daysLeftYear = Math.max(year.end - from, 0);
  const remainingYear = yearTarget - currentOdo;
  const dailyBudget = daysLeftYear > 0 ? Math.max(remainingYear, 0) / daysLeftYear : 0;

  const month = monthBounds(from);
  const monthFrom = Math.max(month.start, leaseStart);
  const daysLeftMonth = Math.max(month.end - from, 0);
  // Even-pace allowance up to the end of the month, so accumulated overuse (or
  // reserve) counts against this month. allowanceAt also covers a month that
  // spills into the next lease year.
  const monthEndAllowance = allowanceAt(s, month.end);
  const monthBudget = monthEndAllowance - allowanceAt(s, monthFrom);
  const monthRemaining = monthEndAllowance - currentOdo;

  const monthStartOdo = odometerAt(pts, monthFrom);
  const drivenThisMonth = monthStartOdo === null ? 0 : currentOdo - monthStartOdo;
  const yearStartOdo = odometerAt(pts, year.start);
  const drivenThisYear = yearStartOdo === null ? 0 : Math.max(currentOdo - yearStartOdo, 0);

  const paceAllowance = allowanceAt(s, Math.max(today, last.day));
  const paceDelta = paceAllowance - currentOdo;

  // Average pace: this lease year if it has enough history, else the last ~90 days.
  let windowStart = year.start;
  if (last.day - windowStart < 14) windowStart = Math.max(leaseStart, last.day - 90);
  const windowOdo = odometerAt(pts, windowStart);
  const avgDaily =
    last.day - windowStart >= 1 && windowOdo !== null
      ? (currentOdo - windowOdo) / (last.day - windowStart)
      : null;
  const projectedYearEnd =
    avgDaily === null ? null : currentOdo + avgDaily * Math.max(year.end - last.day, 0);
  const projectedOver = projectedYearEnd === null ? null : projectedYearEnd - yearTarget;

  let status: Status;
  const over = projectedOver ?? -paceDelta;
  if (remainingYear < 0 || over > s.annualLimit * 0.03) status = "critical";
  else if (over > 0) status = "warning";
  else status = "good";

  return {
    today,
    year,
    yearTarget,
    leaseEnd,
    leaseStarted: today >= leaseStart,
    leaseEnded: today >= leaseEnd,
    hasReadings: pts.length > 1,
    currentOdo,
    lastReadingDay: last.day,
    drivenThisYear,
    remainingYear,
    daysLeftYear,
    dailyBudget,
    month,
    daysLeftMonth,
    drivenThisMonth,
    monthBudget,
    monthRemaining: Math.max(monthRemaining, 0),
    paceAllowance,
    paceDelta,
    avgDaily,
    projectedYearEnd,
    projectedOver,
    status,
  };
}

export interface MonthBar {
  start: number;
  /** Planned km for the part of this calendar month inside the lease year. */
  budget: number;
  /** Actual km, null when the month has no recorded data yet. */
  actual: number | null;
  /** True when readings cover only part of the month. */
  partial: boolean;
}

/** Calendar months overlapping lease year `index`, planned vs. driven. */
export function monthlyBars(s: Settings, readings: Reading[], index: number): MonthBar[] {
  const pts = buildPoints(s, readings);
  const lastDay = pts[pts.length - 1]!.day;
  const y = leaseYear(s, index);
  const bars: MonthBar[] = [];
  for (let m = monthBounds(y.start); m.start < y.end; m = monthBounds(m.end)) {
    const segStart = Math.max(m.start, y.start);
    const segEnd = Math.min(m.end, y.end);
    const budget = (s.annualLimit * (segEnd - segStart)) / y.days;
    let actual: number | null = null;
    if (segStart < lastDay) {
      const a = odometerAt(pts, segStart);
      const b = odometerAt(pts, Math.min(segEnd, lastDay));
      if (a !== null && b !== null) actual = b - a;
    }
    bars.push({ start: m.start, budget, actual, partial: actual !== null && segEnd > lastDay });
  }
  return bars;
}
