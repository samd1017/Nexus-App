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
