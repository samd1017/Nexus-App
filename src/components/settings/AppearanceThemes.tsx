import { useEffect, useId } from "react";
import { flushSync } from "react-dom";
import { FilePlus2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_CHOICES, usePrefsStore } from "@/lib/prefs/preferences";
import { useCssSnippetStore, type LoadedSnippet } from "@/lib/appearance/snippets";
import { MIN_READABLE_CONTRAST, snippetSourceLabel } from "@/lib/appearance/css-snippets";

export function ThemePicker() {
  const theme = usePrefsStore((s) => s.theme ?? "dark");
  const updatePrefs = usePrefsStore((s) => s.updatePrefs);
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Theme" data-testid="settings-theme-picker">
      {THEME_CHOICES.map((choice) => {
        const selected = theme === choice.id;
        const [page, panel, text, border] = choice.swatch;
        return (
          <button
            key={choice.id}
            type="button"
            aria-pressed={selected}
            data-testid="settings-theme"
            data-theme-choice={choice.id}
            onClick={() => flushSync(() => updatePrefs({ theme: choice.id }))}
            className={cn(
              "flex min-h-[4.5rem] flex-col gap-1.5 rounded-[12px] border p-2 text-left transition",
              selected
                ? "border-[var(--accent)] bg-[var(--accent-dim)] shadow-[inset_0_0_0_1px_var(--accent)]"
                : "border-[var(--border)] bg-[var(--fill-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--fill-hover)]",
            )}
          >
            <span
              aria-hidden
              className="flex h-7 w-full items-center gap-1 overflow-hidden rounded-[7px] px-1.5"
              style={{ background: page, boxShadow: `inset 0 0 0 1px ${border}` }}
            >
              <span className="h-4 w-5 rounded-[4px]" style={{ background: panel, boxShadow: `inset 0 0 0 1px ${border}` }} />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="h-[3px] w-4/5 rounded-full" style={{ background: text }} />
                <span className="h-[3px] w-1/2 rounded-full opacity-60" style={{ background: text }} />
              </span>
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
            </span>
            <span className="text-[12.5px] font-medium leading-tight text-[var(--text-primary)]">{choice.label}</span>
            <span className="text-[11px] leading-tight text-[var(--text-muted)]">{choice.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function SnippetRow({
  snippet,
  checked,
  onChange,
}: {
  snippet: LoadedSnippet;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const labelId = useId();
  const detailId = useId();
  const parsedNothing = !snippet.error && snippet.rules === 0 && snippet.css.replace(/\/\*[\s\S]*?\*\//g, "").trim() !== "";
  const details = [
    snippetSourceLabel(snippet.source),
    snippet.rules != null && !snippet.error ? `${snippet.rules} rule${snippet.rules === 1 ? "" : "s"}` : null,
    snippet.blocked.length ? `${snippet.blocked.length} remote rule${snippet.blocked.length === 1 ? "" : "s"} dropped` : null,
  ].filter(Boolean);
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] px-2.5 py-2"
      data-testid="settings-snippet"
      data-snippet-id={snippet.id}
      data-enabled={checked ? "1" : "0"}
    >
      <div className="min-w-0">
        <div id={labelId} className="truncate text-[13px] font-medium text-[var(--text-primary)]">
          {snippet.name}
        </div>
        <div id={detailId} className="text-[11.5px] text-[var(--text-muted)]">
          {details.join(" · ")}
          {snippet.error ? <span className="block text-[var(--danger)]">{snippet.error}</span> : null}
          {parsedNothing ? (
            <span className="block text-[var(--warning)]">No CSS rules could be read — check for a missing brace.</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={detailId}
        disabled={Boolean(snippet.error)}
        data-testid="settings-snippet-toggle"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40",
          checked ? "bg-[var(--accent)]" : "bg-[var(--switch-off)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </button>
    </li>
  );
}

export function CssSnippetsSettings({ open }: { open: boolean }) {
  const diskVault = useCssSnippetStore((s) => s.diskVault);
  const snippets = useCssSnippetStore((s) => s.snippets);
  const enabled = useCssSnippetStore((s) => s.enabled);
  const loading = useCssSnippetStore((s) => s.loading);
  const notice = useCssSnippetStore((s) => s.notice);
  const refresh = useCssSnippetStore((s) => s.refresh);
  const setEnabled = useCssSnippetStore((s) => s.setEnabled);
  const disableAll = useCssSnippetStore((s) => s.disableAll);
  const createStarter = useCssSnippetStore((s) => s.createStarter);
  const dismissNotice = useCssSnippetStore((s) => s.dismissNotice);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  return (
    <div className="mt-5" data-testid="settings-snippets">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-medium text-[var(--text-secondary)]">CSS snippets</div>
        {diskVault ? (
          <div className="flex items-center gap-1.5">
            {enabled.length ? (
              <button type="button" className="chip-btn" data-testid="settings-snippets-off" onClick={() => disableAll()}>
                Turn all off
              </button>
            ) : null}
            <button
              type="button"
              className="chip-btn"
              data-testid="settings-snippets-new"
              onClick={() => void createStarter()}
            >
              <FilePlus2 size={13} /> New snippet
            </button>
            <button
              type="button"
              className="chip-btn"
              data-testid="settings-snippets-reload"
              aria-label="Reload snippets from disk"
              onClick={() => void refresh()}
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} /> Reload
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
        .css files in <code>.nexus/snippets</code>, and in the snippets folder another Markdown app may already keep in
        this vault. Snippets apply through theme variables (--background-primary, --text-normal, --interactive-accent)
        and body.theme-dark / body.theme-light; rules aimed at another app&apos;s own panes have nothing to match. @import and
        http(s) url() are dropped, and a snippet that drops text under {MIN_READABLE_CONTRAST}:1 contrast is turned
        off.
      </p>
      {notice ? (
        <div
          role="status"
          className="mt-2 flex items-start justify-between gap-2 rounded-[10px] border border-[var(--warning)] bg-[var(--warning-dim)] px-2.5 py-2 text-[12px] text-[var(--text-primary)]"
          data-testid="settings-snippets-notice"
        >
          <span>{notice}</span>
          <button type="button" className="chip-btn" onClick={dismissNotice}>
            OK
          </button>
        </div>
      ) : null}
      {!diskVault ? (
        <p className="mt-2 text-[12px] text-[var(--text-secondary)]" data-testid="settings-snippets-empty">
          Open a folder vault to load snippets. This vault lives in memory, so it has no snippets folder.
        </p>
      ) : snippets.length === 0 ? (
        <p className="mt-2 text-[12px] text-[var(--text-secondary)]" data-testid="settings-snippets-empty">
          {loading ? "Reading snippets…" : "No snippets yet. New snippet writes a commented starter to .nexus/snippets."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5" data-testid="settings-snippet-list">
          {snippets.map((snippet) => (
            <SnippetRow
              key={snippet.id}
              snippet={snippet}
              checked={enabled.includes(snippet.id)}
              onChange={(on) => setEnabled(snippet.id, on)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
