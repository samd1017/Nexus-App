import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/")({
  component: Home,
  ssr: false,
});

function Home() {
  return (
    <main className="h-[calc(100dvh-var(--grok-banner-h,0px))] min-h-0 overflow-hidden">
      <ClientOnly
        fallback={
          <div className="flex h-full items-center justify-center bg-[#050507] text-[#a1a1aa]">
            Loading Note App…
          </div>
        }
      >
        <AppShell />
      </ClientOnly>
    </main>
  );
}
