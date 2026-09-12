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
