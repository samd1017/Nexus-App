import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeCloudOAuth } from "@/lib/cloud/oauth";
import { useVaultStore } from "@/lib/vault/store";

export const Route = createFileRoute("/oauth/callback")({
  component: OAuthCallback,
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
});

function OAuthCallback() {
  const { code, state, error } = Route.useSearch();
  const navigate = useNavigate();
  const refreshCloudSession = useVaultStore((s) => s.refreshCloudSession);
  const setToast = useVaultStore((s) => s.setToast);
  const [status, setStatus] = useState("Completing cloud connection…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (error) {
        setStatus(`OAuth error: ${error}`);
        return;
      }
      if (!code || !state) {
        setStatus("Missing OAuth code. You can close this tab.");
        return;
      }
      const result = await completeCloudOAuth(code, state);
      if (cancelled) return;
      if (result.ok) {
        refreshCloudSession();
        setToast("Cloud connected — tokens stored locally only");
        setStatus("Connected. Redirecting…");
        void navigate({ to: "/" });
      } else {
        setStatus(result.reason || "OAuth failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, state, error, navigate, refreshCloudSession, setToast]);

  return (
    <div className="flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] items-center justify-center bg-[#050507] px-6 text-center">
      <div className="glass-elevated max-w-md rounded-2xl p-8">
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-xl bg-[rgba(0,200,255,0.2)]" />
        <p className="text-[14px] text-[#a1a1aa]">{status}</p>
      </div>
    </div>
  );
}
