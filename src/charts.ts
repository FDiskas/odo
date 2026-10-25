// Small dependency-free SVG charts with hover tooltips.

const SVG_NS = "http://www.w3.org/2000/svg";

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

/* ---------- tooltip ---------- */

const tooltip = () => document.getElementById("tooltip")!;

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function showTooltip(title: string, rows: TooltipRow[], x: number, y: number) {
  const el = tooltip();
  el.innerHTML =
    `<div class="t-title">${title}</div>` +
    rows
      .map(
        (r) =>
          `<div class="t-row"><span>${r.color ? `<i style="background:${r.color}"></i>` : ""}${r.label}</span><b>${r.value}</b></div>`,
      )
      .join("");
  el.hidden = false;
  const { width, height } = el.getBoundingClientRect();
  const left = x + 16 + width > window.innerWidth ? x - width - 16 : x + 16;
  const top = Math.min(Math.max(y - height / 2, 8), window.innerHeight - height - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function hideTooltip() {
  tooltip().hidden = true;
}

/* ---------- line chart ---------- */

export interface XY {
  x: number;
  y: number;
}

export interface LineSeries {
  label: string;
  color: string;
  points: XY[];
  dashed?: boolean;
  /** Label the last point with its value. */
  endLabel?: boolean;
}

export interface LineChartOptions {
  xMin: number;
  xMax: number;
  series: LineSeries[];
  marker?: { x: number; label: string };
  xTicks: { x: number; label: string }[];
  fmtX: (x: number) => string;
  fmtY: (y: number) => string;
  height?: number;
}

function interpolate(points: XY[], x: number): number | null {
  if (points.length === 0 || x < points[0]!.x || x > points[points.length - 1]!.x) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return points[0]!.y;
}

export function lineChart(host: HTMLElement, o: LineChartOptions) {
  host.replaceChildren();
  const W = Math.max(host.clientWidth, 320);
  const H = o.height ?? 300;
  const m = { top: 16, right: 64, bottom: 28, left: 60 };
  const ys = o.series.flatMap((s) => s.points.map((p) => p.y));
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const sx = (x: number) => m.left + ((x - o.xMin) / (o.xMax - o.xMin)) * (W - m.left - m.right);
  const sy = (y: number) => m.top + (1 - (y - yMin) / (yMax - yMin)) * (H - m.top - m.bottom);

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img" }, host);

  for (const t of ticks) {
    svg("line", { class: t === yMin ? "baseline" : "gridline", x1: m.left, x2: W - m.right, y1: sy(t), y2: sy(t) }, root);
    svg("text", { x: m.left - 8, y: sy(t) + 4, "text-anchor": "end" }, root).textContent = o.fmtY(t);
  }
  for (const t of o.xTicks) {
    svg("text", { x: sx(t.x), y: H - 8, "text-anchor": "middle" }, root).textContent = t.label;
  }

  if (o.marker && o.marker.x >= o.xMin && o.marker.x <= o.xMax) {
    const x = sx(o.marker.x);
    svg("line", { class: "today-line", x1: x, x2: x, y1: m.top, y2: H - m.bottom }, root);
    svg("text", { class: "today-label", x, y: m.top - 4, "text-anchor": "middle" }, root).textContent = o.marker.label;
  }

  for (const s of o.series) {
    if (s.points.length < 2) continue;
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
    svg(
      "path",
      {
        d,
        fill: "none",
        stroke: s.color,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        ...(s.dashed ? { "stroke-dasharray": "5 5" } : {}),
      },
      root,
    );
  }

  // End markers and labels on top of all lines; labels are nudged apart
  // vertically so ends that land close together stay readable.
  const ends = o.series
    .filter((s) => s.endLabel && s.points.length > 0)
    .map((s) => {
      const p = s.points[s.points.length - 1]!;
      return { s, p, x: sx(p.x), y: sy(p.y), ly: sy(p.y) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    const prev = ends[i - 1]!;
    const cur = ends[i]!;
    if (Math.abs(cur.x - prev.x) < 80 && cur.ly - prev.ly < 15) {
      const mid = (cur.ly + prev.ly) / 2;
      prev.ly = mid - 7.5;
      cur.ly = mid + 7.5;
    }
  }
  for (const e of ends) {
    svg("circle", { cx: e.x, cy: e.y, r: 4.5, fill: e.s.color, stroke: "var(--surface)", "stroke-width": 2 }, root);
    svg("text", { class: "end-label", x: e.x + 9, y: e.ly + 4 }, root).textContent = o.fmtY(e.p.y);
  }

  // Hover layer: crosshair + one dot per series + tooltip.
  const hover = svg("g", { visibility: "hidden" }, root);
  const cross = svg("line", { class: "crosshair", y1: m.top, y2: H - m.bottom }, hover);
  const dots = o.series.map((s) =>
    svg("circle", { r: 4.5, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }, hover),
  );
  const hit = svg("rect", { x: m.left, y: 0, width: W - m.left - m.right, height: H, fill: "transparent" }, root);

  const move = (ev: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const x = Math.round(o.xMin + ((px - m.left) / (W - m.left - m.right)) * (o.xMax - o.xMin));
    const cx = sx(x);
    cross.setAttribute("x1", String(cx));
    cross.setAttribute("x2", String(cx));
    const rows: TooltipRow[] = [];
    o.series.forEach((s, i) => {
      const y = interpolate(s.points, x);
      const dot = dots[i]!;
      if (y === null) {
        dot.setAttribute("visibility", "hidden");
        return;
      }
      dot.setAttribute("visibility", "visible");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(sy(y)));
      rows.push({ label: s.label, value: o.fmtY(y), color: s.color });
    });
    hover.setAttribute("visibility", "visible");
    showTooltip(o.fmtX(x), rows, ev.clientX, ev.clientY);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => {
    hover.setAttribute("visibility", "hidden");
    hideTooltip();
  });
}

/* ---------- grouped bar chart ---------- */

export interface BarGroup {
  label: string;
  title: string;
  values: (number | null)[];
  highlight?: boolean;
  extraRows?: TooltipRow[];
}

export interface BarChartOptions {
  groups: BarGroup[];
  series: { label: string; color: string }[];
  fmtY: (y: number) => string;
  height?: number;
}

/** Column with 4px rounded data-end, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function barChart(host: HTMLElement, o: BarChartOptions) {
  host.replaceChildren();
  const W = Math.max(host.clientWidth, 320);
  const H = o.height ?? 280;
  const m = { top: 20, right: 12, bottom: 28, left: 52 };
  const all = o.groups.flatMap((g) => g.values.filter((v): v is number => v !== null));
  const ticks = niceTicks(0, Math.max(...all, 1));
  const yMax = ticks[ticks.length - 1]!;
  const plotW = W - m.left - m.right;
  const band = plotW / o.groups.length;
  const n = o.series.length;
  const gap = 2;
  const barW = Math.min(24, (band * 0.7 - gap * (n - 1)) / n);
  const sy = (y: number) => m.top + (1 - y / yMax) * (H - m.top - m.bottom);
  const base = sy(0);

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img" }, host);
  for (const t of ticks) {
    svg("line", { class: t === 0 ? "baseline" : "gridline", x1: m.left, x2: W - m.right, y1: sy(t), y2: sy(t) }, root);
    svg("text", { x: m.left - 8, y: sy(t) + 4, "text-anchor": "end" }, root).textContent = o.fmtY(t);
  }

  const showLabels = band > 34;
  o.groups.forEach((g, gi) => {
    const x0 = m.left + gi * band;
    const cx = x0 + band / 2;
    const groupW = n * barW + (n - 1) * gap;
    const hoverBand = svg("rect", { class: "hover-band", x: x0 + 2, y: m.top, width: band - 4, height: base - m.top, rx: 6, visibility: "hidden" }, root);

    g.values.forEach((v, si) => {
      if (v === null || v <= 0) return;
      const x = cx - groupW / 2 + si * (barW + gap);
      svg("path", { d: columnPath(x, sy(v), barW, base - sy(v)), fill: o.series[si]!.color }, root);
    });

    if (showLabels || gi % 2 === 0) {
      svg("text", { x: cx, y: H - 8, "text-anchor": "middle", ...(g.highlight ? { class: "today-label" } : {}) }, root).textContent = g.label;
    }
    if (g.highlight) {
      const top = Math.min(...g.values.map((v) => (v === null ? base : sy(Math.max(v, 0)))));
      const last = g.values[g.values.length - 1];
      if (last !== null && last !== undefined) {
        svg("text", { class: "end-label", x: cx, y: top - 6, "text-anchor": "middle" }, root).textContent = o.fmtY(last);
      }
    }

    const hit = svg("rect", { x: x0, y: m.top, width: band, height: H - m.top, fill: "transparent" }, root);
    const move = (ev: PointerEvent) => {
      hoverBand.setAttribute("visibility", "visible");
      const rows: TooltipRow[] = o.series.map((s, si) => ({
        label: s.label,
        value: g.values[si] === null ? "—" : o.fmtY(g.values[si]!),
        color: s.color,
      }));
      showTooltip(g.title, [...rows, ...(g.extraRows ?? [])], ev.clientX, ev.clientY);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => {
      hoverBand.setAttribute("visibility", "hidden");
      hideTooltip();
    });
  });
}
