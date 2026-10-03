/**
 * Hydrate mermaid / math / embeds / live queries in static Source preview HTML.
 * Visual mode uses TipTap node views; Preview/split only has sanitized HTML.
 */

import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { sliceEmbedBody } from "@/lib/markdown/note-slice";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { parseSearchOps, searchWithOps, unsupportedSearchHint } from "@/lib/search/query-ops";
import {
  NEXUS_QUERY_CAP,
  queryColumnLabel,
  runNexusQuery,
  type NexusQueryModel,
  type NexusQueryRow,
} from "@/lib/vault/nexus-query";
import { problemExcerpt } from "@/lib/vault/query-expr";
import { loadTagExtras } from "@/lib/vault/nexus-query-tags";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle, type VaultNode } from "@/lib/vault/types";
import type { ThemeMode } from "@/lib/prefs/preferences";
import { renderMermaidSvg } from "@/lib/editor/render-mermaid";
import { friendlyDay, localToday } from "@/lib/tasks/dates";
import { priorityMarker, tasksFromLines, tasksInNote, type VaultTask } from "@/lib/tasks/extract";
import { isOpen } from "@/lib/tasks/syntax";
import { currentTasks, whenTasksReady } from "@/lib/tasks/task-index";
import { TASKS_BLOCK_FOOTER, blockQuery, planBlocked, type TasksBlockPlan } from "@/lib/tasks/tasks-block";

/** A query block whose first word is TASK lists task lines, not notes. */
export const TASK_QUERY_HEAD = /^\s*tasks?\b/i;

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

function nexusRowButton(id: string, title: string, rest: string): string {
  return `<button type="button" data-testid="nexus-query-row" data-open-note="${escapeHtml(id)}"><span>${escapeHtml(title)}</span>${rest}</button>`;
}

function taskRowHtml(task: VaultTask, today: string): string {
  const open = isOpen(task.status);
  const mark = task.status === "done" ? "✓" : task.status === "cancelled" ? "–" : task.status === "doing" ? "•" : "";
  const checked = task.status === "done" ? "true" : task.status === "doing" ? "mixed" : "false";
  const ref = `data-task-note="${escapeHtml(task.noteId)}" data-task-line="${task.line}" data-task-raw="${escapeHtml(task.raw)}" data-task-title="${escapeHtml(task.title)}"`;
  const meta: string[] = [];
  if (task.due) {
    const tone = open && task.due < today ? " is-late" : open && task.due === today ? " is-today" : "";
    meta.push(`<span class="nexus-query-task-due${tone}" data-testid="task-due">📅 ${escapeHtml(friendlyDay(task.due, today))}</span>`);
  }
  if (task.scheduled) meta.push(`<span>⏳ ${escapeHtml(friendlyDay(task.scheduled, today))}</span>`);
  if (task.start && task.start > today) meta.push(`<span>🛫 ${escapeHtml(friendlyDay(task.start, today))}</span>`);
  if (task.recurrence) meta.push(`<span data-testid="tasks-recurrence">🔁 ${escapeHtml(task.recurrence)}</span>`);
  if (task.status === "done" && task.done) meta.push(`<span>✅ ${escapeHtml(friendlyDay(task.done, today))}</span>`);
  meta.push(`<span class="nexus-query-task-note" title="${escapeHtml(task.path)}">${escapeHtml(task.title)}</span>`);
  const problems = task.problems
    .map((problem) => `<span class="nexus-query-task-problem" data-testid="task-problem">⚠ ${escapeHtml(problem.message)}</span>`)
    .join("");
  const priority = task.priority !== "none" ? `<span data-testid="tasks-priority">${priorityMarker(task.priority)}</span> ` : "";
  return `<div class="nexus-query-task" data-testid="task-item" data-status="${task.status}">
    <button type="button" role="checkbox" aria-checked="${checked}" aria-label="${escapeHtml(`${open ? "Mark done" : "Mark not done"}: ${task.text}`)}" class="nexus-query-task-box" data-testid="tasks-complete" data-task-toggle ${ref}>${mark}</button>
    <div class="nexus-query-task-main">
      <button type="button" class="nexus-query-task-text${open ? "" : " is-closed"}" data-testid="tasks-row" title="Open in note" data-task-open="${escapeHtml(task.noteId)}" data-task-text="${escapeHtml(task.text)}">${priority}${escapeHtml(task.text || "(empty task)")}</button>
      <div class="nexus-query-task-meta">${meta.join("")}</div>${problems}
    </div>
  </div>`;
}

function nexusTaskBody(model: NexusQueryModel, waiting: boolean, none = "No tasks match. Loosen WHERE, or check the FROM folder or tag."): string {
  const rows = model.tasks ?? [];
  if (!rows.length) {
    const text = waiting ? "Reading tasks…" : none;
    return `<p class="nexus-query-empty" data-testid="nexus-query-empty">${escapeHtml(text)}</p>`;
  }
  const today = localToday();
  const items = rows
    .map((row, index) => {
      const header = row.group != null && row.group !== rows[index - 1]?.group
        ? `<div class="nexus-query-task-group" data-testid="nexus-query-group" data-group="${escapeHtml(row.group)}">${escapeHtml(row.group)}</div>`
        : "";
      return header + taskRowHtml(row.task, today);
    })
    .join("");
  return `<div class="nexus-query-tasks" data-testid="nexus-query-tasks">${items}</div>`;
}

function nexusQueryBody(query: string, model: NexusQueryModel, waiting = false): string {
  const bits: string[] = [];
  const muted = (text: string, testid?: string) =>
    `<p class="nexus-query-empty"${testid ? ` data-testid="${testid}"` : ""}>${escapeHtml(text)}</p>`;
  if (model.help) bits.push(muted(`${model.help}. ${model.footer}`, "nexus-query-empty"));
  if (model.error) {
    const excerpt = model.problem ? problemExcerpt(query, model.problem) : null;
    const clause = model.problem ? `<span class="nexus-query-clause">${escapeHtml(model.problem.clause)}</span>` : "";
    const mark = excerpt
      ? `<span class="nexus-query-excerpt" data-testid="nexus-query-excerpt">${escapeHtml(excerpt.before)}<mark>${escapeHtml(excerpt.bad)}</mark>${escapeHtml(excerpt.after)}</span>`
      : "";
    bits.push(`<div class="nexus-query-problem" data-testid="nexus-query-error"><p>${clause}${escapeHtml(model.error)}</p>${mark}</div>`);
  }
  if (model.fieldNote) bits.push(muted(model.fieldNote, "nexus-query-field-note"));
  if (model.mode === "task" && !model.help && !model.error) bits.push(nexusTaskBody(model, waiting));
  if (!model.help && !model.error && model.mode !== "task" && model.rows.length === 0) {
    const empty = model.tagsIncomplete
      ? model.scanNote || "Couldn't read every tag from the index."
      : "No notes match.";
    bits.push(muted(empty, "nexus-query-empty"));
  }
  const showTitle = !model.withoutId;
  const showPath = model.showPath ?? true;
  const labels = model.columns ?? (model.rows[0]?.fields ?? []).map((field) => queryColumnLabel(field.name));
  const groupOf = (r: NexusQueryRow, index: number) =>
    r.group != null && r.group !== model.rows[index - 1]?.group ? r.group : null;
  const nestedList = (r: NexusQueryRow) =>
    `<ul data-testid="nexus-query-nested">${(r.rows ?? [])
      .map((child) => `<li>${nexusRowButton(child.id, child.title, ` <span>${escapeHtml(child.path)}</span>`)}</li>`)
      .join("")}</ul>`;
  if (model.mode === "table" && model.rows.length) {
    const head = `<tr>${showTitle ? `<th>${model.dialect ? "File" : "Title"}</th>` : ""}${showPath ? "<th>Path</th>" : ""}${labels
      .map((label) => `<th>${escapeHtml(label)}</th>`)
      .join("")}</tr>`;
    const body = model.rows
      .map((r, index) => {
        const span = (showTitle ? 1 : 0) + (showPath ? 1 : 0) + r.fields.length;
        const group = groupOf(r, index);
        const header = group != null
          ? `<tr data-testid="nexus-query-group" data-group="${escapeHtml(group)}"><td colspan="${span}">${escapeHtml(group)}</td></tr>`
          : "";
        if (r.rows) return `${header}<tr><td colspan="${span}">${nestedList(r)}</td></tr>`;
        const cells = r.fields.map((field) => `<td data-testid="nexus-query-field">${escapeHtml(field.value)}</td>`).join("");
        const title = showTitle ? `<td>${nexusRowButton(r.id, r.title, r.link ? ` <span>→ ${escapeHtml(r.link)}</span>` : "")}</td>` : "";
        const path = showPath ? `<td>${escapeHtml(r.path)}</td>` : "";
        const attrs = showTitle ? "" : ` data-testid="nexus-query-row" data-open-note="${escapeHtml(r.id)}"`;
        return `${header}<tr${attrs}>${title}${path}${cells}</tr>`;
      })
      .join("");
    bits.push(`<table class="nexus-query-table">${head}${body}</table>`);
  }
  if (model.mode === "list" && model.rows.length) {
    const items = model.rows
      .map((r, index) => {
        const group = groupOf(r, index);
        const header = group != null
          ? `<li data-testid="nexus-query-group" data-group="${escapeHtml(group)}">${escapeHtml(group)}</li>`
          : "";
        if (r.rows) return `${header}<li>${nestedList(r)}</li>`;
        const detail = model.dialect
          ? r.fields[0] ? ` <span data-testid="nexus-query-field">${escapeHtml(r.fields[0].value)}</span>` : ""
          : `<span>${escapeHtml(r.path)}</span>`;
        return `${header}<li>${nexusRowButton(r.id, r.title, `${detail}${r.link ? `<span>${escapeHtml(r.link)}</span>` : ""}`)}</li>`;
      })
      .join("");
    bits.push(`<ul>${items}</ul>`);
  }
  if (model.mode === "cards" && model.rows.length) {
    const cards = model.rows
      .map((r, index) => {
        const group = groupOf(r, index);
        const header = group != null
          ? `<div class="nexus-query-card-group" data-testid="nexus-query-group" data-group="${escapeHtml(group)}">${escapeHtml(group)}</div>`
          : "";
        const fields = r.fields
          .map(
            (field, i) =>
              `<span class="nexus-query-card-field" data-testid="nexus-query-field"><span>${escapeHtml(labels[i] ?? field.name)}</span><span>${escapeHtml(field.value)}</span></span>`,
          )
          .join("");
        const title = showTitle ? `<span class="nexus-query-card-title">${escapeHtml(r.title)}</span>` : "";
        return `${header}<button type="button" class="nexus-query-card" data-testid="nexus-query-row" data-open-note="${escapeHtml(r.id)}">${title}${fields}</button>`;
      })
      .join("");
    bits.push(`<div class="nexus-query-cards" data-testid="nexus-query-cards">${cards}</div>`);
  }
  if (model.truncated) {
    bits.push(
      muted(
        model.dialect
          ? `Showing the first ${model.cap ?? model.rows.length} of ${model.total ?? model.rows.length}. Add LIMIT or narrow FROM.`
          : `Stopped at ${NEXUS_QUERY_CAP}.`,
        "nexus-query-cap",
      ),
    );
  }
  if (model.scanNote && model.rows.length > 0) bits.push(muted(model.scanNote));
  bits.push(
    `<details class="nexus-query-syntax"><summary>How to write a query</summary><p data-testid="nexus-query-footer">${escapeHtml(model.footer)}</p></details>`,
  );
  return bits.join("");
}

async function renderNexusQueries(
  els: HTMLElement[],
  nodes: Record<string, VaultNode>,
  hostId: string | null,
): Promise<void> {
  for (const el of els) {
    const written = (el.getAttribute("data-query") || "").trim();
    const fence = el.getAttribute("data-lang") || "nexus-query";
    const live = useVaultStore.getState().nodes || nodes;
    const hostPath = hostId ? (live[hostId]?.path ?? null) : null;
    const { query, plan } = blockQuery(written, fence, localToday(), hostPath ? { path: hostPath } : null);
    const blocked = planBlocked(plan);
    const taskQuery = TASK_QUERY_HEAD.test(query);
    if (taskQuery) el.setAttribute("data-task-query", "");
    const extras = await loadTagExtras(query);
    const index = taskQuery && !blocked ? await whenTasksReady() : null;
    const model = runNexusQuery(query, live, extras, Date.now(), hostId, index?.tasks ?? null);
    const shown = model.tasks ? model.tasks.length : model.rows.length;
    const total = model.total ?? shown;
    const noun = model.mode === "task" ? (total === 1 ? "task" : "tasks") : total === 1 ? "note" : "notes";
    const count = model.mode && !model.error && !blocked ? `${total} ${noun} · ` : "";
    const head = written.replace(/\s*\n\s*/g, " · ") || (plan ? "Every task" : fence);
    const body = plan ? tasksBlockBody(plan, model, index?.state.phase === "scanning") : nexusQueryBody(query, model, index?.state.phase === "scanning");
    el.innerHTML = `
      <div class="nexus-query-head"><span class="min-w-0 truncate font-mono text-[12px]">${escapeHtml(head)}</span><span class="ml-auto text-[10px] text-[var(--text-muted)]">${escapeHtml(count + fence)}</span></div>
      <div class="nexus-query-body">${body}</div>
    `;
  }
}

function tasksBlockBody(plan: TasksBlockPlan, model: NexusQueryModel, waiting: boolean): string {
  const bits = plan.problems.map((problem) => {
    const rewrite = problem.rewrite !== null
      ? `<span class="nexus-query-excerpt" data-testid="tasks-block-rewrite">Use: <mark>${escapeHtml(problem.rewrite)}</mark></span>`
      : "";
    return `<div class="${problem.blocking ? "nexus-query-problem" : "nexus-tasks-block-note"}" data-testid="tasks-block-problem" data-line="${problem.line + 1}"${problem.blocking ? ' role="alert"' : ""}><p><span class="nexus-query-clause">line ${problem.line + 1}</span><code>${escapeHtml(problem.text)}</code> ${escapeHtml(problem.message)}</p>${rewrite}</div>`;
  });
  if (!planBlocked(plan)) {
    if (plan.explain) bits.push(`<pre class="nexus-tasks-block-explain" data-testid="tasks-block-explain">${escapeHtml(plan.query)}</pre>`);
    if (model.error) bits.push(`<div class="nexus-query-problem" data-testid="nexus-query-error"><p>${escapeHtml(model.error)}</p></div>`);
    else bits.push(nexusTaskBody(model, waiting, "No tasks match these lines."));
    if (model.truncated) {
      bits.push(`<p class="nexus-query-empty" data-testid="nexus-query-cap">Showing the first ${model.cap ?? 0} of ${model.total ?? 0}. Add a limit or a path line.</p>`);
    }
  }
  bits.push(
    `<details class="nexus-query-syntax"><summary>Lines a tasks block reads</summary><p data-testid="nexus-query-footer">${escapeHtml(TASKS_BLOCK_FOOTER)}</p></details>`,
  );
  return bits.join("");
}

/** Letters and digits only, so rendered text and its Markdown line compare equal. */
function textKey(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase().slice(0, 16);
}

function boxText(box: HTMLInputElement): string {
  const li = box.closest("li");
  if (!li) return "";
  const head = li.getAttribute("data-type") === "taskItem" ? li.querySelector(":scope > div > p") : box.parentElement;
  if (!head) return "";
  const clone = head.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("ul, ol").forEach((n) => n.remove());
  return clone.textContent ?? "";
}

function lineText(task: VaultTask): string {
  return task.raw
    .replace(/^[\s>]*(?:[-*+]|\d{1,9}[.)])\s+\[[^\]]\]\s*/, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/**
 * Let the note's own checkboxes be ticked in Preview. Each box is paired with
 * the next task line that has the same status and starts with the same words;
 * a box with no such line stays read-only, so a box never writes a line it
 * does not show.
 */
export function wirePreviewTaskBoxes(root: HTMLElement, body: string, noteId: string | null): void {
  if (!noteId) return;
  const boxes = Array.from(
    root.querySelectorAll<HTMLInputElement>(
      "li > input[type='checkbox'], li > p:first-child > input[type='checkbox'], li[data-type='taskItem'] > label > input[type='checkbox']",
    ),
  ).filter(
    (box) => !box.closest("[data-type='embed'], [data-type='nexus-query'], [data-type='query']"),
  );
  if (!boxes.length) return;
  const node = useVaultStore.getState().nodes[noteId];
  const title = node ? noteTitle(node) : "";
  const tasks = tasksInNote({ id: noteId, path: node?.path ?? "", title, body });
  let next = 0;
  for (const box of boxes) {
    const li = box.closest("li");
    const checked = box.checked || box.hasAttribute("checked");
    const symbol = li?.getAttribute("data-status") || (checked ? "x" : " ");
    const key = textKey(boxText(box));
    let found = -1;
    for (let j = next; j < tasks.length; j += 1) {
      const task = tasks[j] as VaultTask;
      if (task.symbol.toLowerCase() === symbol.toLowerCase() && textKey(lineText(task)) === key) {
        found = j;
        break;
      }
    }
    if (found < 0) continue;
    next = found + 1;
    const task = tasks[found] as VaultTask;
    box.disabled = false;
    box.setAttribute("data-task-toggle", "");
    box.setAttribute("data-task-note", noteId);
    box.setAttribute("data-task-line", String(task.line));
    box.setAttribute("data-task-raw", task.raw);
    box.setAttribute("data-task-title", title);
    box.setAttribute("aria-label", `${isOpen(task.status) ? "Mark done" : "Mark not done"}: ${task.text}`);
    box.classList.add("nexus-preview-task-box");
  }
}

const LINE_BOX = ":scope > input[data-task-toggle], :scope > p:first-child > input[data-task-toggle], :scope > label > input[data-task-toggle]";

/**
 * The task under a right-click in Preview: a row of a TASK block, or a note
 * line whose box was paired with its source line. Null anywhere else.
 */
export function previewTaskAt(target: Element): VaultTask | null {
  let box: Element | null = target.closest("[data-task-toggle]");
  if (!box) box = target.closest(".nexus-query-task")?.querySelector("[data-task-toggle]") ?? null;
  if (!box) {
    const li = target.closest("li");
    if (li && !li.closest("[data-type='nexus-query'], [data-type='embed']")) box = li.querySelector(LINE_BOX);
  }
  if (!(box instanceof HTMLElement)) return null;
  const noteId = box.getAttribute("data-task-note") || "";
  const line = Number(box.getAttribute("data-task-line"));
  const raw = box.getAttribute("data-task-raw") || "";
  if (!noteId || !Number.isFinite(line) || !raw) return null;
  const known = currentTasks().tasks.find((task) => task.noteId === noteId && task.line === line && task.raw === raw);
  if (known) return known;
  const node = useVaultStore.getState().nodes[noteId];
  const title = box.getAttribute("data-task-title") || (node ? noteTitle(node) : "");
  return tasksFromLines({ id: noteId, path: node?.path ?? "", title }, [{ line, raw }], null)[0] ?? null;
}

/** Re-run only the TASK blocks in a preview, after the vault's tasks change. */
export async function refreshTaskQueries(root: HTMLElement, hostId: string | null): Promise<void> {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-type='nexus-query'][data-task-query]"));
  if (els.length) await renderNexusQueries(els, useVaultStore.getState().nodes, hostId);
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
  const nexusQueryEls = Array.from(
    root.querySelectorAll<HTMLElement>("[data-type='nexus-query']"),
  );

  const embeds = renderEmbeds(embedEls, nodes, activeNoteId, cancelled, findOutside);
  renderQueries(queryEls, nodes);
  const nexus = renderNexusQueries(nexusQueryEls, nodes, activeNoteId);
  await Promise.all([
    embeds,
    nexus,
    renderMermaid(mermaidEls, theme, cancelled),
    renderMath(mathEls, cancelled),
  ]);
}
