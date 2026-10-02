/**
 * Ctrl/Cmd+G always means the local neighborhood (this note and its links).
 * The Local / Folder Map tabs remember the last surface they were clicked on.
 * The hotkey does not.
 */
export function surfaceForGraphHotkey(_remembered?: string | null): "local" {
  return "local";
}
