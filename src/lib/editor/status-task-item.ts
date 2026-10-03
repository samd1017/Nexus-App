import TaskItem from "@tiptap/extension-task-item";

/**
 * A task item that keeps a status other than done or not done — `[/]` in
 * progress, `[-]` cancelled, or any other symbol — so a save writes it back.
 */
export const StatusTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      status: {
        default: null,
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-status") || null,
        renderHTML: (attributes: { status?: string | null }) =>
          attributes.status ? { "data-status": attributes.status } : {},
      },
    };
  },
});
