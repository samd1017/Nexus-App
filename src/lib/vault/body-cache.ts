/**
 * Wave 2/C — LRU of loaded note bodies (id → content).
 * Dirty + active ids are never evicted from the store; this tracks order only.
 * Wave C: automatic memory budget stats + pressure-aware eviction (no user toggle).
 */

import { getScaleFlags } from "./scale-flags";

const order: string[] = [];
let sessionEvictions = 0;

/** Snapshot of automatic body memory budget. */
export interface BodyCacheStats {
  loaded: number;
  max: number;
  protected: number;
  underPressure: boolean;
  evictedSession: number;
}

export function touchBody(id: string): void {
  const i = order.indexOf(id);
  if (i >= 0) order.splice(i, 1);
  order.push(id);
}

export function removeBodyTouch(id: string): void {
  const i = order.indexOf(id);
  if (i >= 0) order.splice(i, 1);
}

export function clearBodyTouches(): void {
  order.length = 0;
  sessionEvictions = 0;
}

export function getBodyCacheOrder(): readonly string[] {
  return order;
}

export function getBodyCacheStats(protectedIds: Set<string>): BodyCacheStats {
  const max = getScaleFlags().bodyLruSize;
  const loaded = order.length;
  const protectedCount = protectedIds.size;
  return {
    loaded,
    max,
    protected: protectedCount,
    underPressure: loaded > max,
    evictedSession: sessionEvictions,
  };
}

const AGGRESSIVE_FACTOR = 0.5;
const AGGRESSIVE_MIN_FLOOR = 32;
const PRESSURE_RATIO = 1.25;

export function effectiveBodyBudget(
  max: number,
  protectedCount: number,
  aggressive: boolean,
): number {
  if (!aggressive) return max;
  const tight = Math.floor(max * AGGRESSIVE_FACTOR);
  return Math.max(protectedCount, AGGRESSIVE_MIN_FLOOR, tight);
}

export type EvictOpts = {
  aggressive?: boolean;
};

/** Return ids to unload (exclude protected). */
export function pickEvictions(
  protectedIds: Set<string>,
  opts?: EvictOpts,
): string[] {
  const max = getScaleFlags().bodyLruSize;
  const aggressive =
    opts?.aggressive === true || order.length > Math.ceil(max * PRESSURE_RATIO);
  const target = effectiveBodyBudget(max, protectedIds.size, aggressive);
  const victims: string[] = [];
  while (order.length - victims.length > target) {
    const oldest = order.find(
      (id) => !protectedIds.has(id) && !victims.includes(id),
    );
    if (!oldest) break;
    victims.push(oldest);
  }
  for (const v of victims) removeBodyTouch(v);
  sessionEvictions += victims.length;
  return victims;
}

export function resetBodyCacheSession(): void {
  clearBodyTouches();
}
