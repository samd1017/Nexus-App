/**
 * How heavy a note feels: words a person would read, and a one-line time.
 * Code fences and frontmatter do not count. Wikilinks count as their label.
 */

const WPM = 230;

export type NoteMass = {
  words: number;
  minutes: number;
};

export function noteMass(markdown: string): NoteMass {
  let body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  body = body.replace(/```[\s\S]*?```/g, " ");
  body = body.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  body = body.replace(/\[([^\]]+)]\([^)]*\)/g, "$1");
  body = body.replace(
    /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) => ` ${alias || target} `,
  );
  body = body.replace(/[#>*_`~|[\]()]/g, " ");
  const words = body
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.round(words / WPM));
  return { words, minutes };
}

export function formatWordCount(words: number): string {
  if (words === 0) return "Empty";
  if (words === 1) return "1 word";
  return `${words.toLocaleString()} words`;
}
