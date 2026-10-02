/**
 * `.base` files the in-memory demo vault can open. A disk vault lists the
 * files on disk instead; these exist so the demo is not stuck on Import.
 */

export type DemoBaseFile = { path: string; name: string; text: string };

export const DEMO_VAULT_ID = "demo-vault";

const THREE_VIEWS = `views:
  - type: table
    name: Soak all
  - type: cards
    name: Soak cards
  - type: table
    name: Soak third
    filters:
      and:
        - file.inFolder("Research")
`;

const GROUP_BY = `views:
  - type: table
    name: By status
    groupBy:
      property: status
      direction: ASC
`;

const MULTI_FORMULA = `formulas:
  hours: round(number(estimate) / 60, 1)
  label: formula.hours & " h"
views:
  - type: table
    name: Hours
    order:
      - file.name
      - formula.hours
      - formula.label
`;

const EXPORT_COPY = `views:
  - type: table
    name: Exported copy
`;

export const DEMO_VAULT_BASES: DemoBaseFile[] = [
  { path: "Soak-ThreeViews.base", name: "Soak-ThreeViews.base", text: THREE_VIEWS },
  { path: "Soak-GroupBy.base", name: "Soak-GroupBy.base", text: GROUP_BY },
  { path: "Soak-MultiFormula.base", name: "Soak-MultiFormula.base", text: MULTI_FORMULA },
  { path: "Nexus Bases export.base", name: "Nexus Bases export.base", text: EXPORT_COPY },
];

export function demoBaseFile(path: string): DemoBaseFile | null {
  const needle = path.replace(/\\/g, "/");
  return DEMO_VAULT_BASES.find((file) => file.path === needle) ?? null;
}

/** Saved copy of a vault `.base` in an in-memory vault, separate from the home live file. */
export function demoBaseStorageKey(vaultId: string, path: string): string {
  return `nexus-bases-file:${vaultId}:${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}
