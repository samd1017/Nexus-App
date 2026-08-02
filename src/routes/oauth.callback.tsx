import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy OAuth callback — cloud uses synced folders only.
 * Redirect home so old bookmarks never blank-screen.
 */
export const Route = createFileRoute("/oauth/callback")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
