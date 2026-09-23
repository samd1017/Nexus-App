/**
 * Local screenshot directory for QA scripts.
 * Defaults to gitignored artifacts/screenshots. Override with NEXUS_SCREENSHOT_DIR.
 * Never a home directory and never a path that should be committed.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function screenshotRoot() {
  return resolve(process.env.NEXUS_SCREENSHOT_DIR || "artifacts/screenshots");
}

export function screenshotDir(...parts) {
  const dir = resolve(screenshotRoot(), ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function screenshotPath(...parts) {
  const file = resolve(screenshotRoot(), ...parts);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}
