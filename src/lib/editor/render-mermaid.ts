/**
 * Shared mermaid render for Visual node views and Source preview.
 *
 * Mermaid 11+ ignores `flowchart.htmlLabels`. Top-level `htmlLabels: false`
 * is required — HTML labels measure inside a 1200×1200 foreignObject, and
 * that box becomes the node size (viewBox ~2700px). The diagram then scales
 * into an empty gray pill in Preview/split.
 */

import { resolveTheme, type ThemeMode } from "@/lib/prefs/preferences";

const MERMAID_FONT =
  '-apple-system, BlinkMacSystemFont, system-ui, Inter, "Segoe UI", sans-serif';

export function mermaidInitConfig(theme: ThemeMode) {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: resolveTheme(theme) === "light" ? ("default" as const) : ("dark" as const),
    look: "classic" as const,
    htmlLabels: false,
    fontFamily: MERMAID_FONT,
    fontSize: 16,
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
      nodeSpacing: 50,
      rankSpacing: 50,
      padding: 12,
    },
  };
}

export function hashMermaidSource(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function renderMermaidSvg(
  source: string,
  theme: ThemeMode,
  idPrefix: string,
): Promise<string> {
  const mod = await import("mermaid");
  const mermaid = mod.default;
  mermaid.initialize(mermaidInitConfig(theme));
  const id = `${idPrefix}-${Math.abs(hashMermaidSource(source))}-${Date.now().toString(36)}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}
