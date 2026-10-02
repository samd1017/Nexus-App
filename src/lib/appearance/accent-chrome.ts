/**
 * Accent used as ink, wash, and graph grouping.
 * Selection chrome follows the preset; light and paper darken it until the
 * marker still clears the pale surfaces. Folder and tag hues rotate with the
 * accent so groups stay apart without sitting in the old cyan band.
 */

export type Rgb = { r: number; g: number; b: number };

const DARK_SURFACES = ["#0F0F12", "#16161A", "#050507", "#04060A", "#070A14", "#111829"];
const LIGHT_SURFACES = ["#FFFFFF", "#F7F8FB", "#EEF0F4", "#FBF7EF", "#ECE4D4", "#F6F0E4"];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function channelLum(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channelLum(rgb.r) + 0.7152 * channelLum(rgb.g) + 0.0722 * channelLum(rgb.b);
}

export function contrastHex(fg: string, bg: string): number {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return 1;
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function contrastRgb(fg: Rgb, bg: Rgb): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Marker color for selection bars, focus rings, and active icons. */
export function accentInk(hex: string, theme: "dark" | "light"): string {
  const accent = hexToRgb(hex) ?? { r: 0, g: 200, b: 255 };
  const surfaces = (theme === "light" ? LIGHT_SURFACES : DARK_SURFACES)
    .map((s) => hexToRgb(s))
    .filter((s): s is Rgb => Boolean(s));
  const toward = theme === "light" ? { r: 6, g: 16, b: 24 } : { r: 255, g: 255, b: 255 };
  const score = (rgb: Rgb) => Math.min(...surfaces.map((s) => contrastRgb(rgb, s)));
  if (score(accent) >= 3) return rgbToHex(accent);
  let best = accent;
  let bestScore = score(accent);
  for (let i = 1; i <= 24; i++) {
    const candidate = mix(accent, toward, i / 24);
    const next = score(candidate);
    if (next >= 3) return rgbToHex(candidate);
    if (next > bestScore) {
      best = candidate;
      bestScore = next;
    }
  }
  return rgbToHex(best);
}

/** Text on a solid accent fill. Near-black on bright accents, white on dark ones. */
export function onAccentHex(hex: string): string {
  const dark = "#041018";
  const light = "#FFFFFF";
  const onDark = contrastHex(dark, hex);
  const onLight = contrastHex(light, hex);
  if (onDark >= onLight && onDark >= 3) return dark;
  if (onLight >= 3) return light;
  return onDark >= onLight ? dark : light;
}

export function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return rgbToHex({
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
  });
}

export function accentHue(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 193 / 360;
  return rgbToHsl(rgb).h;
}

/** 0–1 hash. Stable across sessions so a folder keeps its place in the family. */
export function hashUnit(key: string): number {
  let h = 2166136261;
  const text = key || "__root__";
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 10000) / 10000;
}

/**
 * Hue 0–1 for a folder or tag. Golden offset from the accent so a preset
 * change rotates the whole family, and two groups do not collapse together.
 */
export function groupHue(key: string, accentHex: string): number {
  return (accentHue(accentHex) + hashUnit(key) * 0.61803398875) % 1;
}

/** Even steps for a short legend. Index 0 sits on the accent. */
export function indexedGroupHue(index: number, accentHex: string): number {
  const i = Number.isFinite(index) ? Math.max(0, index) : 0;
  return (accentHue(accentHex) + i * 0.38196601125) % 1;
}

/** Legend swatch. Saturated enough to tell folders apart on the dark map. */
export function indexedGroupSwatch(index: number, accentHex: string): string {
  return hslToHex(indexedGroupHue(index, accentHex), 0.62, 0.58);
}

export function groupSwatch(key: string, accentHex: string): string {
  return hslToHex(groupHue(key, accentHex), 0.58, 0.56);
}
