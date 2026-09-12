/**
 * Hydrate mermaid / math / embeds / live queries in static Source preview HTML.
 * Visual mode uses TipTap node views; Preview/split only has sanitized HTML.
 */

import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { sliceEmbedBody } from "@/lib/markdown/note-slice";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { searchWithOps } from "@/lib/search/query-ops";
import { noteTitle } from "@/lib/vault/types";
import type { VaultNode } from "@/lib/vault/types";
import { resolveTheme, type ThemeMode } from "@/lib/prefs/preferences";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function renderMermaid(
  els: HTMLElement[],
  theme: ThemeMode,
  cancelled: () => boolean,
): Promise<void> {
  if (!els.length) return;
  try {
    const mod = await import("mermaid");
    if (cancelled()) return;
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: resolveTheme(theme) === "light" ? "default" : "dark",
      fontFamily: "inherit",
    });
    for (let i = 0; i < els.length; i++) {
      const el = els[i]!;
      const source = (el.getAttribute("data-source") || el.textContent || "").trim();
      if (!source) {
        el.innerHTML =
          '<div class="nexus-mermaid-empty">Empty mermaid diagram</div>';
        continue;
      }
      const id = `nexus-prev-mmd-${Math.abs(hash(source))}-${i}-${Date.now().toString(36)}`;
      try {
        const { svg } = await mermaid.render(id, source);
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

function renderEmbeds(
  els: HTMLElement[],
  nodes: Record<string, VaultNode>,
  activeNoteId: string | null,
): void {
  for (const el of els) {
    const target = (el.getAttribute("data-embed-target") || "").trim();
    const parts = parseWikilinkInner(target);
    const hit = parts.noteTarget
      ? resolveWikilink(parts.noteTarget, nodes)
      : activeNoteId
        ? nodes[activeNoteId]
        : null;
    const note = hit?.kind === "note" ? hit : null;
    const sliceLabel = parts.blockId
      ? `#^${parts.blockId}`
      : parts.heading
        ? `#${parts.heading}`
        : "";
    if (!note) {
      el.innerHTML = `<div class="nexus-embed-head"><span class="nexus-embed-missing">Missing embed ![[${escapeHtml(target || "note")}]]</span></div>`;
      continue;
    }
    const selfFull =
      note.id === activeNoteId && !parts.heading && !parts.blockId;
    let bodyHtml = "";
    if (selfFull) {
      bodyHtml =
        '<p class="nexus-embed-missing">This note — add #Heading or #^block to embed a slice.</p>';
    } else {
      const sliced = sliceEmbedBody(
        note.content ?? "",
        parts.heading,
        parts.blockId,
      );
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
}

function renderQueries(
  els: HTMLElement[],
  nodes: Record<string, VaultNode>,
): void {
  for (const el of els) {
    const query = (el.getAttribute("data-query") || el.textContent || "").trim();
    const hits = query ? searchWithOps(nodes, query, 24) : [];
    const list = hits.length
      ? `<ul class="space-y-1.5">${hits
          .map(
            (h) =>
              `<li><button type="button" class="flex w-full flex-col items-start rounded-md px-1.5 py-1 text-left hover:bg-white/[0.04]" data-open-note="${escapeHtml(h.noteId)}"><span class="text-[13px] font-medium">${escapeHtml(h.title)}</span><span class="line-clamp-2 text-[11px] text-[var(--text-muted)]">${escapeHtml(h.snippet)}</span></button></li>`,
          )
          .join("")}</ul>`
      : `<p class="nexus-query-empty">No matches. Try path:, folder:, file:, #tag, or -exclude.</p>`;
    el.innerHTML = `
      <div class="nexus-query-head">
        <span class="min-w-0 truncate font-mono text-[12px]">${escapeHtml(query || "empty query")}</span>
        <span class="ml-auto text-[10px] text-[var(--text-muted)]">${hits.length} live</span>
      </div>
      <div class="nexus-query-body">${list}</div>
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

  renderEmbeds(embedEls, nodes, activeNoteId);
  renderQueries(queryEls, nodes);
  await Promise.all([
    renderMermaid(mermaidEls, theme, cancelled),
    renderMath(mathEls, cancelled),
  ]);
}
