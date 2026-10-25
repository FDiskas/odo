// First-visit wizard: introduces the site, asks for the essential lease data
// and previews the result before handing over to the dashboard.

import { summarize, todayISO, type Settings } from "./calc";
import { countUp, km, MONTH_ACC, num, parts, prefersReducedMotion, yearWord } from "./format";

export interface OnboardingResult {
  settings: Settings;
  /** Odometer reading for today, or null if the user chose to enter it later. */
  currentOdometer: number | null;
}

interface Step {
  id: string;
  /** Returns an error message, or null when the step's input is valid. */
  validate?: () => string | null;
  /** Skipped steps are jumped over in both directions. */
  skip?: () => boolean;
  nextLabel: string;
  onEnter?: () => void;
  onLeave?: () => void;
}

const ICONS = {
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  trend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
};

const CAR = `
<svg class="ob-car" viewBox="0 0 124 52" aria-hidden="true">
  <defs>
    <linearGradient id="ob-car-body" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#3987e5"/><stop offset="1" stop-color="#6250d6"/>
    </linearGradient>
  </defs>
  <ellipse cx="62" cy="47" rx="52" ry="3" fill="currentColor" opacity="0.12"/>
  <path fill="url(#ob-car-body)" d="M8 36 L11 26 Q13 21 20 20 L40 19 L52 9 Q55 6 61 6 L83 6 Q89 6 93 10 L103 19 Q113 20 116 27 L117 36 Q117 39 114 39 L11 39 Q8 39 8 36 Z"/>
  <path fill="#fff" opacity="0.85" d="M46 19 L55 11 Q57 9.5 60 9.5 L72 9.5 L72 19 Z M76 9.5 L85 9.5 Q88.5 9.5 91 12.5 L97 19 L76 19 Z"/>
  <rect x="108" y="25" width="7" height="3" rx="1.5" fill="#fab219"/>
  <g class="ob-wheel" style="transform-origin:32px 39px">
    <circle cx="32" cy="39" r="9" fill="#1a1a19"/><circle cx="32" cy="39" r="4" fill="#c3c2b7"/>
    <path d="M32 31v16M24 39h16" stroke="#52514e" stroke-width="1.5"/>
  </g>
  <g class="ob-wheel" style="transform-origin:94px 39px">
    <circle cx="94" cy="39" r="9" fill="#1a1a19"/><circle cx="94" cy="39" r="4" fill="#c3c2b7"/>
    <path d="M94 31v16M86 39h16" stroke="#52514e" stroke-width="1.5"/>
  </g>
</svg>`;

const odometerDigits = (n: number) =>
  String(n)
    .padStart(6, "0")
    .split("")
    .map((d) => `<span class="ob-digit"><span class="ob-strip" style="transform:translateY(-${Number(d) * 10}%)">0123456789</span></span>`)
    .join("");

const chip = (value: string | number, label: string, name: string) =>
  `<button type="button" class="ob-chip" data-target="${name}" data-value="${value}" aria-pressed="false">${label}</button>`;

export function runOnboarding(initial: Settings): Promise<OnboardingResult> {
  const today = todayISO();
  const root = document.createElement("div");
  root.className = "ob";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Pradinė sąranka");
  root.innerHTML = `
    <div class="ob-bg" aria-hidden="true"><span class="ob-blob b1"></span><span class="ob-blob b2"></span><span class="ob-blob b3"></span></div>
    <div class="ob-card">
      <div class="ob-progress" aria-hidden="true"><i></i></div>
      <form class="ob-steps" novalidate autocomplete="off">

        <section class="ob-step" data-step="welcome">
          <div class="ob-scene" aria-hidden="true">
            <div class="ob-sun"></div>
            <div class="ob-hills"></div>
            ${CAR}
            <div class="ob-road"></div>
            <div class="ob-odometer"><span class="ob-odo-label">ODO</span><span class="ob-odo-digits">${odometerDigits(12480)}</span><span class="ob-odo-unit">km</span></div>
          </div>
          <h1 class="ob-title">Važiuokite drąsiai — be staigmenų lizingo pabaigoje</h1>
          <p class="ob-lead">Lizingo sutartis riboja, kiek kilometrų per metus galite nuvažiuoti. Viršijus limitą,
            grąžinant automobilį tenka primokėti už kiekvieną papildomą kilometrą.</p>
          <p class="ob-lead">Ši svetainė sukurta tam, kad tai netaptų netikėtumu: ji kas mėnesį pasako,
            <b>kiek dar galite nuvažiuoti</b>, kad tilptumėte į metinį limitą.</p>
          <ul class="ob-features">
            <li style="--d:0"><span class="ob-ico">${ICONS.calendar}</span><div><b>Mėnesio biudžetas</b><span>Kiek km liko iki mėnesio pabaigos</span></div></li>
            <li style="--d:1"><span class="ob-ico">${ICONS.trend}</span><div><b>Prognozė ir grafikai</b><span>Ar tilpsite į limitą metų gale</span></div></li>
            <li style="--d:2"><span class="ob-ico">${ICONS.lock}</span><div><b>Privatu</b><span>Duomenys lieka tik jūsų naršyklėje</span></div></li>
          </ul>
        </section>

        <section class="ob-step" data-step="limit">
          <span class="ob-eyebrow">Sutartis</span>
          <h2 class="ob-title">Koks jūsų metinis ridos limitas?</h2>
          <p class="ob-lead">Jį rasite lizingo sutartyje. Dažniausiai tai 15 000–25 000 km per metus.</p>
          <label class="ob-field"><span class="sr-only">Metinis limitas</span>
            <input name="annualLimit" type="number" inputmode="numeric" min="1000" step="500" />
            <span class="ob-suffix">km / metus</span>
          </label>
          <div class="ob-chips">${[10000, 15000, 20000, 25000, 30000].map((v) => chip(v, num(v), "annualLimit")).join("")}</div>
          <p class="ob-error" role="alert"></p>
        </section>

        <section class="ob-step" data-step="lease">
          <span class="ob-eyebrow">Sutartis</span>
          <h2 class="ob-title">Kada prasidėjo lizingas?</h2>
          <p class="ob-lead">Lizingo metai skaičiuojami nuo šios datos, o ne nuo sausio 1-osios.</p>
          <label class="ob-field"><span class="sr-only">Lizingo pradžios data</span>
            <input name="leaseStart" type="date" />
          </label>
          <p class="ob-sublabel">Sutarties trukmė</p>
          <div class="ob-chips">${[1, 2, 3, 4, 5].map((v) => chip(v, `${v} ${yearWord(v)}`, "termYears")).join("")}</div>
          <input name="termYears" type="hidden" />
          <p class="ob-error" role="alert"></p>
        </section>

        <section class="ob-step" data-step="startOdo">
          <span class="ob-eyebrow">Automobilis</span>
          <h2 class="ob-title">Kokia buvo rida perimant automobilį?</h2>
          <p class="ob-lead">Ją rasite perdavimo–priėmimo akte. Naujo automobilio rida paprastai būna 0–50 km.</p>
          <label class="ob-field"><span class="sr-only">Rida lizingo pradžioje</span>
            <input name="startOdometer" type="number" inputmode="numeric" min="0" step="1" placeholder="0" />
            <span class="ob-suffix">km</span>
          </label>
          <div class="ob-chips">${chip(0, "Naujas automobilis — 0 km", "startOdometer")}</div>
          <p class="ob-error" role="alert"></p>
        </section>

        <section class="ob-step" data-step="current">
          <span class="ob-eyebrow">Šiandien</span>
          <h2 class="ob-title">Kiek kilometrų rodo odometras dabar?</h2>
          <p class="ob-lead">Pažiūrėkite į prietaisų skydelį. Vėliau ridą galėsite atnaujinti bet kada.</p>
          <label class="ob-field"><span class="sr-only">Dabartinė rida</span>
            <input name="current" type="number" inputmode="numeric" min="0" step="1" placeholder="pvz. 23 450" />
            <span class="ob-suffix">km</span>
          </label>
          <button type="button" class="ob-link" data-skip>Įvesiu vėliau</button>
          <p class="ob-error" role="alert"></p>
        </section>

        <section class="ob-step ob-done" data-step="done">
          <svg class="ob-check" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="28" fill="none" stroke-width="4" />
            <path d="M20 33 l8 8 l16 -18" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <h2 class="ob-title">Viskas paruošta!</h2>
          <div class="ob-result"></div>
        </section>

      </form>
      <div class="ob-nav">
        <button type="button" class="ob-back">← Atgal</button>
        <span class="ob-count" aria-live="polite"></span>
        <button type="button" class="btn primary ob-next"></button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const $ = <T extends Element = HTMLInputElement>(sel: string) => root.querySelector(sel) as T;
  const input = (name: string) => $<HTMLInputElement>(`[name="${name}"]`);
  const sections = [...root.querySelectorAll<HTMLElement>(".ob-step")];
  const back = $<HTMLButtonElement>(".ob-back");
  const next = $<HTMLButtonElement>(".ob-next");
  const count = $<HTMLElement>(".ob-count");
  const bar = $<HTMLElement>(".ob-progress i");

  input("annualLimit").value = String(initial.annualLimit || 15000);
  input("leaseStart").value = initial.leaseStart;
  input("leaseStart").max = today;
  input("termYears").value = String(initial.termYears || 3);
  if (initial.leaseStart) input("startOdometer").value = String(initial.startOdometer);

  const syncChips = () => {
    for (const c of root.querySelectorAll<HTMLButtonElement>(".ob-chip")) {
      c.setAttribute("aria-pressed", String(input(c.dataset.target!).value === c.dataset.value));
    }
  };
  syncChips();

  const settings = (): Settings => ({
    annualLimit: Number(input("annualLimit").value),
    leaseStart: input("leaseStart").value,
    startOdometer: Number(input("startOdometer").value || 0),
    termYears: Number(input("termYears").value),
  });
  let skippedCurrent = false;
  const currentOdometer = () =>
    skippedCurrent || input("current").value === "" ? null : Number(input("current").value);

  // Welcome scene odometer ticks up while the step is visible.
  let odo = 12480;
  let odoTimer: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    odo += 1 + Math.floor(Math.random() * 3);
    const digits = String(odo).padStart(6, "0");
    root.querySelectorAll<HTMLElement>(".ob-strip").forEach((s, i) => {
      s.style.transform = `translateY(-${Number(digits[i]) * 10}%)`;
    });
  };

  const steps: Step[] = [
    {
      id: "welcome",
      nextLabel: "Pradėkime →",
      onEnter: () => {
        if (!prefersReducedMotion()) odoTimer = setInterval(tick, 420);
      },
      onLeave: () => clearInterval(odoTimer),
    },
    {
      id: "limit",
      nextLabel: "Toliau",
      validate: () => {
        const v = Number(input("annualLimit").value);
        return input("annualLimit").value && v >= 1000 && v <= 200000
          ? null
          : "Įveskite metinį limitą kilometrais, pvz. 15 000.";
      },
    },
    {
      id: "lease",
      nextLabel: "Toliau",
      validate: () => {
        const d = input("leaseStart").value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "Pasirinkite lizingo pradžios datą.";
        if (d > today) return "Data negali būti ateityje.";
        return null;
      },
    },
    {
      id: "startOdo",
      nextLabel: "Toliau",
      validate: () => {
        const raw = input("startOdometer").value;
        return raw === "" || Number(raw) < 0 ? "Įveskite ridą lizingo pradžioje (gali būti 0)." : null;
      },
    },
    {
      id: "current",
      nextLabel: "Skaičiuoti",
      // A reading must be dated after the lease start.
      skip: () => input("leaseStart").value >= today,
      onEnter: () => {
        skippedCurrent = false;
      },
      validate: () => {
        if (skippedCurrent) return null;
        const raw = input("current").value;
        if (raw === "") return "Įveskite ridą arba spauskite „Įvesiu vėliau“.";
        const start = settings().startOdometer;
        return Number(raw) < start ? `Rida negali būti mažesnė nei pradinė (${km(start)}).` : null;
      },
    },
    { id: "done", nextLabel: "Rodyti mano suvestinę", onEnter: () => renderResult() },
  ];

  const questions = steps.filter((s) => s.validate);

  function renderResult() {
    const s = settings();
    const cur = currentOdometer();
    const el = $<HTMLElement>(".ob-result");
    if (cur === null) {
      el.innerHTML = `<p class="ob-lead">Nustatymai išsaugoti. Įveskite dabartinę ridą suvestinėje — ir iškart
        pamatysite, kiek galite nuvažiuoti šį mėnesį.</p>`;
      return;
    }
    const sum = summarize(s, [{ id: "preview", date: today, odometer: cur }], today);
    const month = MONTH_ACC[parts(sum.today).m];
    el.innerHTML = `
      <p class="ob-lead">Šį mėnesį (${month}) dar galite nuvažiuoti</p>
      <p class="ob-big"><span class="ob-big-num">0</span><span class="unit">km</span></p>
      <p class="ob-lead small">${
        sum.remainingYear < 0
          ? `Šių lizingo metų limitas jau viršytas ${km(-sum.remainingYear)}.`
          : `≈ ${km(sum.dailyBudget)} per dieną, kad tilptumėte į ${km(s.annualLimit)} per metus.`
      }</p>`;
    countUp($<HTMLElement>(".ob-big-num"), sum.monthRemaining, 0, 1200);
  }

  let current = -1;

  function go(i: number) {
    const prev = steps[current];
    prev?.onLeave?.();
    current = i;
    const step = steps[i]!;
    sections.forEach((sec, j) => {
      sec.classList.toggle("is-active", j === i);
      sec.classList.toggle("is-past", j < i);
      sec.inert = j !== i;
    });

    const qi = questions.indexOf(step);
    count.textContent = qi >= 0 ? `${qi + 1} iš ${questions.length}` : "";
    const done = questions.filter((q) => steps.indexOf(q) < i).length;
    bar.style.width = `${(done / questions.length) * 100}%`;
    back.hidden = i === 0 || step.id === "done";
    next.textContent = step.nextLabel;
    root.dataset.step = step.id;
    step.onEnter?.();

    const field = sections[i]!.querySelector<HTMLInputElement>("input:not([type=hidden])");
    if (field) setTimeout(() => field.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 380);
    else next.focus({ preventScroll: true });
  }

  function move(dir: 1 | -1) {
    let i = current + dir;
    while (steps[i]?.skip?.()) i += dir;
    if (i >= 0 && i < steps.length) go(i);
  }

  return new Promise((resolve) => {
    function advance() {
      const step = steps[current]!;
      const error = sections[current]!.querySelector<HTMLElement>(".ob-error");
      const msg = step.validate?.() ?? null;
      if (msg) {
        if (error) error.textContent = msg;
        const card = $<HTMLElement>(".ob-card");
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
        return;
      }
      if (error) error.textContent = "";
      if (step.id !== "done") return move(1);

      root.classList.add("is-leaving");
      const finish = () => {
        root.remove();
        resolve({ settings: settings(), currentOdometer: currentOdometer() });
      };
      if (prefersReducedMotion()) finish();
      else setTimeout(finish, 550);
    }

    next.addEventListener("click", advance);
    back.addEventListener("click", () => move(-1));
    $(".ob-steps").addEventListener("submit", (ev) => {
      ev.preventDefault();
      advance();
    });
    root.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.target as HTMLElement).tagName === "INPUT") {
        ev.preventDefault();
        advance();
      }
    });
    root.addEventListener("input", (ev) => {
      syncChips();
      const err = (ev.target as HTMLElement).closest(".ob-step")?.querySelector(".ob-error");
      if (err) err.textContent = "";
    });
    root.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      const c = target.closest<HTMLButtonElement>(".ob-chip");
      if (c) {
        input(c.dataset.target!).value = c.dataset.value!;
        syncChips();
        const err = c.closest(".ob-step")?.querySelector(".ob-error");
        if (err) err.textContent = "";
      }
      if (target.closest("[data-skip]")) {
        skippedCurrent = true;
        input("current").value = "";
        advance();
      }
    });

    go(0);
  });
}
