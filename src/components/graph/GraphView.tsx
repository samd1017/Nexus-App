import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { useVaultStore } from "@/lib/vault/store";
import { resolveGraphData, type GraphViewMode } from "@/lib/graph/build-graph";
import { getContentLinkSig } from "@/lib/markdown/wikilinks";
import { shouldUseFolderGraph } from "@/lib/vault/scale-flags";
import { ensureVaultIndex, vaultIndex } from "@/lib/vault/indexes";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { useGraphTick } from "@/lib/graph/graph-tick";
import type { VaultNode } from "@/lib/vault/types";
import {
  Maximize2,
  Minimize2,
  Network,
  Download,
  Focus,
  Globe2,
  Ghost,
  Hash,
  Link2,
  Scan,
  FilePlus2,
  Search,
  Filter,
} from "lucide-react";
import { collectVaultTags } from "@/lib/vault/tags";
import { cn } from "@/lib/utils";
import { usePrefsStore, type PhysicsIntensity } from "@/lib/prefs/preferences";
import { isDesktopShell, formatShortcut } from "@/lib/platform";
import {
  closeDrawersIfNarrow,
  exitGraphForViewport,
  isPhoneViewport,
} from "@/lib/layout/viewport";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  mode: "panel" | "fullscreen";
  className?: string;
}

type GNode = {
  id: string;
  name: string;
  val: number;
  preview: string;
  path: string;
  degree: number;
  folder: string;
  tag?: string;
  ghost?: boolean;
  ghostTarget?: string;
  kind?: "note" | "folder" | "aggregate";
  noteCount?: number;
  aggregate?: boolean;
  x?: number;
  y?: number;
  z?: number;
  __threeObj?: THREE.Object3D;
};

type NeighborhoodMode = "all" | "1hop" | "2hop" | "3hop";

function hopCount(mode: NeighborhoodMode): 1 | 2 | 3 {
  if (mode === "2hop") return 2;
  if (mode === "3hop") return 3;
  return 1;
}

function cycleNeighborhood(mode: NeighborhoodMode): NeighborhoodMode {
  if (mode === "all") return "1hop";
  if (mode === "1hop") return "2hop";
  if (mode === "2hop") return "3hop";
  return "all";
}

function hopKeepSet(
  center: string,
  hops: number,
  neighborMap: Map<string, Set<string>>,
): Set<string> {
  const keep = new Set<string>([center]);
  let frontier = [center];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighborMap.get(id) ?? []) {
        if (!keep.has(n)) {
          keep.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return keep;
}

const LOD_SEGMENT_THRESHOLD = 250;
const LOD_CAP = 400;

type GLink = {
  source: string | GNode;
  target: string | GNode;
};

function accentRgb(): { r: number; g: number; b: number } {
  if (typeof document === "undefined") return { r: 0, g: 200, b: 255 };
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (!m) return { r: 0, g: 200, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function physicsParams(intensity: PhysicsIntensity) {
  if (intensity === "calm") {
    return { charge: -48, distance: 42, velocity: 0.42, alpha: 0.03 };
  }
  if (intensity === "energetic") {
    return { charge: -130, distance: 28, velocity: 0.22, alpha: 0.015 };
  }
  return { charge: -85, distance: 36, velocity: 0.3, alpha: 0.02 };
}


/** G3: stronger folder hue separation via distinct HSL palette slots */
function tagTintColor(tag: string, desktopBoost: boolean): THREE.Color {
  return folderTintColor(`tag:${tag || "__none__"}`, desktopBoost);
}

function folderTintColor(folder: string, desktopBoost: boolean): THREE.Color {
  let h = 2166136261;
  const key = folder || "__root__";
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hues = [205, 160, 285, 35, 125, 330, 50, 240, 15, 175];
  const hue = hues[Math.abs(h) % hues.length] / 360;
  const sat = desktopBoost ? 0.42 : 0.36;
  const light = desktopBoost ? 0.4 : 0.34;
  return new THREE.Color().setHSL(hue, sat, light);
}
