import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";

export type CanvasKind = "text" | "note" | "group" | "image" | "link";
export type CanvasSide = "top" | "right" | "bottom" | "left";

export const CANVAS_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "", label: "Default", hex: "" },
  { id: "1", label: "Red", hex: "#fb464c" },
  { id: "2", label: "Orange", hex: "#e9973f" },
  { id: "3", label: "Yellow", hex: "#e0de71" },
  { id: "4", label: "Green", hex: "#44cf6e" },
  { id: "5", label: "Cyan", hex: "#53dfdd" },
  { id: "6", label: "Purple", hex: "#a882ff" },
];

export function canvasColorHex(id?: string): string {
  return CANVAS_COLORS.find((c) => c.id === id)?.hex || "";
}

export type CanvasCard = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: CanvasKind;
  text?: string;
  notePath?: string;
  url?: string;
  imageSrc?: string;
  color?: string;
  locked?: boolean;
  z?: number;
};

export type CanvasEdge = {
  id: string;
  from: string;
  to: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  label?: string;
  color?: string;
};

export type CanvasCam = { x: number; y: number; k: number };

export type CanvasDoc = {
  cards: CanvasCard[];
  edges: CanvasEdge[];
  cam: CanvasCam;
  snap?: boolean;
};

const EMPTY: CanvasDoc = { cards: [], edges: [], cam: { x: 40, y: 40, k: 1 }, snap: true };
const FENCE_RE = /````canvas\r?\n([\s\S]*?)\r?\n````/;
const GRID = 24;

export function isCanvasNote(md: string): boolean {
  const { yaml } = splitFrontmatter(md);
  if (yaml) {
    const fields = parseFrontmatterFields(yaml);
    if (fields.some((f) => f.key === "type" && /^["']?canvas["']?$/i.test(f.value.trim()))) {
      return true;
    }
  }
  return FENCE_RE.test(md);
}

export function newCardId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function snapToGrid(n: number, on = true): number {
  if (!on) return n;
  return Math.round(n / GRID) * GRID;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asSide(v: unknown): CanvasSide | undefined {
  return v === "top" || v === "right" || v === "bottom" || v === "left" ? v : undefined;
}

function asKind(v: unknown): CanvasKind {
  if (v === "note" || v === "group" || v === "image" || v === "link") return v;
  return "text";
}

export function normalizeCanvasDoc(raw: unknown): CanvasDoc {
  if (!raw || typeof raw !== "object") return { ...EMPTY, cards: [], edges: [] };
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.nodes)) return fromObsidianCanvas(raw);
  const camIn = (obj.cam && typeof obj.cam === "object" ? obj.cam : {}) as Record<string, unknown>;
  const cards: CanvasCard[] = [];
  for (const item of Array.isArray(obj.cards) ? obj.cards : []) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    cards.push({
      id: typeof c.id === "string" && c.id ? c.id : newCardId(),
      x: asNumber(c.x, 80),
      y: asNumber(c.y, 80),
      w: asNumber(c.w, 220),
      h: asNumber(c.h, 120),
      kind: asKind(c.kind),
      text: typeof c.text === "string" ? c.text : "",
      notePath: typeof c.notePath === "string" ? c.notePath : "",
      url: typeof c.url === "string" ? c.url : "",
      imageSrc: typeof c.imageSrc === "string" ? c.imageSrc : "",
      color: typeof c.color === "string" ? c.color : "",
      locked: c.locked === true,
      z: asNumber(c.z, 0),
    });
  }
  const edges: CanvasEdge[] = [];
  for (const item of Array.isArray(obj.edges) ? obj.edges : []) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const from = typeof e.from === "string" ? e.from : "";
    const to = typeof e.to === "string" ? e.to : "";
    if (!from || !to || from === to) continue;
    edges.push({
      id: typeof e.id === "string" && e.id ? e.id : newCardId(),
      from,
      to,
      fromSide: asSide(e.fromSide),
      toSide: asSide(e.toSide),
      label: typeof e.label === "string" ? e.label : "",
      color: typeof e.color === "string" ? e.color : "",
    });
  }
  const ids = new Set(cards.map((c) => c.id));
  return {
    cards,
    edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    snap: obj.snap !== false,
    cam: {
      x: asNumber(camIn.x, EMPTY.cam.x),
      y: asNumber(camIn.y, EMPTY.cam.y),
      k: Math.min(3.2, Math.max(0.18, asNumber(camIn.k, 1))),
    },
  };
}

export function parseCanvasDoc(md: string): CanvasDoc {
  const m = md.match(FENCE_RE);
  if (!m) return { ...EMPTY, cards: [], edges: [] };
  try {
    return normalizeCanvasDoc(JSON.parse(m[1] ?? "{}"));
  } catch {
    return { ...EMPTY, cards: [], edges: [] };
  }
}

function slimCard(c: CanvasCard): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: c.id,
    x: Math.round(c.x),
    y: Math.round(c.y),
    w: Math.round(c.w),
    h: Math.round(c.h),
    kind: c.kind,
  };
  if (c.color) out.color = c.color;
  if (c.locked) out.locked = true;
  if (c.z) out.z = c.z;
  if (c.kind === "note") out.notePath = c.notePath || "";
  else if (c.kind === "image") out.imageSrc = c.imageSrc || "";
  else if (c.kind === "link") out.url = c.url || "";
  else out.text = c.text || "";
  return out;
}

export function writeCanvasDoc(md: string, doc: CanvasDoc): string {
  const payload = JSON.stringify({
    cam: doc.cam,
    snap: doc.snap !== false,
    cards: doc.cards.map(slimCard),
    edges: doc.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(e.fromSide ? { fromSide: e.fromSide } : {}),
      ...(e.toSide ? { toSide: e.toSide } : {}),
      ...(e.label ? { label: e.label } : {}),
      ...(e.color ? { color: e.color } : {}),
    })),
  });
  const fence = "````canvas\n" + payload + "\n````";
  if (FENCE_RE.test(md)) return md.replace(FENCE_RE, fence);
  return `${(md || "").replace(/\s+$/, "")}\n\n${fence}\n`;
}

export function emptyCanvasTemplate(title: string): string {
  const a = newCardId();
  const b = newCardId();
  const g = newCardId();
  const starter: CanvasDoc = {
    cam: { x: 36, y: 28, k: 1 },
    snap: true,
    cards: [
      { id: g, x: 12, y: 8, w: 560, h: 280, kind: "group", text: title, color: "6" },
      {
        id: a,
        x: 36,
        y: 48,
        w: 240,
        h: 140,
        kind: "text",
        color: "5",
        text: `${title}\n\nDrag a card. Hover a side to connect.`,
      },
      {
        id: b,
        x: 320,
        y: 56,
        w: 220,
        h: 120,
        kind: "text",
        color: "4",
        text: "Click a line to label, reverse, or recolor it. Shift-click selects many.",
      },
    ],
    edges: [
      { id: newCardId(), from: a, to: b, fromSide: "right", toSide: "left", label: "next", color: "5" },
    ],
  };
  return ["---", "type: canvas", "---", "", `# ${title}`, "", writeCanvasDoc("", starter).trim(), ""].join("\n");
}

/** Import Obsidian `.canvas` JSON (nodes/edges). */
export function fromObsidianCanvas(raw: unknown): CanvasDoc {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cards: CanvasCard[] = [];
  for (const item of Array.isArray(obj.nodes) ? obj.nodes : []) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const type = String(n.type || "text");
    const kind: CanvasKind =
      type === "file" ? "note" : type === "group" ? "group" : type === "link" ? "link" : "text";
    cards.push({
      id: typeof n.id === "string" && n.id ? n.id : newCardId(),
      x: asNumber(n.x, 80),
      y: asNumber(n.y, 80),
      w: asNumber(n.width, 250),
      h: asNumber(n.height, 150),
      kind,
      text: typeof n.text === "string" ? n.text : typeof n.label === "string" ? n.label : "",
      notePath: typeof n.file === "string" ? n.file : "",
      url: typeof n.url === "string" ? n.url : "",
      color: typeof n.color === "string" ? n.color : "",
    });
  }
  const edges: CanvasEdge[] = [];
  for (const item of Array.isArray(obj.edges) ? obj.edges : []) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const from = typeof e.fromNode === "string" ? e.fromNode : "";
    const to = typeof e.toNode === "string" ? e.toNode : "";
    if (!from || !to) continue;
    edges.push({
      id: typeof e.id === "string" && e.id ? e.id : newCardId(),
      from,
      to,
      fromSide: asSide(e.fromSide),
      toSide: asSide(e.toSide),
      label: typeof e.label === "string" ? e.label : "",
      color: typeof e.color === "string" ? e.color : "",
    });
  }
  return { cards, edges, cam: { ...EMPTY.cam }, snap: true };
}

export function toObsidianCanvas(doc: CanvasDoc): {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
} {
  return {
    nodes: doc.cards.map((c) => {
      const base = {
        id: c.id,
        x: Math.round(c.x),
        y: Math.round(c.y),
        width: Math.round(c.w),
        height: Math.round(c.h),
        ...(c.color ? { color: c.color } : {}),
      };
      if (c.kind === "note") return { ...base, type: "file", file: c.notePath || "" };
      if (c.kind === "group") return { ...base, type: "group", label: c.text || "" };
      if (c.kind === "link") return { ...base, type: "link", url: c.url || "" };
      return { ...base, type: "text", text: c.text || "" };
    }),
    edges: doc.edges.map((e) => ({
      id: e.id,
      fromNode: e.from,
      toNode: e.to,
      fromSide: e.fromSide || "right",
      toSide: e.toSide || "left",
      ...(e.label ? { label: e.label } : {}),
      ...(e.color ? { color: e.color } : {}),
    })),
  };
}

export function cardAnchor(card: CanvasCard, side: CanvasSide = "right"): { x: number; y: number } {
  if (side === "left") return { x: card.x, y: card.y + card.h / 2 };
  if (side === "top") return { x: card.x + card.w / 2, y: card.y };
  if (side === "bottom") return { x: card.x + card.w / 2, y: card.y + card.h };
  return { x: card.x + card.w, y: card.y + card.h / 2 };
}

export function alignCards(
  cards: CanvasCard[],
  ids: string[],
  how: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter",
): CanvasCard[] {
  const sel = cards.filter((c) => ids.includes(c.id) && c.kind !== "group" && !c.locked);
  if (sel.length < 2) return cards;
  const minX = Math.min(...sel.map((c) => c.x));
  const maxX = Math.max(...sel.map((c) => c.x + c.w));
  const minY = Math.min(...sel.map((c) => c.y));
  const maxY = Math.max(...sel.map((c) => c.y + c.h));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return cards.map((c) => {
    if (!ids.includes(c.id) || c.kind === "group" || c.locked) return c;
    if (how === "left") return { ...c, x: minX };
    if (how === "right") return { ...c, x: maxX - c.w };
    if (how === "top") return { ...c, y: minY };
    if (how === "bottom") return { ...c, y: maxY - c.h };
    if (how === "hcenter") return { ...c, x: midX - c.w / 2 };
    return { ...c, y: midY - c.h / 2 };
  });
}

export function distributeCards(
  cards: CanvasCard[],
  ids: string[],
  axis: "h" | "v",
): CanvasCard[] {
  const sel = cards
    .filter((c) => ids.includes(c.id) && c.kind !== "group" && !c.locked)
    .slice()
    .sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
  if (sel.length < 3) return cards;
  const first = sel[0]!;
  const last = sel[sel.length - 1]!;
  if (axis === "h") {
    const span = last.x - first.x;
    const step = span / (sel.length - 1);
    return cards.map((c) => {
      const i = sel.findIndex((s) => s.id === c.id);
      if (i < 0) return c;
      return { ...c, x: first.x + step * i };
    });
  }
  const span = last.y - first.y;
  const step = span / (sel.length - 1);
  return cards.map((c) => {
    const i = sel.findIndex((s) => s.id === c.id);
    if (i < 0) return c;
    return { ...c, y: first.y + step * i };
  });
}

export function cardContains(outer: CanvasCard, inner: CanvasCard): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

export function idsMovedWith(card: CanvasCard, cards: CanvasCard[], selected: string[]): string[] {
  const base = selected.includes(card.id) ? selected : [card.id];
  const extra = new Set(base);
  for (const id of base) {
    const g = cards.find((c) => c.id === id);
    if (!g || g.kind !== "group") continue;
    for (const c of cards) {
      if (c.id === g.id || c.locked) continue;
      if (cardContains(g, c)) extra.add(c.id);
    }
  }
  return [...extra];
}

export function nearestSide(card: CanvasCard, x: number, y: number): CanvasSide {
  const d = {
    left: Math.abs(x - card.x),
    right: Math.abs(x - (card.x + card.w)),
    top: Math.abs(y - card.y),
    bottom: Math.abs(y - (card.y + card.h)),
  };
  return (Object.entries(d).sort((a, b) => a[1] - b[1])[0]?.[0] as CanvasSide) || "left";
}

export function cardAtPoint(cards: CanvasCard[], x: number, y: number): CanvasCard | undefined {
  return cards
    .slice()
    .sort((a, b) => (b.z || 0) - (a.z || 0))
    .find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
}

export function bringToFront(cards: CanvasCard[], ids: string[]): CanvasCard[] {
  const max = cards.reduce((m, c) => Math.max(m, c.z || 0), 0);
  return cards.map((c) => (ids.includes(c.id) ? { ...c, z: max + 1 } : c));
}

export function sendToBack(cards: CanvasCard[], ids: string[]): CanvasCard[] {
  const min = cards.reduce((m, c) => Math.min(m, c.z || 0), 0);
  return cards.map((c) => (ids.includes(c.id) ? { ...c, z: min - 1 } : c));
}

export function nudgeCards(
  cards: CanvasCard[],
  ids: string[],
  dx: number,
  dy: number,
  snap?: boolean,
): CanvasCard[] {
  const move = new Set(ids);
  for (const id of ids) {
    const g = cards.find((c) => c.id === id);
    if (g?.kind === "group") {
      for (const c of cards) {
        if (c.id !== g.id && !c.locked && cardContains(g, c)) move.add(c.id);
      }
    }
  }
  return cards.map((c) => {
    if (!move.has(c.id) || c.locked) return c;
    return { ...c, x: snapToGrid(c.x + dx, snap), y: snapToGrid(c.y + dy, snap) };
  });
}

export function edgePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fromSide: CanvasSide = "right",
  toSide: CanvasSide = "left",
): string {
  const horiz = fromSide === "left" || fromSide === "right" || toSide === "left" || toSide === "right";
  if (horiz && Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) * 0.35) {
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
}

export function reflowEdges(cards: CanvasCard[], edges: CanvasEdge[]): CanvasEdge[] {
  return edges.map((e) => {
    const from = cards.find((c) => c.id === e.from);
    const to = cards.find((c) => c.id === e.to);
    if (!from || !to) return e;
    const ac = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const bc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    return { ...e, fromSide: nearestSide(from, bc.x, bc.y), toSide: nearestSide(to, ac.x, ac.y) };
  });
}

export function vacantPoint(
  cards: CanvasCard[],
  cam: CanvasCam,
  size = { w: 240, h: 130 },
): { x: number; y: number } {
  const ox = (200 - cam.x) / cam.k;
  const oy = (140 - cam.y) / cam.k;
  for (let i = 0; i < 16; i++) {
    const x = snapToGrid(ox + i * 32);
    const y = snapToGrid(oy + i * 24);
    const overlaps = cards.some(
      (c) => x < c.x + c.w && x + size.w > c.x && y < c.y + c.h && y + size.h > c.y,
    );
    if (!overlaps) return { x, y };
  }
  return { x: snapToGrid(ox), y: snapToGrid(oy) };
}

export function fitCamera(
  cards: CanvasCard[],
  view: { w: number; h: number },
): { x: number; y: number; k: number } {
  if (!cards.length) return { x: 40, y: 40, k: 1 };
  const minX = Math.min(...cards.map((c) => c.x)) - 48;
  const minY = Math.min(...cards.map((c) => c.y)) - 48;
  const maxX = Math.max(...cards.map((c) => c.x + c.w)) + 48;
  const maxY = Math.max(...cards.map((c) => c.y + c.h)) + 48;
  const bw = Math.max(120, maxX - minX);
  const bh = Math.max(80, maxY - minY);
  const k = Math.min(2.4, Math.max(0.22, Math.min(view.w / bw, view.h / bh)));
  return { k, x: (view.w - bw * k) / 2 - minX * k, y: (view.h - bh * k) / 2 - minY * k };
}
