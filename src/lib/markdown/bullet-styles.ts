/**
 * Bullet list styles — visual markers that map to clean CommonMark markers:
 *   disc   →  -
 *   circle →  *
 *   square →  +
 *   dash   →  -  (en-dash look; serializes as -)
 */

export type BulletStyle = "disc" | "circle" | "square" | "dash";

export const BULLET_STYLES: {
  id: BulletStyle;
  label: string;
  sample: string;
  marker: "-" | "*" | "+";
}[] = [
  { id: "disc", label: "Disc", sample: "●", marker: "-" },
  { id: "circle", label: "Circle", sample: "○", marker: "*" },
  { id: "square", label: "Square", sample: "■", marker: "+" },
  { id: "dash", label: "Dash", sample: "–", marker: "-" },
];

export function isBulletStyle(v: unknown): v is BulletStyle {
  return v === "disc" || v === "circle" || v === "square" || v === "dash";
}

export function markerForStyle(style: BulletStyle): "-" | "*" | "+" {
  return BULLET_STYLES.find((b) => b.id === style)?.marker ?? "-";
}

export function styleFromMarker(marker: string): BulletStyle {
  if (marker === "*") return "circle";
  if (marker === "+") return "square";
  return "disc";
}
