import type { ReactElement } from "react";
import type { ReactNode } from "react";
import { HardDrive } from "lucide-react";
import { PageShell } from "@workspace/ui";

type WorkspaceFoundationProps = Readonly<{
  authControls: ReactNode;
}>;

export const WorkspaceFoundation = ({ authControls }: WorkspaceFoundationProps): ReactElement => (
  <PageShell className="min-h-[calc(100svh-3rem)] justify-center" width="narrow">
    <section aria-labelledby="welcome-heading" className="w-full py-12 sm:py-20">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <HardDrive aria-hidden="true" className="size-7" />
      </div>
      <p className="mt-8 text-center text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">SQUID</p>
      <h1 id="welcome-heading" className="mt-2 text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Your files, all in one place.</h1>
      <p className="mx-auto mt-5 max-w-xl text-center text-base leading-7 text-muted-foreground sm:text-lg">
        Store, find, preview, and share your files securely from one simple workspace.
      </p>
      <div className="mt-9 flex justify-center">{authControls}</div>
      <p className="mt-5 text-center text-sm text-muted-foreground">Sign in securely with your Google account.</p>
    </section>
  </PageShell>
);
