/**
 * Lightweight heap samples after each note open — no full heap snapshot.
 * Read via __NEXUS_STRESS__().heapLog or the [nexus-heap] console line.
 */

export type HeapSample = {
  t: number;
  reason: string;
  jsHeapUsedMb: number | null;
  jsHeapTotalMb: number | null;
  jsHeapLimitMb: number | null;
  notes: number;
  bodiesLoaded: number;
  ftsInvTokens: number;
  ftsNoteTokenSets: number;
  treeFlatRows: number;
};

const MAX = 80;
const log: HeapSample[] = [];
/** Visible file-tree rows after flatten (not DOM nodes — virtualizer mounts ~30). */
export let lastTreeFlatCount = 0;

export function setLastTreeFlatCount(n: number): void {
  lastTreeFlatCount = n;
}

export function recordHeapSample(
  reason: string,
  extra: Omit<HeapSample, "t" | "reason" | "jsHeapUsedMb" | "jsHeapTotalMb" | "jsHeapLimitMb">,
): HeapSample {
  const heap = (
    performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    }
  ).memory;
  const sample: HeapSample = {
    t: Date.now(),
    reason,
    jsHeapUsedMb: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
    jsHeapTotalMb: heap ? Math.round(heap.totalJSHeapSize / 1048576) : null,
    jsHeapLimitMb: heap ? Math.round(heap.jsHeapSizeLimit / 1048576) : null,
    ...extra,
  };
  log.push(sample);
  if (log.length > MAX) log.shift();
  if (typeof console !== "undefined") {
    console.info(
      "[nexus-heap]",
      sample.reason,
      `heap=${sample.jsHeapUsedMb}MB`,
      `bodies=${sample.bodiesLoaded}`,
      `inv=${sample.ftsInvTokens}`,
      `tree=${sample.treeFlatRows}`,
    );
  }
  return sample;
}

export function getHeapLog(): HeapSample[] {
  return log.slice();
}

export function clearHeapLog(): void {
  log.length = 0;
}
