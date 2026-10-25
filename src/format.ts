// Lithuanian number, date and plural formatting shared by the UI modules.

import { fromDay } from "./calc";

export const MONTH_SHORT = ["Sau", "Vas", "Kov", "Bal", "Geg", "Bir", "Lie", "Rgp", "Rgs", "Spa", "Lap", "Grd"];
export const MONTH_NOM = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];
export const MONTH_ACC = ["sausį", "vasarį", "kovą", "balandį", "gegužę", "birželį", "liepą", "rugpjūtį", "rugsėjį", "spalį", "lapkritį", "gruodį"];
export const MONTH_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];

const nf = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 0 });
export const num = (n: number) => nf.format(Math.round(n));
export const km = (n: number) => `${num(n)} km`;
export const signedKm = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${km(Math.abs(n))}`;

export const parts = (day: number) => {
  const [y, m, d] = fromDay(day).split("-").map(Number);
  return { y: y!, m: m! - 1, d: d! };
};
export const fmtDate = (day: number) => {
  const { y, m, d } = parts(day);
  return `${y} m. ${MONTH_GEN[m]} ${d} d.`;
};
export const fmtShortDate = (day: number) => {
  const { m, d } = parts(day);
  return `${MONTH_GEN[m]} ${d} d.`;
};

export function dayWord(n: number) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "diena";
  if (n10 >= 2 && !(n100 >= 11 && n100 <= 19)) return "dienos";
  return "dienų";
}

export function yearWord(n: number) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "metai";
  if (n10 === 0 || (n100 >= 11 && n100 <= 19)) return "metų";
  return "metai";
}

export const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animates the number inside `el` from `from` to `to`. */
export function countUp(el: HTMLElement, to: number, from = 0, ms = 900) {
  if (prefersReducedMotion()) {
    el.textContent = num(to);
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    const p = Math.min((t - t0) / ms, 1);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = num(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
