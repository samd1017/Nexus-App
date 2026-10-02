/**
 * What Enter does in the command palette once a query has painted.
 * A highlighted row opens. With note hits on screen and nothing highlighted,
 * the first hit opens. A folder lookup may wait only when there is no note
 * to open (so "Create note" does not skip a folder of that exact name).
 */

export type PaletteEnterNow = "selected" | "first-hit" | "wait";

export function paletteEnterOpensNow(args: {
  hasSelection: boolean;
  selectedIsFolder: boolean;
  selectedIsCreate: boolean;
  hitCount: number;
  catalogPending: boolean;
  exactNote: boolean;
  commandMode: boolean;
  askMode: boolean;
  tagBrowse: boolean;
}): PaletteEnterNow {
  if (args.selectedIsFolder) return "selected";
  const holdingCreate =
    args.catalogPending &&
    args.hitCount === 0 &&
    !args.exactNote &&
    args.selectedIsCreate;
  if (args.hasSelection && !holdingCreate) return "selected";
  if (args.hitCount > 0 && !args.commandMode && !args.askMode && !args.tagBrowse) {
    return "first-hit";
  }
  return "wait";
}
