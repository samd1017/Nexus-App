import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
import { NexusMark, NEXUS_NAME } from "@/components/brand/NexusLogo";

export const Route = createFileRoute("/")({
  component: Home,
  ssr: false,
});

function Home() {
  return (
    <main className="h-[calc(100dvh-var(--grok-banner-h,0px))] min-h-0 overflow-hidden">
      <ClientOnly
        fallback={
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-deepest,#050507)] text-[var(--text-secondary,#a1a1aa)]">
            <NexusMark size={32} className="text-[#f2f2f7]" />
            <span className="text-[14px]">Loading {NEXUS_NAME}…</span>
          </div>
        }
      >
        <AppShell />
      </ClientOnly>
    </main>
  );
}
