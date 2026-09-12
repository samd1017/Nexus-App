/**
 * Tiny hashed n-gram embedding — local, instant, no model download.
 * Used as a semantic-ish rerank so Ask feels closer to vectors
 * without shipping a transformer.
 */

const DIMS = 48;

export function embedText(text: string, dims = DIMS): Float32Array {
  const vec = new Float32Array(dims);
  const norm = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return vec;
  const padded = `  ${norm}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    const gram = padded.slice(i, i + 3);
    let h = 2166136261;
    for (let c = 0; c < gram.length; c++) {
      h ^= gram.charCodeAt(c);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dims;
    vec[idx] += 1;
  }
  let mag = 0;
  for (let i = 0; i < dims; i++) mag += vec[i]! * vec[i]!;
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < dims; i++) vec[i] = vec[i]! / mag;
  return vec;
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}
