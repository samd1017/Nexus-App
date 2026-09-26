/**
 * Writable directory for soak and QA output.
 * Set NEXUS_ARTIFACT_DIR to override. Never hardcode a host artifact path.
 */
import os from "node:os";
import path from "node:path";

export const ARTIFACT_DIR =
  process.env.NEXUS_ARTIFACT_DIR || path.join(os.tmpdir(), "nexus-artifacts");

export function artifactPath(...parts) {
  return path.join(ARTIFACT_DIR, ...parts);
}
