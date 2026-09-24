/** Shared Rebuild confirm decision. Enter rebuilds only when Rebuild is focused. */
export function confirmEnterAction(
  focus: "cancel" | "confirm" | "other",
): "dismiss" | "rebuild" | "stay" {
  if (focus === "confirm") return "rebuild";
  if (focus === "cancel") return "dismiss";
  return "stay";
}

type RebuildHost = {
  dialog: HTMLElement;
  cancel: HTMLButtonElement;
  confirm: HTMLButtonElement;
};

/**
 * Open the Rebuild confirm into `doc` and focus Cancel.
 * Enter on Cancel dismisses and returns focus to `rebuildButton`.
 * Enter on Rebuild runs `onRebuild`.
 */
export function openRebuildConfirmIn(
  doc: Document,
  rebuildButton: HTMLElement,
  onRebuild: () => void,
): RebuildHost {
  const dialog = doc.createElement("div");
  dialog.setAttribute("data-testid", "rebuild-confirm");
  dialog.setAttribute("data-nexus-confirm", "true");
  dialog.setAttribute("role", "dialog");
  const cancel = doc.createElement("button");
  cancel.setAttribute("data-confirm-cancel", "");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const confirm = doc.createElement("button");
  confirm.setAttribute("data-confirm-action", "");
  confirm.type = "button";
  confirm.textContent = "Rebuild";
  dialog.append(cancel, confirm);
  doc.body.append(dialog);

  const close = (action: "dismiss" | "rebuild") => {
    dialog.remove();
    if (action === "rebuild") onRebuild();
    else rebuildButton.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close("dismiss");
      return;
    }
    if (e.key !== "Enter") return;
    const focus =
      doc.activeElement === confirm
        ? "confirm"
        : doc.activeElement === cancel
          ? "cancel"
          : "other";
    const action = confirmEnterAction(focus);
    e.preventDefault();
    if (action === "stay") return;
    close(action);
  };
  dialog.addEventListener("keydown", onKey);
  cancel.focus();
  return { dialog, cancel, confirm };
}
