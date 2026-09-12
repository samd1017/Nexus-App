import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function DefaultNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[15px] font-medium text-[var(--text-primary)]">
        Page not found
      </p>
      <p className="text-[13px] text-[var(--text-muted)]">
        That route doesn’t exist in Nexus.
      </p>
      <a
        href="/"
        className="mt-2 text-[13px] text-[var(--accent)] underline-offset-2 hover:underline"
      >
        Back to app
      </a>
    </div>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: DefaultNotFound,
    defaultPreload: "intent",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
