import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FilePlus2, FileText, LayoutTemplate, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { openSettingsSection } from "@/lib/prefs/settings-section";
import { useVaultStore } from "@/lib/vault/store";
import { getTemplate } from "@/lib/vault/templates";
import { templatePrompts } from "@/lib/vault/template-engine";
import {
  findTemplateNamed,
  listVaultTemplates,
  normalizeTemplateFolder,
  templatesFolderNode,
} from "@/lib/vault/vault-templates";
import {
  choiceName,
  closeTemplatePicker,
  insertTemplate,
  newNoteFromTemplate,
  STARTER_IDS,
  subscribeTemplatePicker,
  templateRequest,
  templateSource,
  type TemplateChoice,
} from "@/lib/vault/template-session";

const SAMPLE_TEMPLATE = [
  "---",
  "tags: meeting",
  "---",
  "# {{title}}",
  "",
  "**Date:** {{date:dddd, MMMM D}} at {{time}}",
  "",
  "**With:** {{prompt:Attendees}}",
  "",
  "## Notes",
  "",
  "",
  "## Follow up by {{date+7}}",
  "",
  "- [ ] ",
  "",
].join("\n");

const SYNTAX =
  "{{title}} {{date}} {{time}} {{date:YYYY-MM-DD}} {{time:h:mm A}} {{yesterday}} {{date+7}} {{prompt:Name}} {{carryover}}";

type Fill = { choice: TemplateChoice; source: string; prompts: string[] };

export function TemplatePicker() {
  const request = useSyncExternalStore(subscribeTemplatePicker, templateRequest, templateRequest);
  if (!request) return null;
  return <TemplatePickerOpen key={`${request.mode}:${request.parentId}:${request.templateId}`} />;
}

function TemplatePickerOpen() {
  const request = templateRequest()!;
  const mode = request.mode;
  const nodes = useVaultStore((s) => s.nodes);
  const folder = normalizeTemplateFolder(usePrefsStore((s) => s.templateFolder));
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [fill, setFill] = useState<Fill | null>(null);
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useVaultStore.getState().loadVaultTemplates();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeTemplatePicker();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const templates = useMemo(() => listVaultTemplates(nodes, folder), [nodes, folder]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const choices: TemplateChoice[] = [
      ...templates.map((template) => ({ kind: "vault" as const, template })),
      ...STARTER_IDS.filter((id) => !findTemplateNamed(templates, [getTemplate(id).label])).map(
        (id) => ({ kind: "starter" as const, id }),
      ),
    ];
    if (!q) return choices;
    return choices.filter((c) =>
      (c.kind === "vault" ? `${c.template.name} ${c.template.path}` : choiceName(c))
        .toLowerCase()
        .includes(q),
    );
  }, [templates, query]);

  useEffect(() => setCursor(0), [query]);

  // Search closing hands focus back to the note a frame later. Take it back.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root || root.contains(document.activeElement)) return;
      root.querySelector<HTMLInputElement>("input")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [fill]);

  const choose = async (choice: TemplateChoice) => {
    if (busy) return;
    setBusy(true);
    const source = await templateSource(choice);
    setBusy(false);
    if (source == null) {
      useVaultStore.getState().setToast(`Could not read ${choiceName(choice)}`);
      return;
    }
    const prompts = templatePrompts(source);
    if (mode === "insert" && prompts.length === 0) {
      closeTemplatePicker();
      await insertTemplate(source, {});
      return;
    }
    setAnswers({});
    setTitle(choice.kind === "starter" ? getTemplate(choice.id).defaultTitle : "Untitled");
    setFill({ choice, source, prompts });
  };

  const directId = request.templateId;
  const direct = directId ? templates.find((t) => t.id === directId) : undefined;
  const startedDirect = useRef(false);
  useEffect(() => {
    if (!direct || startedDirect.current) return;
    startedDirect.current = true;
    void choose({ kind: "vault", template: direct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct]);

  const submit = async () => {
    if (!fill || busy) return;
    setBusy(true);
    closeTemplatePicker();
    if (mode === "insert") await insertTemplate(fill.source, answers);
    else await newNoteFromTemplate(fill.choice, fill.source, title, answers, request.parentId);
  };

  const createSample = () => {
    const st = useVaultStore.getState();
    const folderId = templatesFolderNode(st.nodes, folder)?.id ?? st.ensureFolderPath(folder);
    closeTemplatePicker();
    st.createNote(folderId, "New template", { content: SAMPLE_TEMPLATE, raw: true });
  };

  const openSettings = () => {
    closeTemplatePicker();
    openSettingsSection("templates");
  };

  const heading = mode === "insert" ? "Insert template" : "New note from template";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-[var(--overlay,rgba(0,0,0,0.65))] px-4 pt-[12vh]"
      onMouseDown={closeTemplatePicker}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        data-testid="template-picker"
        className="w-full max-w-xl overflow-hidden rounded-[16px] border border-[var(--border-strong)] bg-[var(--panel-solid)] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {fill ? (
          <form
            className="p-4"
            data-testid="template-fill"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{heading}</p>
            <h2 className="mt-0.5 truncate text-[14px] font-semibold text-[var(--text-primary)]">
              {choiceName(fill.choice)}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {mode === "new" ? (
                <Field label="Title" value={title} onChange={setTitle} autoFocus />
              ) : null}
              {fill.prompts.map((label, i) => (
                <Field
                  key={label}
                  label={label}
                  value={answers[label] ?? ""}
                  onChange={(v) => setAnswers((a) => ({ ...a, [label]: v }))}
                  autoFocus={mode === "insert" && i === 0}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => (direct ? closeTemplatePicker() : setFill(null))}
              >
                {direct ? "Cancel" : "Back"}
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {mode === "insert" ? "Insert" : "Create"}
              </button>
            </div>
          </form>
        ) : direct ? null : (
          <>
            <input
              autoFocus
              value={query}
              data-testid="template-picker-input"
              placeholder={mode === "insert" ? "Insert template…" : "New note from template…"}
              className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-[14px] outline-none"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((i) => Math.min(rows.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const row = rows[cursor] ?? rows[0];
                  if (row) void choose(row);
                }
              }}
            />
            {templates.length === 0 ? (
              <div className="border-b border-[var(--border)] px-4 py-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                <p>
                  No templates yet. Any note in the{" "}
                  <span className="font-medium text-[var(--text-primary)]">{folder}</span> folder
                  shows up here. A template named Daily shapes new daily notes. Dates and
                  times take a format after a colon. The folder and default formats are in
                  Template settings.
                </p>
                <p className="mt-1.5 font-mono text-[11px] text-[var(--text-muted)]">{SYNTAX}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" className="ghost-btn" onClick={createSample}>
                    <FilePlus2 size={13} /> Create a template
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    data-testid="template-picker-settings"
                    onClick={openSettings}
                  >
                    <Settings size={13} /> Template settings
                  </button>
                </div>
              </div>
            ) : null}
            <ul className="max-h-80 overflow-y-auto py-1.5">
              {rows.length === 0 ? (
                <li className="px-4 py-3 text-[12px] text-[var(--text-muted)]">No templates match.</li>
              ) : (
                rows.map((choice, index) => {
                  const first = index === 0 || rows[index - 1].kind !== choice.kind;
                  return (
                    <li key={choice.kind === "vault" ? choice.template.id : choice.id}>
                      {first ? (
                        <p className="px-4 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          {choice.kind === "vault" ? folder : "Built-in"}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        data-testid="template-picker-row"
                        data-selected={index === cursor ? "1" : "0"}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-4 py-1.5 text-left",
                          index === cursor
                            ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
                            : "hover:bg-white/[0.04]",
                        )}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => void choose(choice)}
                      >
                        <span className="text-[var(--accent)]">
                          {choice.kind === "vault" ? <LayoutTemplate size={14} /> : <FileText size={14} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{choiceName(choice)}</span>
                          <span className="block truncate text-[11px] text-[var(--text-muted)]">
                            {choice.kind === "vault"
                              ? choice.template.path
                              : getTemplate(choice.id).description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        className="field w-full"
        value={value}
        spellCheck={false}
        autoFocus={autoFocus}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
