/**
 * Line-level diff for Conflict Studio. Fast LCS — good enough for note bodies.
 */

export type DiffSide = "same" | "add" | "del";

export type DiffLine = {
  side: DiffSide;
  text: string;
};

function splitLines(s: string): string[] {
  if (!s) return [""];
  return s.replace(/\r\n/g, "\n").split("\n");
}

/** Myers-ish LCS backtrack for short-to-medium notes. */
export function diffLines(a: string, b: string): { mine: DiffLine[]; theirs: DiffLine[] } {
  const left = splitLines(a);
  const right = splitLines(b);
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        left[i] === right[j]
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const mine: DiffLine[] = [];
  const theirs: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      mine.push({ side: "same", text: left[i]! });
      theirs.push({ side: "same", text: right[j]! });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
      mine.push({ side: "del", text: left[i]! });
      i += 1;
    } else {
      theirs.push({ side: "add", text: right[j]! });
      j += 1;
    }
  }
  while (i < n) {
    mine.push({ side: "del", text: left[i]! });
    i += 1;
  }
  while (j < m) {
    theirs.push({ side: "add", text: right[j]! });
    j += 1;
  }
  return { mine, theirs };
}

export function countDiffHunks(a: string, b: string): { added: number; removed: number } {
  const { mine, theirs } = diffLines(a, b);
  return {
    removed: mine.filter((l) => l.side === "del").length,
    added: theirs.filter((l) => l.side === "add").length,
  };
}
