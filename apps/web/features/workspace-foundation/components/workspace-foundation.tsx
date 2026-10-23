import type { ReactElement } from "react";
import { Activity } from "lucide-react";
import { Button, PageHeader, PageShell } from "@workspace/ui";
import { ApiBoundary } from "./api-boundary";
import { RuntimeFoundation } from "./runtime-foundation";

type WorkspaceFoundationProps = Readonly<{
  apiBaseUrl: string;
}>;

export const WorkspaceFoundation = ({ apiBaseUrl }: WorkspaceFoundationProps): ReactElement => (
  <PageShell>
    <PageHeader
      description="The SQUID monorepo is running as a local-only document management demo. Authentication is intentionally deferred."
      eyebrow="Workspace ready"
      icon={<Activity aria-hidden="true" className="size-5" />}
      title="Your local workspace is ready."
    />
    <div className="border-b border-border py-6">
      <Button asChild size="lg"><a href="/drive">Open SQUID Drive</a></Button>
    </div>
    <RuntimeFoundation />
    <ApiBoundary baseUrl={apiBaseUrl} />
  </PageShell>
);
