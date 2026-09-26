/**
 * Hydrate mermaid / math / embeds / live queries in static Source preview HTML.
 * Visual mode uses TipTap node views; Preview/split only has sanitized HTML.
 */

import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { sliceEmbedBody } from "@/lib/markdown/note-slice";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { parseSearchOps, searchWithOps, unsupportedSearchHint } from "@/lib/search/query-ops";
import { noteTitle } from "@/lib/vault/types";
import type { VaultNode } from "@/lib/vault/types";
import type { ThemeMode } from "@/lib/prefs/preferences";
import { renderMermaidSvg } from "@/lib/editor/render-mermaid";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderMermaid(
  els: HTMLElement[],
  theme: ThemeMode,
  cancelled: () => boolean,
): Promise<void> {
  if (!els.length) return;
  try {
    for (let i = 0; i < els.length; i++) {
      const el = els[i]!;
      const source = (el.getAttribute("data-source") || el.textContent || "").trim();
      if (!source) {
        el.innerHTML =
          '<div class="nexus-mermaid-empty">Empty mermaid diagram</div>';
        continue;
      }
      el.innerHTML = '<div class="nexus-mermaid-empty">Rendering diagram…</div>';
      try {
        const svg = await renderMermaidSvg(source, theme, `nexus-prev-mmd-${i}`);
        if (cancelled()) return;
        el.innerHTML = `<div class="nexus-mermaid-svg">${svg}</div>`;
      } catch (e: unknown) {
        if (cancelled()) return;
        const msg = e instanceof Error ? e.message : "Could not render diagram";
        el.innerHTML = `<div class="nexus-mermaid-error">${escapeHtml(msg)}</div>`;
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Mermaid failed to load";
    for (const el of els) {
      el.innerHTML = `<div class="nexus-mermaid-error">${escapeHtml(msg)}</div>`;
    }
  }
}

async function renderMath(
  els: HTMLElement[],
  cancelled: () => boolean,
): Promise<void> {
  if (!els.length) return;
  try {
    const [mod] = await Promise.all([
      import("katex"),
      import("katex/dist/katex.min.css"),
    ]);
    if (cancelled()) return;
    for (const el of els) {
      const tex = (el.getAttribute("data-tex") || "").trim();
      if (!tex) {
        el.textContent = "";
        continue;
      }
      const block = el.getAttribute("data-type") === "math-block";
      el.innerHTML = "";
      mod.default.render(tex, el, {
        displayMode: block,
        throwOnError: false,
        output: "html",
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Math failed";
    for (const el of els) {
      el.innerHTML = `<span class="nexus-math-error">${escapeHtml(msg)}</span>`;
    }
  }
}

/** The whole catalog's answer for an embed the loaded window does not have. */
export type FindOutsideEmbed = (
  noteTarget: string,
) => Promise<
  | { kind: "note"; node: VaultNode; body: string }
  | { kind: "unread"; node: VaultNode }
  | { kind: "miss" }
  | { kind: "unsure" }
>;

const STILL_READING = '<p class="text-[var(--text-muted)]">Still reading the vault. This fills in when it can.</p>';

/** At most this many embeds per render are looked up and read from disk. */
export const OUTSIDE_EMBED_CAP = 12;

function missingEmbedHtml(target: string): string {
  return `<div class="nexus-embed-head"><span class="nexus-embed-missing">Missing embed ![[${escapeHtml(target || "note")}]]</span></div>`;
}

function fillEmbed(
  el: HTMLElement,
  note: VaultNode,
  body: string | null,
  target: string,
  activeNoteId: string | null,
): void {
  const parts = parseWikilinkInner(target);
  const sliceLabel = parts.blockId
    ? `#^${parts.blockId}`
    : parts.heading
      ? `#${parts.heading}`
      : "";
  const selfFull =
    note.id === activeNoteId && !parts.heading && !parts.blockId;
  let bodyHtml = "";
  if (body === null) {
    bodyHtml = STILL_READING;
  } else if (selfFull) {
    bodyHtml =
      '<p class="nexus-embed-missing">This note — add #Heading or #^block to embed a slice.</p>';
  } else {
    const sliced = sliceEmbedBody(body, parts.heading, parts.blockId);
    try {
      bodyHtml = markdownToHtml(
        sliced.body.replace(/!\[\[[^\]]+\]\]/g, ""),
      );
    } catch {
      bodyHtml = `<p>${escapeHtml((sliced.body || "").slice(0, 280))}</p>`;
    }
  }
  el.innerHTML = `
      <div class="nexus-embed-head">
        <button type="button" class="min-w-0 truncate font-medium hover:underline" data-open-note="${escapeHtml(note.id)}" data-jump-heading="${escapeHtml(parts.heading || "")}" data-jump-block="${escapeHtml(parts.blockId || "")}">${escapeHtml(noteTitle(note))}${sliceLabel ? ` <span class="text-[var(--text-muted)]">${escapeHtml(sliceLabel)}</span>` : ""}</button>
        <span class="ml-auto font-mono text-[10px] text-[var(--text-muted)]">![[${escapeHtml(target)}]]</span>
      </div>
      <div class="nexus-embed-body">${bodyHtml}</div>
    `;
}

async function renderEmbeds(
  els: HTMLElement[],
  nodes: Record<string, VaultNode>,
  activeNoteId: string | null,
  cancelled: () => boolean,
  findOutside?: FindOutsideEmbed,
): Promise<void> {
  const outside: { el: HTMLElement; target: string; noteTarget: string }[] = [];
  for (const el of els) {
    const target = (el.getAttribute("data-embed-target") || "").trim();
    const parts = parseWikilinkInner(target);
    const hit = parts.noteTarget
      ? resolveWikilink(parts.noteTarget, nodes)
      : activeNoteId
        ? nodes[activeNoteId]
        : null;
    const note = hit?.kind === "note" ? hit : null;
    // A loaded row whose body is not read yet goes the same way as a miss.
    const needsCatalog = findOutside && parts.noteTarget && (!note || note.content === undefined);
    if (note && !needsCatalog) {
      fillEmbed(el, note, note.content ?? "", target, activeNoteId);
    } else if (needsCatalog && outside.length < OUTSIDE_EMBED_CAP) {
      el.innerHTML = `<div class="nexus-embed-head"><span class="text-[var(--text-muted)]">Finding ![[${escapeHtml(target)}]]…</span></div>`;
      outside.push({ el, target, noteTarget: parts.noteTarget });
    } else if (needsCatalog) {
      el.innerHTML = `<div class="nexus-embed-head"><span class="text-[var(--text-muted)]">![[${escapeHtml(target)}]] is not shown here. Open the note to read it.</span></div>`;
    } else {
      el.innerHTML = missingEmbedHtml(target);
    }
  }
  for (const item of outside) {
    const found = await findOutside!(item.noteTarget).catch(() => ({ kind: "unsure" as const }));
    if (cancelled()) return;
    if (found.kind === "note") fillEmbed(item.el, found.node, found.body, item.target, activeNoteId);
    else if (found.kind === "unread") fillEmbed(item.el, found.node, null, item.target, activeNoteId);
    else if (found.kind === "miss") item.el.innerHTML = missingEmbedHtml(item.target);
    else {
      item.el.innerHTML = `<div class="nexus-embed-head"><span class="text-[var(--text-muted)]">Finding ![[${escapeHtml(item.target)}]]…</span></div><div class="nexus-embed-body">${STILL_READING}</div>`;
    }
  }
}

function renderQueries(
  els: HTMLElement[],
  nodes: Record<string, VaultNode>,
): void {
  for (const el of els) {
    const query = (el.getAttribute("data-query") || el.textContent || "").trim();
    const hits = query ? searchWithOps(nodes, query, 24) : [];
    const unsupportedHint = unsupportedSearchHint(parseSearchOps(query));
    const hintHtml = unsupportedHint
      ? `<p class="nexus-query-empty" data-testid="query-unsupported-hint">${escapeHtml(unsupportedHint)}</p>`
      : "";
    const list = hits.length
      ? `<ul class="space-y-1.5">${hits
          .map(
            (h) =>
              `<li><button type="button" class="flex w-full flex-col items-start rounded-md px-1.5 py-1 text-left hover:bg-white/[0.04]" data-open-note="${escapeHtml(h.noteId)}"><span class="text-[13px] font-medium">${escapeHtml(h.title)}</span><span class="line-clamp-2 text-[11px] text-[var(--text-muted)]">${escapeHtml(h.snippet)}</span></button></li>`,
          )
          .join("")}</ul>`
      : `<p class="nexus-query-empty">No matches. Try path:, folder:, file:, #tag, tag:, OR, or -exclude.</p>`;
    el.innerHTML = `
      <div class="nexus-query-head">
        <span class="min-w-0 truncate font-mono text-[12px]">${escapeHtml(query || "empty query")}</span>
        <span class="ml-auto text-[10px] text-[var(--text-muted)]">${hits.length} live</span>
      </div>
      <div class="nexus-query-body">${hintHtml}${list}</div>
    `;
  }
}

function promoteLeftoverMermaidFences(root: HTMLElement): void {
  root.querySelectorAll("pre code").forEach((code) => {
    const cls = `${code.className} ${code.getAttribute("class") || ""}`;
    const lang = (code.getAttribute("data-language") || "").toLowerCase();
    if (!/mermaid/.test(cls) && lang !== "mermaid") return;
    const src = (code.textContent || "").replace(/\n$/, "");
    const wrap = root.ownerDocument.createElement("div");
    wrap.setAttribute("data-type", "mermaid");
    wrap.setAttribute("data-source", src);
    wrap.className = "nexus-mermaid";
    const pre = code.closest("pre");
    (pre ?? code).replaceWith(wrap);
  });
}

export async function hydratePreviewSpecials(
  root: HTMLElement,
  theme: ThemeMode,
  nodes: Record<string, VaultNode>,
  activeNoteId: string | null,
  cancelled: () => boolean,
  findOutside?: FindOutsideEmbed,
): Promise<void> {
  promoteLeftoverMermaidFences(root);
  const mermaidEls = Array.from(
    root.querySelectorAll<HTMLElement>("[data-type='mermaid']"),
  );
  const mathEls = Array.from(
    root.querySelectorAll<HTMLElement>(
      "[data-type='math-block'], [data-type='math-inline']",
    ),
  );
  const embedEls = Array.from(
    root.querySelectorAll<HTMLElement>("[data-type='embed']"),
  );
  const queryEls = Array.from(
    root.querySelectorAll<HTMLElement>("[data-type='query']"),
  );

  const embeds = renderEmbeds(embedEls, nodes, activeNoteId, cancelled, findOutside);
  renderQueries(queryEls, nodes);
  await Promise.all([
    embeds,
    renderMermaid(mermaidEls, theme, cancelled),
    renderMath(mathEls, cancelled),
  ]);
}
