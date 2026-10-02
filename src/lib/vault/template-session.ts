/** Template picker state and the two ways a template is used. */

import { flushActiveEditors } from "@/lib/editor/flush";
import { requestInsertTemplate } from "@/lib/editor/insert-template";
import { requestInsertText } from "@/lib/editor/insert-text";
import { requestWriteFocus } from "@/lib/editor/write-intent";
import { isCanvasPath } from "./canvas";
import { useVaultStore } from "./store";
import {
  appendTemplate,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  fillBlankNote,
  formatDate,
  isBlankNote,
  renderTemplate,
  shiftDate,
  usesCarryover,
} from "./template-engine";
import {
  dailyNotePath,
  extractCarryForwardItems,
  getTemplate,
  NOTE_TEMPLATES,
  templateFormats,
  type NoteTemplateId,
} from "./templates";
import { noteTitle } from "./types";
import { findTemplateNamed, type VaultTemplate } from "./vault-templates";

export type TemplateMode = "insert" | "new";

export type TemplateRequest = {
  mode: TemplateMode;
  parentId: string | null;
  /** Skip the list and go straight to this vault template. */
  templateId?: string;
};

export type TemplateChoice =
  | { kind: "vault"; template: VaultTemplate }
  | { kind: "starter"; id: NoteTemplateId };

let request: TemplateRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function templateRequest(): TemplateRequest | null {
  return request;
}

export function subscribeTemplatePicker(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openTemplatePicker(
  mode: TemplateMode,
  opts: { parentId?: string | null; templateId?: string } = {},
): void {
  request = { mode, parentId: opts.parentId ?? null, templateId: opts.templateId };
  emit();
}

export function closeTemplatePicker(): void {
  if (!request) return;
  request = null;
  emit();
}

/** Built-ins offered next to vault templates. Daily and blank have their own commands. */
export const STARTER_IDS: NoteTemplateId[] = NOTE_TEMPLATES.map((t) => t.id).filter(
  (id) => id !== "blank" && id !== "daily",
);

export function choiceName(choice: TemplateChoice): string {
  return choice.kind === "vault" ? choice.template.name : getTemplate(choice.id).label;
}

export async function templateSource(choice: TemplateChoice): Promise<string | null> {
  if (choice.kind === "starter") return getTemplate(choice.id).source;
  const st = useVaultStore.getState();
  const node = st.nodes[choice.template.id];
  if (node?.kind === "note" && node.content !== undefined) return node.content;
  return st.ensureNoteBody(choice.template.id);
}

async function yesterdayCarryover(date: Date): Promise<string[]> {
  const st = useVaultStore.getState();
  const path = dailyNotePath(shiftDate(date, -1));
  const node = Object.values(st.nodes).find((n) => n.kind === "note" && n.path === path);
  if (!node) return [];
  const md = node.content !== undefined ? node.content : await st.ensureNoteBody(node.id);
  return typeof md === "string" ? extractCarryForwardItems(md) : [];
}

async function render(
  source: string,
  title: string,
  prompts: Record<string, string>,
): Promise<string> {
  const date = new Date();
  const carryover = usesCarryover(source) ? await yesterdayCarryover(date) : [];
  return renderTemplate(source, { title, date, prompts, carryover, ...templateFormats() });
}

/** Insert at the caret of the open note. An empty note takes the template whole. */
export async function insertTemplate(
  source: string,
  prompts: Record<string, string>,
): Promise<boolean> {
  const st = useVaultStore.getState();
  const id = st.activeNoteId;
  const node = id ? st.nodes[id] : null;
  if (!id || !node || node.kind !== "note" || isCanvasPath(node.path)) {
    st.setToast("Open a note to insert a template");
    return false;
  }
  flushActiveEditors();
  const live = useVaultStore.getState().nodes[id];
  const body = live?.content !== undefined ? live.content : await st.ensureNoteBody(id);
  if (typeof body !== "string") {
    st.setToast("This note is still loading");
    return false;
  }
  const rendered = await render(source, noteTitle(node), prompts);
  if (isBlankNote(body)) {
    requestWriteFocus(node.path);
    st.updateNoteContent(id, fillBlankNote(body, rendered), { source: true });
    return true;
  }
  if (requestInsertTemplate(id, rendered)) return true;
  st.updateNoteContent(id, appendTemplate(body, rendered), { source: true });
  return true;
}

export async function newNoteFromTemplate(
  choice: TemplateChoice,
  source: string,
  title: string,
  prompts: Record<string, string>,
  parentId: string | null,
): Promise<string | null> {
  const st = useVaultStore.getState();
  const name = title.trim() || "Untitled";
  let id: string | null;
  if (choice.kind === "starter") {
    id = (await st.createFromTemplate(choice.id, parentId, name)) ?? null;
  } else {
    const rendered = await render(source, name, prompts);
    id = st.createNote(parentId, name, { content: rendered, raw: true });
  }
  const path = id ? useVaultStore.getState().nodes[id]?.path : null;
  if (path) requestWriteFocus(path);
  return id;
}

/** Today's date or the time at the caret, in the formats from Template settings. */
export function insertCurrentMoment(kind: "date" | "time"): boolean {
  const st = useVaultStore.getState();
  const id = st.activeNoteId;
  const node = id ? st.nodes[id] : null;
  if (!id || !node || node.kind !== "note" || isCanvasPath(node.path)) {
    st.setToast(`Open a note to insert the ${kind}`);
    return false;
  }
  const { dateFormat, timeFormat } = templateFormats();
  const format =
    kind === "date" ? dateFormat?.trim() || DEFAULT_DATE_FORMAT : timeFormat?.trim() || DEFAULT_TIME_FORMAT;
  if (requestInsertText(id, formatDate(new Date(), format))) return true;
  st.setToast(`Switch to editing to insert the ${kind}`);
  return false;
}

/** New meeting / idea / project: a vault template with the same name wins. */
export async function newNoteFromStarter(
  id: NoteTemplateId,
  parentId: string | null = null,
): Promise<void> {
  const st = useVaultStore.getState();
  if (id === "daily" || id === "blank") {
    await st.createFromTemplate(id, parentId);
    return;
  }
  const own = findTemplateNamed(await st.loadVaultTemplates(), [getTemplate(id).label]);
  if (own) {
    openTemplatePicker("new", { parentId, templateId: own.id });
    return;
  }
  await st.createFromTemplate(id, parentId);
}
