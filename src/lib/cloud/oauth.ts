/**
 * Optional cloud — pure local-first recommendation.
 *
 * Decision: do NOT ship half-working remote OAuth stubs.
 * Primary path = open a folder synced by Dropbox / Google Drive / OneDrive desktop.
 * Notes stay plain .md on disk; Hermes and the app share the same files.
 */

export type CloudProvider = "dropbox" | "google" | "onedrive";

export interface CloudSession {
  provider: CloudProvider;
  /** display only — no remote tokens stored */
  label: string;
  connectedAt: number;
  method: "synced-folder";
}

const PREF_KEY = "noteapp-cloud-pref-v2";

export function providerLabel(p: CloudProvider): string {
  if (p === "dropbox") return "Dropbox";
  if (p === "google") return "Google Drive";
  return "OneDrive";
}

export function providerSyncHint(p: CloudProvider): string {
  if (p === "dropbox") {
    return "Open your Dropbox folder (or a subfolder) as the vault after desktop sync is on.";
  }
  if (p === "google") {
    return "Open the Google Drive for desktop stream/mirror folder as the vault.";
  }
  return "Open your OneDrive folder as the vault after Files On-Demand sync.";
}

export const CLOUD_SYNC_HINT =
  "Best path: enable Dropbox / Drive / OneDrive desktop sync, then Open folder as vault. Zero accounts in Note App. Notes stay ordinary Markdown.";

export function loadCloudSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CloudSession;
  } catch {
    return null;
  }
}

export function saveCloudSession(session: CloudSession | null): void {
  if (!session) localStorage.removeItem(PREF_KEY);
  else localStorage.setItem(PREF_KEY, JSON.stringify(session));
}

/** Mark that the user prefers a given provider's synced folder (no OAuth). */
export function preferSyncedProvider(provider: CloudProvider): CloudSession {
  const session: CloudSession = {
    provider,
    label: providerLabel(provider) + " (synced folder)",
    connectedAt: Date.now(),
    method: "synced-folder",
  };
  saveCloudSession(session);
  return session;
}

export function disconnectCloud(): void {
  saveCloudSession(null);
}

/** @deprecated OAuth intentionally not used — use preferSyncedProvider */
export async function beginCloudOAuth(provider: CloudProvider): Promise<{
  ok: boolean;
  reason?: string;
  session?: CloudSession;
}> {
  const session = preferSyncedProvider(provider);
  return {
    ok: true,
    session,
    reason: providerSyncHint(provider),
  };
}

export function getCloudConfig(_provider: CloudProvider): {
  configured: boolean;
  mode: "synced-folder";
} {
  return { configured: true, mode: "synced-folder" };
}
