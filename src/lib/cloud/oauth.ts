/**
 * Optional client-side OAuth for cloud folders.
 * No app-hosted server — tokens stay in the browser (localStorage).
 * Configure client IDs via Vite env if available; otherwise UI explains setup.
 */

export type CloudProvider = "dropbox" | "google" | "onedrive";

export interface CloudSession {
  provider: CloudProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountLabel?: string;
  connectedAt: number;
}

const STORAGE_KEY = "noteapp-cloud-session-v1";
const PKCE_KEY = "noteapp-oauth-pkce";

export function getCloudConfig(provider: CloudProvider): {
  clientId: string | undefined;
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  configured: boolean;
} {
  const map = {
    dropbox: {
      clientId: import.meta.env.VITE_DROPBOX_CLIENT_ID as string | undefined,
      authUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes: "",
    },
    google: {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/drive.file",
    },
    onedrive: {
      clientId: import.meta.env.VITE_ONEDRIVE_CLIENT_ID as string | undefined,
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: "Files.ReadWrite offline_access",
    },
  } as const;
  const c = map[provider];
  return { ...c, configured: Boolean(c.clientId) };
}

export function loadCloudSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CloudSession;
  } catch {
    return null;
  }
}

export function saveCloudSession(session: CloudSession | null): void {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function randomString(len = 48): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let str = "";
  bytes.forEach((b) => {
    str += String.fromCharCode(b);
  });
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function beginCloudOAuth(provider: CloudProvider): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const cfg = getCloudConfig(provider);
  if (!cfg.clientId) {
    return {
      ok: false,
      reason: `${providerLabel(provider)} client ID not configured. Set VITE_${provider.toUpperCase()}_CLIENT_ID for pure client-side OAuth, or use a local folder / synced cloud drive folder instead.`,
    };
  }

  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);
  sessionStorage.setItem(
    PKCE_KEY,
    JSON.stringify({ provider, verifier, state, at: Date.now() }),
  );

  const redirectUri = `${window.location.origin}/oauth/callback`;
  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (cfg.scopes) url.searchParams.set("scope", cfg.scopes);

  if (provider === "dropbox") {
    url.searchParams.set("token_access_type", "offline");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  } else if (provider === "google") {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  } else if (provider === "onedrive") {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("response_mode", "query");
  }

  window.location.assign(url.toString());
  return { ok: true };
}

export async function completeCloudOAuth(
  code: string,
  state: string,
): Promise<{ ok: boolean; session?: CloudSession; reason?: string }> {
  const raw = sessionStorage.getItem(PKCE_KEY);
  if (!raw) return { ok: false, reason: "Missing PKCE session" };
  const pkce = JSON.parse(raw) as {
    provider: CloudProvider;
    verifier: string;
    state: string;
  };
  if (pkce.state !== state) return { ok: false, reason: "State mismatch" };

  const cfg = getCloudConfig(pkce.provider);
  if (!cfg.clientId) return { ok: false, reason: "Client ID missing" };

  const redirectUri = `${window.location.origin}/oauth/callback`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  });

  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, reason: `Token exchange failed: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const session: CloudSession = {
      provider: pkce.provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
      accountLabel: providerLabel(pkce.provider),
      connectedAt: Date.now(),
    };
    saveCloudSession(session);
    sessionStorage.removeItem(PKCE_KEY);
    return { ok: true, session };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "OAuth failed" };
  }
}

export function disconnectCloud(): void {
  saveCloudSession(null);
}

export function providerLabel(p: CloudProvider): string {
  if (p === "dropbox") return "Dropbox";
  if (p === "google") return "Google Drive";
  return "OneDrive";
}

/**
 * Recommended path when OAuth client IDs aren't set:
 * use the provider's desktop sync folder as a local vault (FSA).
 */
export const CLOUD_SYNC_HINT =
  "Tip: Sync Dropbox / Drive / OneDrive to disk, then Open folder as vault — notes stay plain Markdown with zero accounts.";
