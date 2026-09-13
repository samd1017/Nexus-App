import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeftRight,
  BringToFront,
  ChevronDown,
  Copy,
  Download,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Link2,
  Lock,
  Magnet,
  Plus,
  Redo2,
  Scan,
  SendToBack,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  MoreHorizontal,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import {
  alignCards,
  bringToFront,
  CANVAS_COLORS,
  canvasColorHex,
  cardAnchor,
  cardAtPoint,
  distributeCards,
  edgePath,
  fitCamera,
  idsMovedWith,
  nearestSide,
  newCardId,
  nudgeCards,
  parseCanvasDoc,
  sendToBack,
  reflowEdges,
  snapToGrid,
  toObsidianCanvas,
  vacantPoint,
  writeCanvasDoc,
  type CanvasCard,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasSide,
} from "@/lib/vault/canvas";
import { previewSnippet } from "@/lib/markdown/serialize";
import { cn } from "@/lib/utils";

type Props = { noteId: string; content: string };
type Drag =
  | { kind: "pan"; x: number; y: number; camX: number; camY: number }
  | { kind: "card"; ids: string[]; x: number; y: number; ox: Record<string, { x: number; y: number }>; started: boolean }
  | { kind: "resize"; id: string; x: number; y: number; ow: number; oh: number }
  | { kind: "marquee"; x: number; y: number; sx: number; sy: number }
  | { kind: "connect"; from: string; fromSide: CanvasSide }
  | { kind: "edge-end"; id: string; end: "from" | "to" };
type Menu =
  | { kind: "board"; x: number; y: number; wx: number; wy: number }
  | { kind: "card"; x: number; y: number; id: string }
  | { kind: "edge"; x: number; y: number; id: string };

const SIDES: CanvasSide[] = ["top", "right", "bottom", "left"];
const CLIP = "nexus-canvas-clip";

function cloneDoc(doc: CanvasDoc): CanvasDoc {
  return JSON.parse(JSON.stringify(doc)) as CanvasDoc;
}

function ColorDots({
  value,
  onPick,
}: {
  value?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="nexus-canvas-swatches">
      {CANVAS_COLORS.map((c) => (
        <button
          key={c.id || "none"}
          type="button"
          title={c.label}
          className={cn("nexus-canvas-swatch", (value || "") === c.id && "is-on")}
          style={{ background: c.hex || "transparent" }}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );
}

export function CanvasBoard({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const nodes = useVaultStore((s) => s.nodes);
  const [doc, setDoc] = useState<CanvasDoc>(() => parseCanvasDoc(content));
  const [picker, setPicker] = useState<"note" | "link" | null>(null);
  const [pickerQ, setPickerQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [edgeLabelId, setEdgeLabelId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const baselineRef = useRef(content);
  const docRef = useRef(doc);
  const persistTimer = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const undoRef = useRef<CanvasDoc[]>([]);
  const redoRef = useRef<CanvasDoc[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [connectPreview, setConnectPreview] = useState<{ x: number; y: number } | null>(null);
  const [connectFrom, setConnectFrom] = useState<{ id: string; side: CanvasSide } | null>(null);
  const zoomVel = useRef(0);
  const zoomRaf = useRef(0);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    if (content === baselineRef.current) return;
    baselineRef.current = content;
    setDoc(parseCanvasDoc(content));
  }, [noteId, content]);

  const persist = (next: CanvasDoc) => {
    const md = writeCanvasDoc(baselineRef.current, next);
    baselineRef.current = md;
    updateNoteContent(noteId, md);
  };
  const commit = (next: CanvasDoc, historic = true) => {
    if (historic) {
      undoRef.current = [...undoRef.current.slice(-60), cloneDoc(docRef.current)];
      redoRef.current = [];
      setHistoryTick((n) => n + 1);
    }
    docRef.current = next;
    setDoc(next);
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => persist(next), 180);
  };
  const live = (next: CanvasDoc) => {
    docRef.current = next;
    setDoc(next);
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(persistTimer.current);
      if (zoomRaf.current) cancelAnimationFrame(zoomRaf.current);
      persist(docRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-canvas-menu]")) setMenu(null);
      if (!t.closest("[data-canvas-add]")) setAddOpen(false);
      if (!t.closest("[data-canvas-align]")) setAlignOpen(false);
      if (!t.closest("[data-canvas-more]")) setMoreOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const unit = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomVel.current = Math.max(-0.14, Math.min(0.14, zoomVel.current + Math.max(-0.08, Math.min(0.08, unit * 0.0005))));
      const tick = () => {
        zoomRaf.current = 0;
        if (Math.abs(zoomVel.current) < 0.0004) {
          zoomVel.current = 0;
          return;
        }
        applyZoom(zoomVel.current, cx, cy);
        zoomVel.current *= 0.8;
        zoomRaf.current = requestAnimationFrame(tick);
      };
      if (!zoomRaf.current) zoomRaf.current = requestAnimationFrame(tick);
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, [noteId]);

  const notes = useMemo(
    () => Object.values(nodes).filter((n) => n.kind === "note" && n.id !== noteId),
    [nodes, noteId],
  );
  const filteredNotes = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    return notes
      .filter((n) => !q || noteTitle(n).toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
      .slice(0, 14);
  }, [notes, pickerQ]);

  const worldFromEvent = (e: { clientX: number; clientY: number }, cam = docRef.current.cam) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - cam.x) / cam.k,
      y: (e.clientY - rect.top - cam.y) / cam.k,
    };
  };

  const applyZoom = (impulse: number, cx: number, cy: number) => {
    const prev = docRef.current;
    const k2 = Math.min(3.2, Math.max(0.18, prev.cam.k * (1 - impulse)));
    const next = {
      ...prev,
      cam: { k: k2, x: cx - ((cx - prev.cam.x) / prev.cam.k) * k2, y: cy - ((cy - prev.cam.y) / prev.cam.k) * k2 },
    };
    live(next);
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => persist(next), 220);
  };

  const addCard = (partial: Partial<CanvasCard> & { kind: CanvasCard["kind"] }, at?: { x: number; y: number }) => {
    const size = {
      w: partial.w ?? (partial.kind === "group" ? 420 : 240),
      h: partial.h ?? (partial.kind === "group" ? 240 : 130),
    };
    const spot = at ?? vacantPoint(docRef.current.cards, docRef.current.cam, size);
    const card: CanvasCard = {
      id: newCardId(),
      x: snapToGrid(spot.x, docRef.current.snap),
      y: snapToGrid(spot.y, docRef.current.snap),
      w: size.w,
      h: size.h,
      z: docRef.current.cards.reduce((m, c) => Math.max(m, c.z || 0), 0) + 1,
      ...partial,
    };
    commit({ ...docRef.current, cards: [...docRef.current.cards, card] });
    setSelected([card.id]);
    setSelectedEdge(null);
    setMenu(null);
    setAddOpen(false);
    setPicker(null);
    return card.id;
  };

  const patchCards = (fn: (cards: CanvasCard[]) => CanvasCard[]) =>
    commit({ ...docRef.current, cards: fn(docRef.current.cards) });
  const layoutCards = (fn: (cards: CanvasCard[]) => CanvasCard[]) => {
    const cards = fn(docRef.current.cards);
    commit({ ...docRef.current, cards, edges: reflowEdges(cards, docRef.current.edges) });
  };

  const removeIds = (ids: string[]) => {
    const drop = new Set(ids);
    commit({
      ...docRef.current,
      cards: docRef.current.cards.filter((c) => !drop.has(c.id)),
      edges: docRef.current.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)),
    });
    setSelected([]);
    setMenu(null);
  };

  const colorIds = (ids: string[], color: string) => {
    if (!ids.length) return;
    patchCards((cards) => cards.map((c) => (ids.includes(c.id) ? { ...c, color } : c)));
  };

  const toggleLock = (ids: string[]) => {
    const anyLocked = docRef.current.cards.some((c) => ids.includes(c.id) && c.locked);
    patchCards((cards) => cards.map((c) => (ids.includes(c.id) ? { ...c, locked: !anyLocked } : c)));
  };

  const duplicateIds = (ids: string[]) => {
    const copies = docRef.current.cards
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ ...c, id: newCardId(), x: c.x + 28, y: c.y + 28, locked: false }));
    const remap = new Map(ids.map((id, i) => [id, copies[i]?.id || id]));
    const edges = docRef.current.edges
      .filter((e) => remap.has(e.from) && remap.has(e.to))
      .map((e) => ({ ...e, id: newCardId(), from: remap.get(e.from)!, to: remap.get(e.to)! }));
    commit({
      ...docRef.current,
      cards: [...docRef.current.cards, ...copies],
      edges: [...docRef.current.edges, ...edges],
    });
    setSelected(copies.map((c) => c.id));
    setMenu(null);
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(cloneDoc(docRef.current));
    docRef.current = prev;
    setDoc(prev);
    persist(prev);
    setHistoryTick((n) => n + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(cloneDoc(docRef.current));
    docRef.current = next;
    setDoc(next);
    persist(next);
    setHistoryTick((n) => n + 1);
  };

  const copySelected = (ids = selected) => {
    if (!ids.length) return;
    const payload = {
      cards: docRef.current.cards.filter((c) => ids.includes(c.id)),
      edges: docRef.current.edges.filter((e) => ids.includes(e.from) && ids.includes(e.to)),
    };
    try {
      sessionStorage.setItem(CLIP, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };
  const pasteClipboard = (at?: { x: number; y: number }) => {
    try {
      const raw = sessionStorage.getItem(CLIP);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { cards: CanvasCard[]; edges: CanvasEdge[] };
      if (!parsed.cards?.length) return;
      const minX = Math.min(...parsed.cards.map((c) => c.x));
      const minY = Math.min(...parsed.cards.map((c) => c.y));
      const ox = (at?.x ?? minX + 32) - minX;
      const oy = (at?.y ?? minY + 32) - minY;
      const remap = new Map<string, string>();
      const copies = parsed.cards.map((c) => {
        const id = newCardId();
        remap.set(c.id, id);
        return { ...c, id, x: c.x + ox, y: c.y + oy, locked: false };
      });
      const edges = (parsed.edges || [])
        .filter((e) => remap.has(e.from) && remap.has(e.to))
        .map((e) => ({ ...e, id: newCardId(), from: remap.get(e.from)!, to: remap.get(e.to)! }));
      commit({
        ...docRef.current,
        cards: [...docRef.current.cards, ...copies],
        edges: [...docRef.current.edges, ...edges],
      });
      setSelected(copies.map((c) => c.id));
    } catch {
      /* ignore */
    }
  };

  const connect = (from: string, fromSide: CanvasSide, to: string, toSide: CanvasSide) => {
    if (from === to) return;
    const cur = docRef.current;
    if (cur.edges.some((e) => e.from === from && e.to === to)) {
      setConnectFrom(null);
      setConnectPreview(null);
      return;
    }
    const edge: CanvasEdge = { id: newCardId(), from, to, fromSide, toSide };
    commit({ ...cur, edges: [...cur.edges, edge] });
    setConnectFrom(null);
    setConnectPreview(null);
    setSelected([]);
    setSelectedEdge(edge.id);
  };

  const patchEdge = (id: string, next: Partial<CanvasEdge>) => {
    commit({
      ...docRef.current,
      edges: docRef.current.edges.map((e) => (e.id === id ? { ...e, ...next } : e)),
    });
  };

  const removeEdge = (id: string) => {
    commit({ ...docRef.current, edges: docRef.current.edges.filter((e) => e.id !== id) });
    setSelectedEdge(null);
    setEdgeLabelId(null);
    setMenu(null);
  };

  const capture = (e: React.PointerEvent) => {
    try {
      hostRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onBgPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-canvas-card],[data-canvas-port],[data-canvas-edge],[data-canvas-menu],[data-canvas-float]")) {
      return;
    }
    setPicker(null);
    setEditingId(null);
    setConnectFrom(null);
    setConnectPreview(null);
    setMenu(null);
    setAddOpen(false);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      capture(e);
      dragRef.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        camX: docRef.current.cam.x,
        camY: docRef.current.cam.y,
      };
      return;
    }
    if (e.button !== 0) return;
    capture(e);
    if (e.shiftKey) {
      const w = worldFromEvent(e);
      dragRef.current = { kind: "marquee", x: e.clientX, y: e.clientY, sx: w.x, sy: w.y };
    } else {
      setSelected([]);
      setSelectedEdge(null);
      dragRef.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        camX: docRef.current.cam.x,
        camY: docRef.current.cam.y,
      };
    }
  };

  const startCardDrag = (e: React.PointerEvent, card: CanvasCard) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("textarea,input,[data-resize],[data-card-open]")) return;
    if ((e.target as HTMLElement).closest("[data-canvas-port]")) return;
    if (connectFrom && connectFrom.id !== card.id) {
      e.stopPropagation();
      e.preventDefault();
      const w = worldFromEvent(e);
      connect(connectFrom.id, connectFrom.side, card.id, nearestSide(card, w.x, w.y));
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    setEditingId(null);
    setSelectedEdge(null);
    const ids = e.shiftKey
      ? selected.includes(card.id)
        ? selected.filter((id) => id !== card.id)
        : [...selected, card.id]
      : selected.includes(card.id)
        ? selected
        : [card.id];
    setSelected(ids);
    if (card.locked) return;
    const moveIds = idsMovedWith(card, docRef.current.cards, ids).filter((id) => {
      const c = docRef.current.cards.find((x) => x.id === id);
      return c && !c.locked;
    });
    const ox: Record<string, { x: number; y: number }> = {};
    for (const id of moveIds) {
      const c = docRef.current.cards.find((x) => x.id === id);
      if (c) ox[id] = { x: c.x, y: c.y };
    }
    capture(e);
    dragRef.current = { kind: "card", ids: moveIds, x: e.clientX, y: e.clientY, ox, started: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const cur = docRef.current;
    if (drag.kind === "pan") {
      live({
        ...cur,
        cam: { ...cur.cam, x: drag.camX + (e.clientX - drag.x), y: drag.camY + (e.clientY - drag.y) },
      });
    } else if (drag.kind === "card") {
      const k = cur.cam.k || 1;
      const dx = (e.clientX - drag.x) / k;
      const dy = (e.clientY - drag.y) / k;
      if (!drag.started) {
        if (dx * dx + dy * dy < 16) return;
        drag.started = true;
        beginHistory();
        live({ ...cur, cards: bringToFront(cur.cards, drag.ids) });
      }
      const now = docRef.current;
      const cards = now.cards.map((c) => {
        const o = drag.ox[c.id];
        if (!o) return c;
        return { ...c, x: o.x + dx, y: o.y + dy };
      });
      live({
        ...now,
        cards,
        edges: reflowEdges(cards, now.edges),
      });
    } else if (drag.kind === "resize") {
      const k = cur.cam.k || 1;
      live({
        ...cur,
        cards: cur.cards.map((c) =>
          c.id === drag.id
            ? {
                ...c,
                w: Math.max(140, drag.ow + (e.clientX - drag.x) / k),
                h: Math.max(80, drag.oh + (e.clientY - drag.y) / k),
              }
            : c,
        ),
      });
    } else if (drag.kind === "marquee") {
      const w = worldFromEvent(e);
      setMarquee({
        x: Math.min(drag.sx, w.x),
        y: Math.min(drag.sy, w.y),
        w: Math.abs(w.x - drag.sx),
        h: Math.abs(w.y - drag.sy),
      });
    } else if (drag.kind === "connect" || drag.kind === "edge-end") {
      setConnectPreview(worldFromEvent(e));
    }
  };

  const finishMoveSnap = (ids?: string[]) => {
    const snap = docRef.current.snap !== false;
    const cards = docRef.current.cards.map((c) => {
      if (ids && !ids.includes(c.id)) return c;
      return {
        ...c,
        x: snapToGrid(c.x, snap),
        y: snapToGrid(c.y, snap),
        w: Math.max(140, snapToGrid(c.w, snap)),
        h: Math.max(80, snapToGrid(c.h, snap)),
      };
    });
    const next = {
      ...docRef.current,
      cards,
      edges: reflowEdges(cards, docRef.current.edges),
    };
    live(next);
    persist(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.kind === "marquee" && marquee) {
      const hits = docRef.current.cards
        .filter(
          (c) =>
            c.x < marquee.x + marquee.w &&
            c.x + c.w > marquee.x &&
            c.y < marquee.y + marquee.h &&
            c.y + c.h > marquee.y,
        )
        .map((c) => c.id);
      setSelected(hits);
      setMarquee(null);
    } else if (drag?.kind === "connect") {
      const w = worldFromEvent(e);
      const hit = cardAtPoint(
        docRef.current.cards.filter((c) => c.id !== drag.from),
        w.x,
        w.y,
      );
      if (hit) connect(drag.from, drag.fromSide, hit.id, nearestSide(hit, w.x, w.y));
      else setConnectPreview(null);
    } else if (drag?.kind === "edge-end") {
      const w = worldFromEvent(e);
      const edge = docRef.current.edges.find((x) => x.id === drag.id);
      const hit = cardAtPoint(docRef.current.cards, w.x, w.y);
      if (edge && hit) {
        const side = nearestSide(hit, w.x, w.y);
        if (drag.end === "from" && hit.id !== edge.to) {
          patchEdge(edge.id, { from: hit.id, fromSide: side });
        } else if (drag.end === "to" && hit.id !== edge.from) {
          patchEdge(edge.id, { to: hit.id, toSide: side });
        }
      }
      setConnectPreview(null);
    } else if (drag?.kind === "card") {
      if (drag.started) finishMoveSnap(drag.ids);
    } else if (drag?.kind === "resize") {
      finishMoveSnap([drag.id]);
    } else if (drag) {
      persist(docRef.current);
    }
    dragRef.current = null;
  };

  const beginHistory = () => {
    undoRef.current = [...undoRef.current.slice(-60), cloneDoc(docRef.current)];
    redoRef.current = [];
    setHistoryTick((n) => n + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && !e.repeat && !(e.target as HTMLElement).closest("input,textarea")) {
        spaceRef.current = true;
      }
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEdge) {
          e.preventDefault();
          removeEdge(selectedEdge);
          return;
        }
        if (selected.length) {
          e.preventDefault();
          removeIds(selected);
        }
      }
      if (e.key === "Escape") {
        setSelected([]);
        setSelectedEdge(null);
        setConnectFrom(null);
        setConnectPreview(null);
        setEditingId(null);
        setMenu(null);
        setPicker(null);
        setAddOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelected(docRef.current.cards.map((c) => c.id));
        setSelectedEdge(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        copySelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteClipboard();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selected.length) {
        e.preventDefault();
        duplicateIds(selected);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "l" && selected.length) {
        e.preventDefault();
        toggleLock(selected);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "g" && selected.length >= 2) {
        e.preventDefault();
        const cards = selected
          .map((id) => docRef.current.cards.find((x) => x.id === id))
          .filter((c): c is CanvasCard => c != null && c.kind !== "group");
        if (cards.length < 2) return;
        const pad = 28;
        const group: CanvasCard = {
          id: newCardId(),
          kind: "group",
          text: "Group",
          x: Math.min(...cards.map((c) => c.x)) - pad,
          y: Math.min(...cards.map((c) => c.y)) - pad,
          w: Math.max(...cards.map((c) => c.x + c.w)) - Math.min(...cards.map((c) => c.x)) + pad * 2,
          h: Math.max(...cards.map((c) => c.y + c.h)) - Math.min(...cards.map((c) => c.y)) + pad * 2,
          color: "6",
        };
        commit({ ...docRef.current, cards: [group, ...docRef.current.cards] });
        setSelected([group.id, ...selected]);
      }
      const step = e.shiftKey ? 24 : 4;
      if (selected.length && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const cards = nudgeCards(docRef.current.cards, selected, dx, dy, false);
        commit({
          ...docRef.current,
          cards,
          edges: reflowEdges(cards, docRef.current.edges),
        });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  const exportObsidian = () => {
    const blob = new Blob([JSON.stringify(toObsidianCanvas(doc), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "board.canvas";
    a.click();
    URL.revokeObjectURL(a.href);
    setAddOpen(false);
  };

  const importObsidian = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".canvas,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((txt) => {
        try {
          const next = parseCanvasDoc("````canvas\n" + txt + "\n````");
          commit(next.cards.length ? next : parseCanvasDoc("````canvas\n" + JSON.stringify(JSON.parse(txt)) + "\n````"));
        } catch {
          /* ignore */
        }
      });
    };
    input.click();
    setAddOpen(false);
  };

  const fit = () => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    commit({
      ...docRef.current,
      cam: fitCamera(docRef.current.cards, { w: rect.width, h: rect.height }),
    });
  };

  const cardById = (id: string) => doc.cards.find((c) => c.id === id);
  const edgeById = (id: string) => doc.edges.find((e) => e.id === id);
  const mapBounds = useMemo(() => {
    if (!doc.cards.length) return null;
    const minX = Math.min(...doc.cards.map((c) => c.x)) - 40;
    const minY = Math.min(...doc.cards.map((c) => c.y)) - 40;
    return {
      minX,
      minY,
      w: Math.max(160, Math.max(...doc.cards.map((c) => c.x + c.w)) - minX + 40),
      h: Math.max(100, Math.max(...doc.cards.map((c) => c.y + c.h)) - minY + 40),
    };
  }, [doc.cards]);
  const q = filter.trim().toLowerCase();
  const openNote = (path?: string) => {
    if (!path) return;
    const note = Object.values(nodes).find((n) => n.kind === "note" && n.path === path);
    if (note) setActiveNote(note.id);
  };

  const menuItems = (): { label: string; run: () => void; danger?: boolean }[] => {
    if (!menu) return [];
    if (menu.kind === "board") {
      return [
        { label: "Add text", run: () => addCard({ kind: "text", text: "" }, { x: menu.wx, y: menu.wy }) },
        { label: "Add group", run: () => addCard({ kind: "group", text: "Group" }, { x: menu.wx, y: menu.wy }) },
        { label: "Add note", run: () => setPicker("note") },
        { label: "Paste here", run: () => pasteClipboard({ x: menu.wx, y: menu.wy }) },
        { label: "Select all", run: () => setSelected(doc.cards.map((c) => c.id)) },
        { label: "Fit all", run: fit },
      ];
    }
    if (menu.kind === "edge") {
      return [
        { label: "Edit label", run: () => setEdgeLabelId(menu.id) },
        {
          label: "Reverse",
          run: () => {
            const edge = edgeById(menu.id);
            if (!edge) return;
            patchEdge(menu.id, { from: edge.to, to: edge.from, fromSide: edge.toSide, toSide: edge.fromSide });
          },
        },
        { label: "Delete connection", danger: true, run: () => removeEdge(menu.id) },
      ];
    }
    const card = cardById(menu.id);
    if (!card) return [];
    const ids = selected.includes(card.id) ? selected : [card.id];
    return [
      ...(card.kind === "note" ? [{ label: "Open note", run: () => openNote(card.notePath) }] : []),
      ...(card.kind === "text" || card.kind === "group"
        ? [{ label: "Edit text", run: () => setEditingId(card.id) }]
        : []),
      { label: "Duplicate", run: () => duplicateIds(ids) },
      { label: card.locked ? "Unlock" : "Lock", run: () => toggleLock(ids) },
      { label: "Copy", run: () => { setSelected(ids); copySelected(ids); } },
      { label: "Delete", danger: true, run: () => removeIds(ids) },
    ];
  };

  const startConnect = (e: React.PointerEvent, card: CanvasCard, side: CanvasSide) => {
    e.stopPropagation();
    e.preventDefault();
    capture(e);
    setSelectedEdge(null);
    setConnectFrom({ id: card.id, side });
    dragRef.current = { kind: "connect", from: card.id, fromSide: side };
    setConnectPreview(worldFromEvent(e));
  };

  const liveEdge = selectedEdge ? edgeById(selectedEdge) : null;

  return (
    <div className="nexus-canvas relative flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-1.5 text-[11px] leading-snug text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">Tour board</span>
        {" · "}
        Spatial cards in this vault — not an Obsidian Canvas plugin.
      </div>
      <div className="nexus-canvas-toolbar">
        <div className="relative" data-canvas-add>
          <button type="button" className="chip-btn" onClick={() => setAddOpen((v) => !v)}>
            <Plus size={13} /> Add <ChevronDown size={12} />
          </button>
          {addOpen ? (
            <div className="nexus-canvas-pop">
              <button type="button" className="nexus-canvas-menu-item" onClick={() => addCard({ kind: "text", text: "" })}>
                <Type size={13} /> Text card
              </button>
              <button type="button" className="nexus-canvas-menu-item" onClick={() => { setPicker("note"); setAddOpen(false); }}>
                <StickyNote size={13} /> Note card
              </button>
              <button type="button" className="nexus-canvas-menu-item" onClick={() => addCard({ kind: "group", text: "Group" })}>
                <Square size={13} /> Group
              </button>
              <button type="button" className="nexus-canvas-menu-item" onClick={() => { setPicker("link"); setAddOpen(false); }}>
                <Link2 size={13} /> Link
              </button>
              <button
                type="button"
                className="nexus-canvas-menu-item"
                onClick={() => {
                  const src = window.prompt("Image URL or vault path");
                  if (src) addCard({ kind: "image", imageSrc: src, w: 280, h: 180 });
                }}
              >
                <ImageIcon size={13} /> Image
              </button>
              <button type="button" className="nexus-canvas-menu-item" onClick={importObsidian}>
                <Upload size={13} /> Import .canvas
              </button>
              <button type="button" className="nexus-canvas-menu-item" onClick={exportObsidian}>
                <Download size={13} /> Export .canvas
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="chip-btn" title="Undo" disabled={!undoRef.current.length} onClick={undo}>
          <Undo2 size={13} />
        </button>
        <button type="button" className="chip-btn" title="Redo" disabled={!redoRef.current.length} onClick={redo}>
          <Redo2 size={13} />
        </button>
        <button type="button" className="chip-btn" title="Fit all" onClick={fit}>
          <Scan size={13} />
        </button>
        <button
          type="button"
          className={cn("chip-btn", doc.snap !== false && "is-active")}
          title="Snap to grid"
          onClick={() => commit({ ...doc, snap: doc.snap === false })}
        >
          <Magnet size={13} />
        </button>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find cards…"
          className="ml-1 h-7 w-32 rounded-md border border-[var(--border)] bg-transparent px-2 text-[11px] outline-none"
        />
        <span className="ml-auto hidden text-[11px] text-[var(--text-muted)] lg:inline">
          Drag · right-click · click a line to edit it
        </span>
        <span className="sr-only">{historyTick}</span>
      </div>

      {picker === "note" ? (
        <div className="absolute left-3 top-12 z-20 w-64 rounded-[12px] border border-[var(--border)] bg-[var(--panel-solid)] p-1.5 shadow-lg">
          <input
            autoFocus
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
            placeholder="Pin a note…"
            className="mb-1 w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-[12px] outline-none"
          />
          <ul className="max-h-56 overflow-y-auto">
            {filteredNotes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.05]"
                  onClick={() => addCard({ kind: "note", notePath: n.path, w: 260, h: 160 })}
                >
                  <FileText size={12} className="opacity-50" />
                  <span className="truncate">{noteTitle(n)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {picker === "link" ? (
        <form
          className="absolute left-3 top-12 z-20 flex w-72 gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--panel-solid)] p-2 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            const url = pickerQ.trim();
            if (url) addCard({ kind: "link", url, text: url, w: 260, h: 88 });
            setPickerQ("");
          }}
        >
          <input
            autoFocus
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-[12px] outline-none"
          />
          <button type="submit" className="chip-btn">Add</button>
        </form>
      ) : null}

      <div
        ref={hostRef}
        className="nexus-canvas-stage relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-canvas-card],[data-canvas-edge],[data-canvas-menu]")) return;
          const w = worldFromEvent(e);
          const id = addCard({ kind: "text", text: "" }, w);
          setEditingId(id);
        }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-canvas-card],[data-canvas-edge],[data-canvas-menu]")) return;
          e.preventDefault();
          const w = worldFromEvent(e);
          setMenu({ kind: "board", x: e.clientX, y: e.clientY, wx: w.x, wy: w.y });
        }}
      >
        {connectFrom ? (
          <div className="nexus-canvas-hint">Click another card to connect · Esc to cancel</div>
        ) : null}

        {selected.length && !selectedEdge ? (
          <div data-canvas-float className="nexus-canvas-float" onPointerDown={(e) => e.stopPropagation()}>
            <ColorDots
              value={cardById(selected[0] || "")?.color}
              onPick={(id) => colorIds(selected, id)}
            />
            <span className="nexus-canvas-float-rule" />
            <div className="relative" data-canvas-align>
              <button type="button" className="chip-btn" onClick={() => setAlignOpen((v) => !v)}>
                Align
              </button>
              {alignOpen ? (
                <div className="nexus-canvas-pop is-row">
                  <button type="button" className="chip-btn" title="Left" onClick={() => layoutCards((cs) => alignCards(cs, selected, "left"))}>
                    <AlignStartVertical size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Center" onClick={() => layoutCards((cs) => alignCards(cs, selected, "hcenter"))}>
                    <AlignCenterVertical size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Right" onClick={() => layoutCards((cs) => alignCards(cs, selected, "right"))}>
                    <AlignEndVertical size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Top" onClick={() => layoutCards((cs) => alignCards(cs, selected, "top"))}>
                    <AlignStartHorizontal size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Middle" onClick={() => layoutCards((cs) => alignCards(cs, selected, "vcenter"))}>
                    <AlignCenterHorizontal size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Bottom" onClick={() => layoutCards((cs) => alignCards(cs, selected, "bottom"))}>
                    <AlignEndHorizontal size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Distribute H" onClick={() => layoutCards((cs) => distributeCards(cs, selected, "h"))}>
                    H
                  </button>
                  <button type="button" className="chip-btn" title="Distribute V" onClick={() => layoutCards((cs) => distributeCards(cs, selected, "v"))}>
                    V
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" className="chip-btn" title="Duplicate" onClick={() => duplicateIds(selected)}>
              <Copy size={13} />
            </button>
            <button type="button" className="chip-btn" title="Delete" onClick={() => removeIds(selected)}>
              <Trash2 size={13} />
            </button>
            <div className="relative" data-canvas-more>
              <button type="button" className="chip-btn" title="More" onClick={() => setMoreOpen((v) => !v)}>
                <MoreHorizontal size={13} />
              </button>
              {moreOpen ? (
                <div className="nexus-canvas-pop is-row">
                  <button type="button" className="chip-btn" title="Lock" onClick={() => toggleLock(selected)}>
                    {selected.some((id) => cardById(id)?.locked) ? <Unlock size={13} /> : <Lock size={13} />}
                  </button>
                  <button type="button" className="chip-btn" title="Bring to front" onClick={() => patchCards((cs) => bringToFront(cs, selected))}>
                    <BringToFront size={13} />
                  </button>
                  <button type="button" className="chip-btn" title="Send to back" onClick={() => patchCards((cs) => sendToBack(cs, selected))}>
                    <SendToBack size={13} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {liveEdge ? (
          <div data-canvas-float className="nexus-canvas-float" onPointerDown={(e) => e.stopPropagation()}>
            <input
              className="nexus-canvas-edge-input"
              value={liveEdge.label || ""}
              placeholder="Label"
              onChange={(e) => {
                const label = e.target.value;
                live({
                  ...docRef.current,
                  edges: docRef.current.edges.map((x) => (x.id === liveEdge.id ? { ...x, label } : x)),
                });
              }}
              onBlur={() => persist(docRef.current)}
            />
            <button
              type="button"
              className="chip-btn"
              title="Reverse"
              onClick={() =>
                patchEdge(liveEdge.id, {
                  from: liveEdge.to,
                  to: liveEdge.from,
                  fromSide: liveEdge.toSide,
                  toSide: liveEdge.fromSide,
                })
              }
            >
              <ArrowLeftRight size={13} />
            </button>
            <ColorDots value={liveEdge.color} onPick={(id) => patchEdge(liveEdge.id, { color: id })} />
            <button type="button" className="chip-btn" title="Delete connection" onClick={() => removeEdge(liveEdge.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        ) : null}

        <div
          className="nexus-canvas-world absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${doc.cam.x}px, ${doc.cam.y}px) scale(${doc.cam.k})` }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
            <defs>
              <marker id="nexus-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
              <marker id="nexus-arrow-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#7dd3fc" />
              </marker>
            </defs>
            {doc.edges.map((edge) => {
              const from = cardById(edge.from);
              const to = cardById(edge.to);
              if (!from || !to) return null;
              const a = cardAnchor(from, edge.fromSide || "right");
              const b = cardAnchor(to, edge.toSide || "left");
              const d = edgePath(a, b, edge.fromSide || "right", edge.toSide || "left");
              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              const on = selectedEdge === edge.id || hoverEdge === edge.id;
              const stroke = on ? "#7dd3fc" : canvasColorHex(edge.color) || "var(--accent)";
              return (
                <g key={edge.id} data-canvas-edge className="pointer-events-auto">
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="22"
                    style={{ cursor: "pointer" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                      setSelected([]);
                      setSelectedEdge(edge.id);
                      setMenu(null);
                    }}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setSelectedEdge(edge.id);
                      setMenu({ kind: "edge", x: ev.clientX, y: ev.clientY, id: edge.id });
                    }}
                    onDoubleClick={() => {
                      setSelectedEdge(edge.id);
                      setEdgeLabelId(edge.id);
                    }}
                    onPointerEnter={() => setHoverEdge(edge.id)}
                    onPointerLeave={() => setHoverEdge((id) => (id === edge.id ? null : id))}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={on ? 3 : 2}
                    markerEnd={on ? "url(#nexus-arrow-sel)" : "url(#nexus-arrow)"}
                    className="pointer-events-none"
                  />
                  <circle
                    cx={midX}
                    cy={midY}
                    r={on ? 6 : 10}
                    fill={on ? "#7dd3fc" : "transparent"}
                    stroke={on ? "var(--panel-solid)" : "transparent"}
                    strokeWidth="2"
                    className="pointer-events-auto"
                    style={{ cursor: "pointer" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                      setSelected([]);
                      setSelectedEdge(edge.id);
                      setMenu(null);
                    }}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setSelectedEdge(edge.id);
                      setMenu({ kind: "edge", x: ev.clientX, y: ev.clientY, id: edge.id });
                    }}
                    onPointerEnter={() => setHoverEdge(edge.id)}
                    onPointerLeave={() => setHoverEdge((id) => (id === edge.id ? null : id))}
                  />
                  {selectedEdge === edge.id ? (
                    <>
                      <circle
                        cx={a.x}
                        cy={a.y}
                        r="7"
                        fill="var(--panel-solid)"
                        stroke="#7dd3fc"
                        strokeWidth="2"
                        className="pointer-events-auto"
                        style={{ cursor: "grab" }}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          ev.preventDefault();
                          capture(ev);
                          dragRef.current = { kind: "edge-end", id: edge.id, end: "from" };
                          setConnectPreview(worldFromEvent(ev));
                        }}
                      />
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r="7"
                        fill="var(--panel-solid)"
                        stroke="#7dd3fc"
                        strokeWidth="2"
                        className="pointer-events-auto"
                        style={{ cursor: "grab" }}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          ev.preventDefault();
                          capture(ev);
                          dragRef.current = { kind: "edge-end", id: edge.id, end: "to" };
                          setConnectPreview(worldFromEvent(ev));
                        }}
                      />
                    </>
                  ) : null}
                  {edge.label && edgeLabelId !== edge.id ? (
                    <text
                      x={midX}
                      y={midY - 8}
                      textAnchor="middle"
                      fill="var(--text-secondary)"
                      fontSize="11"
                      className="pointer-events-none"
                    >
                      {edge.label}
                    </text>
                  ) : null}
                  {edgeLabelId === edge.id ? (
                    <foreignObject x={midX - 54} y={midY - 12} width="108" height="24">
                      <input
                        className="h-6 w-full rounded border border-[var(--border)] bg-[var(--panel-solid)] px-1 text-center text-[10px]"
                        defaultValue={edge.label}
                        autoFocus
                        onBlur={(ev) => {
                          patchEdge(edge.id, { label: ev.target.value });
                          setEdgeLabelId(null);
                        }}
                      />
                    </foreignObject>
                  ) : null}
                </g>
              );
            })}
            {connectPreview && (connectFrom || dragRef.current?.kind === "edge-end") ? (
              (() => {
                const src =
                  connectFrom
                    ? cardById(connectFrom.id)
                    : dragRef.current?.kind === "edge-end"
                      ? cardById(
                          dragRef.current.end === "from"
                            ? edgeById(dragRef.current.id)?.to || ""
                            : edgeById(dragRef.current.id)?.from || "",
                        )
                      : undefined;
                if (!src) return null;
                const side =
                  connectFrom?.side ||
                  (dragRef.current?.kind === "edge-end"
                    ? dragRef.current.end === "from"
                      ? edgeById(dragRef.current.id)?.toSide
                      : edgeById(dragRef.current.id)?.fromSide
                    : "right");
                const a = cardAnchor(src, side || "right");
                return (
                  <path
                    d={`M ${a.x} ${a.y} L ${connectPreview.x} ${connectPreview.y}`}
                    fill="none"
                    stroke="#7dd3fc"
                    strokeDasharray="6 4"
                    strokeWidth="2"
                  />
                );
              })()
            ) : null}
          </svg>

          {doc.cards
            .slice()
            .sort((a, b) => {
              const g = (a.kind === "group" ? -1000 : 0) - (b.kind === "group" ? -1000 : 0);
              return g || (a.z || 0) - (b.z || 0);
            })
            .map((card) => {
              const note = card.kind === "note"
                ? Object.values(nodes).find((n) => n.kind === "note" && n.path === card.notePath)
                : null;
              const preview = note ? previewSnippet(note.content || "", 180) : "";
              const hex = canvasColorHex(card.color);
              const dim = q
                ? !(
                    (card.text || "").toLowerCase().includes(q) ||
                    (card.notePath || "").toLowerCase().includes(q) ||
                    (note ? noteTitle(note).toLowerCase().includes(q) : false) ||
                    (card.url || "").toLowerCase().includes(q)
                  )
                : false;
              const showPorts = Boolean(connectFrom);
              return (
                <div
                  key={card.id}
                  data-canvas-card
                  data-card-id={card.id}
                  className={cn(
                    "nexus-canvas-card",
                    card.kind === "group" && "nexus-canvas-group",
                    selected.includes(card.id) && "is-selected",
                    card.locked && "is-locked",
                    dim && "is-dimmed",
                    showPorts && "is-ports",
                  )}
                  style={{
                    left: card.x,
                    top: card.y,
                    width: card.w,
                    height: card.h,
                    borderColor: hex || undefined,
                    boxShadow: hex ? `0 0 0 1px ${hex}` : undefined,
                    zIndex: card.kind === "group" ? 0 : (card.z || 1) + 1,
                  }}
                  onPointerDown={(e) => startCardDrag(e, card)}
                  onDragStart={(e) => e.preventDefault()}
                  onDoubleClick={() => {
                    if (card.kind === "note") openNote(card.notePath);
                    else if (card.kind === "text" || card.kind === "group") setEditingId(card.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!selected.includes(card.id)) setSelected([card.id]);
                    setSelectedEdge(null);
                    setMenu({ kind: "card", x: e.clientX, y: e.clientY, id: card.id });
                  }}
                >
                  <div className="nexus-canvas-grip" aria-hidden>
                    <GripVertical size={12} />
                    {card.locked ? <Lock size={11} /> : null}
                  </div>
                  {SIDES.map((side) => (
                    <button
                      key={side}
                      type="button"
                      data-canvas-port
                      tabIndex={-1}
                      aria-hidden={!showPorts}
                      className={cn(
                        "nexus-canvas-port",
                        `is-${side}`,
                        connectFrom?.id === card.id && connectFrom.side === side && "is-live",
                      )}
                      title={`Connect ${side}`}
                      onPointerDown={(e) => startConnect(e, card, side)}
                    />
                  ))}
                  {card.kind === "note" ? (
                    <div className="flex h-full w-full flex-col items-start gap-1 overflow-hidden text-left">
                      <span className="flex w-full items-center gap-1.5 text-[13px] font-medium">
                        <StickyNote size={14} className="text-[var(--accent)]" />
                        <span className="min-w-0 truncate">{note ? noteTitle(note) : card.notePath || "Missing note"}</span>
                        {note ? (
                          <button
                            type="button"
                            data-card-open
                            className="ml-auto shrink-0 text-[10px] text-[var(--accent)] hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openNote(card.notePath);
                            }}
                          >
                            Open
                          </button>
                        ) : null}
                      </span>
                      <span className="line-clamp-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                        {preview || "Double-click to open"}
                      </span>
                    </div>
                  ) : card.kind === "image" ? (
                    card.imageSrc ? (
                      <img src={card.imageSrc} alt="" draggable={false} className="h-full w-full rounded-md object-cover" />
                    ) : (
                      <p className="text-[12px] text-[var(--text-muted)]">No image</p>
                    )
                  ) : card.kind === "link" ? (
                    <a
                      href={card.url}
                      target="_blank"
                      rel="noreferrer"
                      data-card-open
                      className="text-[13px] text-[var(--accent)] underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {card.text || card.url}
                    </a>
                  ) : editingId === card.id ? (
                    <textarea
                      className="nexus-canvas-edit"
                      value={card.text ?? ""}
                      autoFocus
                      onChange={(e) =>
                        live({
                          ...docRef.current,
                          cards: docRef.current.cards.map((c) =>
                            c.id === card.id ? { ...c, text: e.target.value } : c,
                          ),
                        })
                      }
                      onBlur={() => {
                        setEditingId(null);
                        persist(docRef.current);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                      {card.text || (card.kind === "group" ? "Group" : "Double-click to write")}
                    </p>
                  )}
                  {!card.locked ? (
                    <span
                      data-resize
                      className="nexus-canvas-resize"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        capture(e);
                        beginHistory();
                        dragRef.current = { kind: "resize", id: card.id, x: e.clientX, y: e.clientY, ow: card.w, oh: card.h };
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          {marquee ? (
            <div
              className="pointer-events-none absolute border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          ) : null}
        </div>
      </div>

      {mapBounds ? (
        <button
          type="button"
          className="nexus-canvas-minimap"
          title="Jump on the board"
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const host = hostRef.current?.getBoundingClientRect();
            if (!host) return;
            const wx = mapBounds.minX + ((e.clientX - rect.left) / rect.width) * mapBounds.w;
            const wy = mapBounds.minY + ((e.clientY - rect.top) / rect.height) * mapBounds.h;
            commit({
              ...docRef.current,
              cam: {
                ...docRef.current.cam,
                x: host.width / 2 - wx * docRef.current.cam.k,
                y: host.height / 2 - wy * docRef.current.cam.k,
              },
            });
          }}
        >
          {doc.cards.map((c) => (
            <span
              key={c.id}
              className={cn("nexus-canvas-minimap-card", selected.includes(c.id) && "is-selected")}
              style={{
                left: `${((c.x - mapBounds.minX) / mapBounds.w) * 100}%`,
                top: `${((c.y - mapBounds.minY) / mapBounds.h) * 100}%`,
                width: `${(c.w / mapBounds.w) * 100}%`,
                height: `${(c.h / mapBounds.h) * 100}%`,
                background: canvasColorHex(c.color) || "var(--text-muted)",
              }}
            />
          ))}
        </button>
      ) : null}

      {menu ? (
        <div
          data-canvas-menu
          className="nexus-canvas-menu"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 260)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menuItems().map((item) => (
            <button
              key={item.label}
              type="button"
              className={cn("nexus-canvas-menu-item", item.danger && "is-danger")}
              onClick={() => {
                item.run();
                setMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
          {menu.kind === "card" || menu.kind === "edge" ? (
            <ColorDots
              value={menu.kind === "card" ? cardById(menu.id)?.color : edgeById(menu.id)?.color}
              onPick={(id) => {
                if (menu.kind === "edge") patchEdge(menu.id, { color: id });
                else {
                  const card = cardById(menu.id);
                  const ids = card && selected.includes(card.id) ? selected : [menu.id];
                  colorIds(ids, id);
                }
                setMenu(null);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { isCanvasNote } from "@/lib/vault/canvas";
