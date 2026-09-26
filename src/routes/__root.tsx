import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { NEXUS_NAME, NEXUS_TAGLINE } from "@/components/brand/NexusLogo";
import appCss from "../styles.css?url";

const APP_NAME = NEXUS_NAME;
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.png` : "/og.png";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: `${NEXUS_TAGLINE}. Local-first knowledge vault — plain Markdown, visual editor, live graph. Zero accounts by default.`,
      },
      { name: "theme-color", content: "#050507" },
      { name: "application-name", content: APP_NAME },
      { property: "og:image", content: ogImage },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: NEXUS_TAGLINE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-[var(--bg-deepest,#050507)] text-[var(--text-primary,#f2f2f7)]">
        {/* No AuthProvider — core experience is fully offline, zero accounts */}
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
