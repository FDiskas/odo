import {
  allowanceAt,
  buildPoints,
  isConfigured,
  leaseYear,
  monthBounds,
  monthlyBars,
  odometerAt,
  summarize,
  toDay,
  todayISO,
  type Reading,
  type Settings,
  type Summary,
} from "./calc";
import { barChart, lineChart, type LineSeries, type XY } from "./charts";
import {
  countUp,
  dayWord,
  escape,
  fmtDate,
  fmtShortDate,
  km,
  MONTH_ACC,
  MONTH_NOM,
  MONTH_SHORT,
  num,
  parts,
  prefersReducedMotion,
  signedKm,
} from "./format";
import { runOnboarding } from "./onboarding";

/* ---------- state & persistence ---------- */

interface State {
  settings: Settings;
  readings: Reading[];
  theme?: "light" | "dark";
}

const STORAGE_KEY = "odo:v1";
const DEFAULTS: Settings = { annualLimit: 15000, leaseStart: "", startOdometer: 0, termYears: 3 };

function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      return {
        settings: { ...DEFAULTS, ...raw.settings },
        readings: Array.isArray(raw.readings) ? raw.readings : [],
        theme: raw.theme,
      };
    }
  } catch {
    // Storage blocked or corrupt — start fresh.
  }
  return { settings: { ...DEFAULTS }, readings: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode etc. — the app still works for this session.
  }
}

const state = load();
let selectedYear: number | null = null;

/* ---------- DOM ---------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const COLOR_ACTUAL = "var(--series-actual)";
const COLOR_PLAN = "var(--muted)";

/* ---------- rendering ---------- */

function render() {
  const s = state.settings;
  const configured = isConfigured(s);
  const sum = configured ? summarize(s, state.readings) : null;

  renderHero(sum);
  renderStatus(sum);
  renderTiles(sum);
  renderCharts(sum);
  renderHistory();
  $("subtitle").textContent = configured
    ? `Metinis limitas ${km(s.annualLimit)} · lizingas nuo ${fmtDate(toDay(s.leaseStart))}`
    : "Kiek galite nuvažiuoti šį mėnesį neviršydami metinio limito";
}

function renderHero(sum: Summary | null) {
  const hero = $("hero");
  if (!sum) {
    hero.innerHTML = `
      <div class="empty">
        <h2>Sveiki!</h2>
        <p class="muted">Įveskite lizingo pradžios datą ir tuometinę ridą <a href="#settings-card">nustatymuose</a> —
        tada paskaičiuosime, kiek galite nuvažiuoti šį mėnesį.</p>
      </div>`;
    return;
  }
  if (!sum.leaseStarted) {
    hero.innerHTML = `<div class="empty"><h2>Lizingas dar neprasidėjo</h2>
      <p class="muted">Skaičiavimas prasidės ${fmtDate(toDay(state.settings.leaseStart))}.</p></div>`;
    return;
  }
  if (sum.leaseEnded) {
    const total = state.settings.annualLimit * state.settings.termYears;
    const over = sum.currentOdo - state.settings.startOdometer - total;
    hero.innerHTML = `<div class="empty"><h2>Lizingo laikotarpis baigėsi</h2>
      <p class="muted">Per visą laikotarpį nuvažiuota ${km(sum.currentOdo - state.settings.startOdometer)} iš ${km(total)}
      (${over > 0 ? `viršyta ${km(over)}` : `liko nepanaudota ${km(-over)}`}).</p></div>`;
    return;
  }
  if (!sum.hasReadings) {
    hero.innerHTML = `<div class="empty"><h2>Įveskite dabartinę ridą</h2>
      <p class="muted">Kad paskaičiuotume šio mėnesio limitą, reikia bent vieno odometro rodmens
      skiltyje „Atnaujinti ridą“.</p></div>`;
    return;
  }

  const { m } = parts(sum.today);
  const monthEndDay = sum.month.end - 1;
  const used = Math.max(sum.drivenThisMonth, 0);
  const total = sum.monthBudget;
  const pct = total > 0 ? Math.min(used / total, 1) : 1;
  const C = 2 * Math.PI * 62;
  const stale = sum.lastReadingDay < sum.today;
  const daysLeft = `iki ${fmtShortDate(monthEndDay)} liko <strong>${sum.daysLeftMonth} ${dayWord(sum.daysLeftMonth)}</strong>`;

  let sub: string;
  if (sum.remainingYear < 0) {
    sub = `<strong class="delta-bad">Šių lizingo metų limitas jau viršytas ${km(-sum.remainingYear)}.</strong>`;
  } else if (sum.monthRemaining > 0) {
    sub = `≈ <strong>${km(sum.monthRemaining / Math.max(sum.daysLeftMonth, 1))}</strong> per dieną · ${daysLeft}`;
  } else {
    sub = `<strong class="delta-bad">Tolygų grafiką viršijate ${km(-sum.paceDelta)}.</strong>
           Kad tilptumėte į ${km(state.settings.annualLimit)} per metus, toliau važiuokite ne daugiau
           ≈ <strong>${km(sum.dailyBudget)}</strong> per dieną.`;
  }

  hero.innerHTML = `
    <div>
      <p class="hero-label">Šį mėnesį (${MONTH_ACC[m]}) dar galite nuvažiuoti</p>
      <p class="hero-value"><span class="hero-num">${num(sum.monthRemaining)}</span><span class="unit">km</span></p>
      <p class="hero-sub">${sub}</p>
      ${
        stale
          ? `<p class="muted small stale-note">Paskutinis rodmuo — ${fmtDate(sum.lastReadingDay)}.
             Atnaujinkite ridą, kad skaičiavimas būtų tikslesnis.</p>`
          : ""
      }
    </div>
    <div class="ring-wrap">
    <div class="ring" role="img" aria-label="Šį mėnesį nuvažiuota ${km(used)} iš ${km(total)}">
      <svg viewBox="0 0 150 150">
        <circle class="track" cx="75" cy="75" r="62" fill="none" stroke-width="12" />
        <circle class="value" cx="75" cy="75" r="62" fill="none" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" />
      </svg>
      <div class="ring-center"><b>${num(used)}</b><span>iš ${km(total)}</span></div>
    </div>
    <span class="muted small">Nuvažiuota ${MONTH_ACC[m]}</span>
    </div>`;
}

function renderStatus(sum: Summary | null) {
  const el = $("status");
  if (!sum || !sum.hasReadings || !sum.leaseStarted || sum.leaseEnded) {
    el.innerHTML = `<h2>Būsena</h2><p class="muted">Prognozė atsiras įvedus ridą.</p>`;
    return;
  }
  const chip = {
    good: { icon: "✓", label: "Telpate į limitą" },
    warning: { icon: "!", label: "Artėjate prie limito" },
    critical: { icon: "✕", label: sum.remainingYear < 0 ? "Limitas viršytas" : "Viršysite limitą" },
  }[sum.status];

  const limit = state.settings.annualLimit;
  const yearFloor = sum.yearTarget - limit;
  const usedPct = Math.min(Math.max((sum.currentOdo - yearFloor) / limit, 0), 1);
  const timePct = Math.min(Math.max((sum.lastReadingDay - sum.year.start) / sum.year.days, 0), 1);
  const yearEndDay = sum.year.end - 1;

  el.innerHTML = `
    <span class="chip ${sum.status}"><span class="dot" aria-hidden="true">${chip.icon}</span>${chip.label}</span>
    ${
      sum.projectedYearEnd !== null && sum.projectedOver !== null
        ? `<p class="muted small">Prognozuojama rida ${fmtShortDate(yearEndDay)}</p>
           <p class="big">${km(sum.projectedYearEnd)}</p>
           <p class="small ${sum.projectedOver > 0 ? "delta-bad" : "delta-good"}" style="margin:0">
             ${sum.projectedOver > 0 ? `${km(sum.projectedOver)} virš limito` : `${km(-sum.projectedOver)} mažiau nei limitas`}
             (${km(sum.yearTarget)})
           </p>`
        : `<p class="muted small">Prognozei reikia daugiau duomenų.</p>`
    }
    <div class="meter-wrap">
      <div class="meter" role="img" aria-label="Išnaudota ${Math.round(usedPct * 100)} % metinio limito, praėjo ${Math.round(timePct * 100)} % metų">
        <i style="width:${(usedPct * 100).toFixed(1)}%"></i>
        <b style="left:calc(${(timePct * 100).toFixed(1)}% - 1px)"></b>
      </div>
      <div class="meter-legend"><span>Išnaudota ${Math.round(usedPct * 100)} % limito</span><span>▏praėjo ${Math.round(timePct * 100)} % metų</span></div>
    </div>`;
}

function renderTiles(sum: Summary | null) {
  const el = $("tiles");
  const ok = sum && sum.hasReadings && sum.leaseStarted && !sum.leaseEnded;
  const tile = (label: string, value: string, hint: string, cls = "") =>
    `<div class="card tile"><span class="label">${label}</span><span class="value ${cls}">${value}</span><span class="hint">${hint}</span></div>`;
  if (!ok) {
    el.innerHTML = [
      tile("Liko šiems lizingo metams", "—", ""),
      tile("Nuvažiuota šiais metais", "—", ""),
      tile("Rezervas pagal tolygų tempą", "—", ""),
      tile("Vidutiniškai per dieną", "—", ""),
    ].join("");
    return;
  }
  el.innerHTML = [
    tile(
      "Liko šiems lizingo metams",
      km(sum.remainingYear),
      `iki ${fmtDate(sum.year.end - 1)} · ${sum.daysLeftYear} ${dayWord(sum.daysLeftYear)}`,
      sum.remainingYear < 0 ? "delta-bad" : "",
    ),
    tile("Nuvažiuota šiais metais", km(sum.drivenThisYear), `${sum.year.index + 1}-ieji lizingo metai nuo ${fmtShortDate(sum.year.start)}`),
    tile(
      "Rezervas pagal tolygų tempą",
      signedKm(sum.paceDelta),
      `leistina rida dabar: ${km(sum.paceAllowance)}`,
      sum.paceDelta >= 0 ? "delta-good" : "delta-bad",
    ),
    tile(
      "Vidutiniškai per dieną",
      sum.avgDaily === null ? "—" : km(sum.avgDaily),
      `limitas leidžia ≈ ${km(state.settings.annualLimit / 365)}/d.`,
    ),
  ].join("");
}

function renderYearTabs(current: number) {
  const tabs = $("year-tabs");
  const n = state.settings.termYears;
  tabs.hidden = n <= 1;
  tabs.innerHTML = Array.from(
    { length: n },
    (_, i) =>
      `<button type="button" role="tab" data-year="${i}" aria-selected="${i === current}">${i + 1} metai</button>`,
  ).join("");
}

function renderCharts(sum: Summary | null) {
  const lineHost = $("line-chart");
  const barHost = $("bar-chart");
  const s = state.settings;
  if (!sum || !sum.leaseStarted) {
    const msg = `<div class="chart-empty">Grafikai atsiras įvedus nustatymus ir ridą</div>`;
    lineHost.innerHTML = msg;
    barHost.innerHTML = msg;
    $("line-legend").innerHTML = "";
    $("bar-legend").innerHTML = "";
    $("year-tabs").hidden = true;
    return;
  }

  const k = Math.min(selectedYear ?? sum.year.index, s.termYears - 1);
  renderYearTabs(k);
  const y = leaseYear(s, k);
  const pts = buildPoints(s, state.readings);
  const lastDay = pts[pts.length - 1]!.day;

  // --- odometer vs allowance ---
  const allowed: XY[] = [
    { x: y.start, y: allowanceAt(s, y.start) },
    { x: y.end, y: allowanceAt(s, y.end) },
  ];
  const actual: XY[] = [];
  const startOdo = odometerAt(pts, y.start);
  if (startOdo !== null && lastDay > y.start) {
    actual.push({ x: y.start, y: startOdo });
    for (const p of pts) if (p.day > y.start && p.day <= y.end) actual.push({ x: p.day, y: p.odo });
  }
  const series: LineSeries[] = [{ label: "Leistina rida", color: COLOR_PLAN, points: allowed, endLabel: true }];
  if (actual.length > 1) series.push({ label: "Faktinė rida", color: COLOR_ACTUAL, points: actual, endLabel: true });
  const showProjection =
    k === sum.year.index && sum.projectedYearEnd !== null && lastDay < y.end && actual.length > 1;
  if (showProjection) {
    series.push({
      label: "Prognozė",
      color: COLOR_ACTUAL,
      dashed: true,
      points: [
        { x: lastDay, y: sum.currentOdo },
        { x: y.end, y: sum.projectedYearEnd! },
      ],
    });
  }

  $("line-legend").innerHTML = [
    `<span><i style="background:${COLOR_PLAN}"></i>Leistina rida (tolygus tempas)</span>`,
    actual.length > 1 ? `<span><i style="background:${COLOR_ACTUAL}"></i>Faktinė rida</span>` : "",
    showProjection ? `<span><i class="dashed"></i>Prognozė pagal vidutinį tempą</span>` : "",
  ].join("");

  const narrow = lineHost.clientWidth < 560;
  const xTicks: { x: number; label: string }[] = [];
  let i = 0;
  for (let mb = monthBounds(y.start); mb.start < y.end; mb = monthBounds(mb.end), i++) {
    if (mb.start < y.start || (narrow && i % 2)) continue;
    xTicks.push({ x: mb.start, label: MONTH_SHORT[parts(mb.start).m]! });
  }

  lineChart(lineHost, {
    xMin: y.start,
    xMax: y.end,
    series,
    marker: { x: sum.today, label: "Šiandien" },
    xTicks,
    fmtX: fmtDate,
    fmtY: num,
  });

  // --- monthly bars ---
  const bars = monthlyBars(s, state.readings, k);
  const currentMonth = monthBounds(sum.today).start;
  $("bar-legend").innerHTML = `
    <span><i class="box" style="background:${COLOR_PLAN}"></i>Planas</span>
    <span><i class="box" style="background:${COLOR_ACTUAL}"></i>Faktas</span>`;
  barChart(barHost, {
    series: [
      { label: "Planas", color: COLOR_PLAN },
      { label: "Faktas", color: COLOR_ACTUAL },
    ],
    fmtY: num,
    groups: bars.map((b) => {
      const { y: yr, m } = parts(b.start);
      const extra =
        b.actual === null
          ? []
          : [
              { label: "Skirtumas", value: signedKm(b.actual - b.budget) },
              ...(b.partial ? [{ label: "Duomenys iki", value: fmtShortDate(lastDay) }] : []),
            ];
      return {
        label: MONTH_SHORT[m]!,
        title: `${yr} m. ${MONTH_NOM[m]}`,
        values: [b.budget, b.actual],
        highlight: b.start === currentMonth,
        extraRows: extra,
      };
    }),
  });
}

function renderHistory() {
  const body = $("history");
  const s = state.settings;
  const sorted = [...state.readings].sort((a, b) => b.date.localeCompare(a.date));
  const rows = sorted.map((r, i) => {
    const prev = sorted[i + 1]?.odometer ?? (isConfigured(s) ? s.startOdometer : null);
    return `<tr>
      <td>${escape(r.date)}</td>
      <td class="num">${km(r.odometer)}</td>
      <td class="num muted">${prev === null ? "" : signedKm(r.odometer - prev)}</td>
      <td class="num"><button class="btn ghost small" type="button" data-delete="${escape(r.id)}" aria-label="Ištrinti ${escape(r.date)} įrašą">✕</button></td>
    </tr>`;
  });
  if (isConfigured(s)) {
    rows.push(`<tr><td>${escape(s.leaseStart)}</td><td class="num">${km(s.startOdometer)}</td>
      <td class="num muted">pradžia</td><td></td></tr>`);
  }
  body.innerHTML = rows.length ? rows.join("") : `<tr><td colspan="4" class="muted">Įrašų dar nėra</td></tr>`;
}

/* ---------- forms & events ---------- */

function fillSettingsForm() {
  const f = $<HTMLFormElement>("settings-form");
  for (const [k, v] of Object.entries(state.settings)) {
    const input = f.elements.namedItem(k) as HTMLInputElement | null;
    if (input) input.value = k === "startOdometer" && !state.settings.leaseStart && v === 0 ? "" : String(v);
  }
}

let savedTimer: ReturnType<typeof setTimeout> | undefined;
$("settings-form").addEventListener("input", (ev) => {
  const input = ev.target as HTMLInputElement;
  const key = input.name as keyof Settings;
  if (key === "leaseStart") {
    state.settings.leaseStart = input.value;
  } else {
    const v = Number(input.value);
    if (input.value === "" || !Number.isFinite(v) || v < 0) return;
    state.settings[key] = key === "termYears" ? Math.min(Math.max(Math.round(v), 1), 10) : v;
  }
  selectedYear = null;
  save();
  render();
  const ind = $("saved-indicator");
  ind.textContent = "✓ Išsaugota naršyklėje";
  ind.style.opacity = "1";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (ind.style.opacity = "0"), 1800);
});

$("reading-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target as HTMLFormElement;
  const date = (f.elements.namedItem("date") as HTMLInputElement).value;
  const odometer = Number((f.elements.namedItem("odometer") as HTMLInputElement).value);
  const error = $("reading-error");
  const s = state.settings;
  const fail = (msg: string) => {
    error.textContent = msg;
  };

  if (!isConfigured(s)) return fail("Pirmiausia užpildykite lizingo nustatymus.");
  if (!date || !Number.isFinite(odometer)) return fail("Įveskite datą ir ridą.");
  if (date > todayISO()) return fail("Data negali būti ateityje.");
  if (date <= s.leaseStart) return fail(`Data turi būti vėlesnė nei lizingo pradžia (${s.leaseStart}).`);
  if (odometer < s.startOdometer) return fail(`Rida negali būti mažesnė nei pradinė (${km(s.startOdometer)}).`);
  const others = state.readings.filter((r) => r.date !== date);
  const before = others.filter((r) => r.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const after = others.filter((r) => r.date > date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (before && odometer < before.odometer) return fail(`${before.date} buvo įvesta didesnė rida (${km(before.odometer)}).`);
  if (after && odometer > after.odometer) return fail(`${after.date} buvo įvesta mažesnė rida (${km(after.odometer)}).`);

  error.textContent = "";
  state.readings = [...others, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date, odometer }];
  save();
  (f.elements.namedItem("odometer") as HTMLInputElement).value = "";
  render();
});

$("history").addEventListener("click", (ev) => {
  const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-delete]")?.dataset.delete;
  if (!id) return;
  state.readings = state.readings.filter((r) => r.id !== id);
  save();
  render();
});

$("year-tabs").addEventListener("click", (ev) => {
  const year = (ev.target as HTMLElement).closest<HTMLElement>("[data-year]")?.dataset.year;
  if (year === undefined) return;
  selectedYear = Number(year);
  render();
});

let resetArmed: ReturnType<typeof setTimeout> | undefined;
$("reset").addEventListener("click", (ev) => {
  const btn = ev.currentTarget as HTMLButtonElement;
  if (!resetArmed) {
    btn.textContent = "Tikrai ištrinti? Spauskite dar kartą";
    resetArmed = setTimeout(() => {
      btn.textContent = "Ištrinti visus duomenis";
      resetArmed = undefined;
    }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = undefined;
  btn.textContent = "Ištrinti visus duomenis";
  state.settings = { ...DEFAULTS };
  state.readings = [];
  selectedYear = null;
  save();
  fillSettingsForm();
  onboard();
});

/* ---------- theme ---------- */

function effectiveTheme(): "light" | "dark" {
  return state.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function applyTheme() {
  if (state.theme) document.documentElement.dataset.theme = state.theme;
  const btn = $("theme-toggle");
  btn.textContent = effectiveTheme() === "dark" ? "☀" : "☾";
}
$("theme-toggle").addEventListener("click", () => {
  state.theme = effectiveTheme() === "dark" ? "light" : "dark";
  save();
  applyTheme();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

/* ---------- onboarding ---------- */

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function onboard() {
  const html = document.documentElement;
  html.classList.add("needs-onboarding");
  scrollTo(0, 0);
  const result = await runOnboarding(state.settings);
  state.settings = result.settings;
  state.readings =
    result.currentOdometer === null ? [] : [{ id: newId(), date: todayISO(), odometer: result.currentOdometer }];
  selectedYear = null;
  save();
  fillSettingsForm();
  html.classList.remove("needs-onboarding");
  render();
  reveal();
}

/** Staggered entrance of the dashboard right after onboarding. */
function reveal() {
  if (prefersReducedMotion()) return;
  const html = document.documentElement;
  [document.querySelector(".topbar")!, ...$("main-grid").children].forEach((el, i) =>
    (el as HTMLElement).style.setProperty("--i", String(i)),
  );
  html.classList.add("revealing");
  setTimeout(() => html.classList.remove("revealing"), 1600);

  const heroNum = document.querySelector<HTMLElement>(".hero-num");
  if (heroNum) {
    const sum = summarize(state.settings, state.readings);
    heroNum.textContent = "0";
    setTimeout(() => countUp(heroNum, sum.monthRemaining, 0, 1200), 250);
  }
  const ring = document.querySelector<SVGCircleElement>(".ring .value");
  if (ring) {
    const target = ring.getAttribute("stroke-dasharray")!;
    ring.setAttribute("stroke-dasharray", `0 ${target.split(" ")[1]}`);
    setTimeout(() => ring.setAttribute("stroke-dasharray", target), 300);
  }
}

/* ---------- boot ---------- */

let resizeFrame = 0;
let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(render);
});

const readingDate = $("reading-form").querySelector<HTMLInputElement>('[name="date"]')!;
readingDate.value = readingDate.max = todayISO();
fillSettingsForm();
applyTheme();
if (isConfigured(state.settings)) render();
else onboard();
