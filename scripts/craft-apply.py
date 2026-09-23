#!/usr/bin/env python3
"""Apply the Gate B/C craft fixes onto the draft tip. ASCII-only."""
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")

def sub(rel, old, new):
    p = root / rel
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing anchor in {rel}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor not unique in {rel}: {text.count(old)}")
    p.write_text(text.replace(old, new, 1))

viewport = root / "src/lib/layout/viewport.ts"
vt = viewport.read_text()
vstart = vt.find("export function exitGraphForViewport(): void {")
if vstart < 0:
    raise SystemExit("exit fn missing")
vend = vt.find("\n}\n", vstart)
if vend < 0:
    raise SystemExit("exit fn end missing")
vend += 3
vt = vt[:vstart] + """export function exitGraphForViewport(): void {
  const phone = isPhoneViewport();
  useVaultStore.getState().setGraphMode(phone ? \"hidden\" : \"panel\");
  // setGraphMode(\"panel\") writes rightTab \"graph\" inside the same update.
  // The state object from before that call still has the pre-exit tab, so
  // checking it skips the handoff and the side panel remounts ForceGraph3D.
  if (!phone) useVaultStore.getState().setRightTab(\"backlinks\");
}
""" + vt[vend:]
viewport.write_text(vt)

# Settings help: drop the agent-VM sentence. Anchor is ASCII; the ellipsis
# stays in the sentence that follows "Open".
settings = root / "src/components/settings/SettingsPanel.tsx"
st = settings.read_text()
needle = "This Cloud Agent VM does not exercise FSA or Tauri"
start = st.find(needle)
if start < 0:
    raise SystemExit("settings needle missing")
end = st.find("local-folder path.", start)
if end < 0:
    raise SystemExit("settings end missing")
end += len("local-folder path.")
st = st[:start] + "The desktop app opens the same folder directly." + st[end:]
settings.write_text(st)

sub(
    "src/components/right/RightPanel.tsx",
    """        <div className=\"flex items-center gap-1 border-b border-[var(--border)] p-2\">
          {tabDefs.map(([id, Icon, label]) => (
            <button
              key={id}
              type=\"button\"
              className={cn(
                \"chip-btn relative flex-1 justify-center\",
                tab === id && \"is-active\",
              )}
              onClick={() => setTab(id)}
              title={label}
              aria-label={label}
              aria-selected={tab === id}
            >
              <Icon size={13} />
              <span className=\"hidden xl:inline\">{label}</span>
              {id === \"pulse\" && (openConflictCount > 0 || unreadPulse > 0) ? (
                <span className=\"ml-1 rounded-full bg-[rgba(255,69,58,0.15)] px-1.5 text-[10px] font-semibold text-[var(--danger)]\">
                  {Math.max(openConflictCount, unreadPulse)}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type=\"button\"
            className=\"icon-btn ml-1 h-7 w-7\"
            onClick={() => setRightOpen(false)}
            title=\"Collapse panel\"
            aria-label=\"Collapse panel\"
          >""",
    """        <div className=\"flex items-center gap-0.5 border-b border-[var(--border)] px-1.5 py-1.5\">
          {tabDefs.map(([id, Icon, label]) => (
            <button
              key={id}
              type=\"button\"
              className={cn(
                \"icon-btn relative h-7 w-7 shrink-0\",
                tab === id && \"is-active\",
              )}
              onClick={() => setTab(id)}
              title={label}
              aria-label={label}
              aria-selected={tab === id}
            >
              <Icon size={14} />
              {id === \"pulse\" && (openConflictCount > 0 || unreadPulse > 0) ? (
                <span className=\"absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--danger)] px-0.5 text-[9px] font-semibold text-white\">
                  {(() => {
                    const n = Math.max(openConflictCount, unreadPulse);
                    return n > 9 ? \"9+\" : n;
                  })()}
                </span>
              ) : null}
            </button>
          ))}
          <span className=\"min-w-0 flex-1 truncate px-1.5 text-[12px] font-medium tracking-tight text-[var(--text-secondary)]\">
            {tabDefs.find(([id]) => id === tab)?.[2] ?? \"\"}
          </span>
          <button
            type=\"button\"
            className=\"icon-btn h-7 w-7 shrink-0\"
            onClick={() => setRightOpen(false)}
            title=\"Collapse panel\"
            aria-label=\"Collapse panel\"
          >""",
)

sub(
    "src/lib/vault/durable-index.ts",
    """          if (candidateIds.length >= MEMORY_FTS_CANDIDATE_CAP) break;
        }
      }
    }

    const scored: Array<{""",
    """          if (candidateIds.length >= MEMORY_FTS_CANDIDATE_CAP) break;
        }
      }
    } else if (
      candidateIds.length < limit &&
      tokens.length > 0 &&
      (lists.length !== tokens.length || candidateIds.length === 0)
    ) {
      // Slim indexing drops digit tokens (Brief-41936), and a vault above the
      // full-scan cap never walks titles. An identifier query then says
      // \"no notes match\" while that note is on screen. Title and path only.
      const have = new Set(candidateIds);
      for (const n of this.notes.values()) {
        if (have.has(n.id)) continue;
        const title = (n.title ?? n.name).toLowerCase();
        if (title.includes(q) || n.path.toLowerCase().includes(q)) {
          candidateIds.push(n.id);
          have.add(n.id);
          if (candidateIds.length >= limit) break;
        }
      }
    }

    const scored: Array<{""",
)

print("applied")
