/** Rename field keys. Escape puts the old name back. Enter keeps the draft. */
export function renameKeyAction(key: string): "restore" | "commit" | "ignore" {
  if (key === "Escape") return "restore";
  if (key === "Enter") return "commit";
  return "ignore";
}
