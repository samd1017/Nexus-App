/**
 * Graph empty / pending copy. Links mode must explain when the index
 * is not ready — a lone ego orb is not "this note has no wikilinks".
 */

import type { GraphViewMode } from "./build-graph";

export type GraphEmptyInput = {
  viewMode: GraphViewMode;
  vaultNoteCount: number;
  drawnNodeCount: number;
  activeNoteId: string | null;
  linkIndexReady: boolean;
  linkEdgeCount: number;
  hasFilters: boolean;
  folderHasPath: boolean;
  /**
   * Desktop shell asks SQLite for one neighborhood. The in-memory link
   * map stays empty on purpose, so it must not cover the canvas.
   */
  catalogBacked?: boolean;
  /** Heads are still being read. Don't cover the map with a dead-end. */
  linksStillFilling?: boolean;
};

export type GraphEmptyCopy = {
  show: boolean;
  title: string;
  description: string;
};

export function graphEmptyCopy(input: GraphEmptyInput): GraphEmptyCopy {
  const {
    viewMode,
    vaultNoteCount,
    drawnNodeCount,
    activeNoteId,
    linkIndexReady,
    linkEdgeCount,
    hasFilters,
    folderHasPath,
    catalogBacked,
    linksStillFilling,
  } = input;

  if (viewMode === "folder") {
    if (!folderHasPath) {
      return vaultNoteCount > 0
        ? {
            show: drawnNodeCount === 0,
            title: "Nothing on this level",
            description:
              "Open a folder orb, or switch to Links to see [[wikilinks]] near the active note.",
          }
        : {
            show: drawnNodeCount === 0,
            title: "Empty vault",
            description: "Add a folder or note — the map stays honest at any vault size.",
          };
    }
    return {
      show: drawnNodeCount === 0,
      title: "Empty folder",
      description:
        "Open a folder orb, or switch to Links to see [[wikilinks]] near the active note.",
    };
  }

  if (viewMode === "ego") {
    if (!linkIndexReady && !catalogBacked) {
      return {
        show: true,
        title: "Link index isn’t ready yet",
        description:
          "Native fill is still extracting [[wikilinks]] from note heads. The neighborhood appears when the link index is seeded — no need to open every note.",
      };
    }
    if (catalogBacked && (drawnNodeCount > 0 || linksStillFilling)) {
      return {
        show: false,
        title: "",
        description: "",
      };
    }
    if (!activeNoteId) {
      return {
        show: true,
        title: "Pick a note",
        description:
          "Open a note and fly its neighborhood. A huge vault stays a folder map until you ask.",
      };
    }
    if (linkEdgeCount === 0) {
      return {
        show: drawnNodeCount <= 1,
        title: "No [[wikilinks]] indexed",
        description:
          "The link index is ready but found no resolvable [[wikilinks]] in note heads. Add a link, or return to the folder map.",
      };
    }
    return {
      show: drawnNodeCount === 0,
      title: "No links in range",
      description:
        "This note has no resolved [[wikilinks]] within two hops. Add a link, or return to the folder map.",
    };
  }

  if (vaultNoteCount === 0) {
    return {
      show: drawnNodeCount === 0,
      title: "No notes yet",
      description: "Create a note to begin the constellation.",
    };
  }
  if (hasFilters) {
    return {
      show: drawnNodeCount === 0,
      title: "Nothing matches these filters",
      description: "Clear filters to see the current view again.",
    };
  }
  return {
    show: drawnNodeCount === 0,
    title: "No graph nodes",
    description: "Add [[wikilinks]] between notes to map structure.",
  };
}
