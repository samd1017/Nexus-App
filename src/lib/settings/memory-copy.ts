export type MemoryStats = {
  loaded: number;
  max: number;
  protected: number;
  underPressure: boolean;
};

/**
 * The Settings line about note text in memory. The loaded count never stands
 * alone: beside a whole-vault total it is "N of TOTAL", and while a large
 * vault is still being counted it says so instead of implying N is the vault.
 *
 * `total` is the whole-vault note count, 0 for an empty vault, or -1 while a
 * large vault is still being counted.
 */
export function memoryLine(args: {
  vaultOpen: boolean;
  stats: MemoryStats | null;
  total: number;
  /** Text is read from disk when a note opens (desktop, folder, or paged vaults). */
  onDemand: boolean;
}): string {
  const { vaultOpen, stats, total, onDemand } = args;
  if (!vaultOpen) return "Shown after you open a folder.";
  if (total === 0) return "No notes yet, so no note text is held in memory.";
  if (!stats) return "Counting the notes held in memory…";
  const fmt = (n: number) => n.toLocaleString("en-US");
  const of = total > 0 ? ` of ${fmt(total)}` : "";
  const counting = total < 0 ? " The vault total appears once the folder is listed." : "";
  // Every note keeps its text: only a vault whose text is not read on demand.
  if (!onDemand && stats.max === 0 && (stats.loaded === 0 || (total > 0 && stats.loaded >= total))) {
    return total > 0
      ? `All ${fmt(total)} notes keep their text in memory.`
      : "This vault keeps note text in memory.";
  }
  // Text is read on demand but the cache is not counting (lazy text is off):
  // there is no honest number to give.
  if (stats.max === 0 && stats.loaded === 0) {
    return `Note text loads when you open a note.${counting}`;
  }
  if (stats.loaded === 0) {
    return `No note text is in memory yet. It loads when you open a note.${counting}`;
  }
  if (stats.underPressure) {
    return `Keeping the notes you are using. Text for ${fmt(stats.loaded)}${of} notes is in memory, including ${fmt(stats.protected)} you are editing.${counting}`;
  }
  const lead = stats.max === 0 ? "" : "Note text loads when you open a note. ";
  return `${lead}Text for ${fmt(stats.loaded)}${of} notes is in memory right now.${counting}`;
}
