import type { ReactElement } from "react";
import { createApiConfiguration, readWebEnvironment } from "@/config";
import { AuthControls } from "@/features/auth/components/auth-controls";
import { WorkspaceFoundation } from "@/features/workspace-foundation";

const HomePage = (): ReactElement => {
  const api = createApiConfiguration(readWebEnvironment());
  return (
    <WorkspaceFoundation
      authControls={
        <AuthControls
          apiBaseUrl={api.baseUrl}
          className="flex min-h-12 items-center justify-center"
          redirectAuthenticatedTo="/drive"
        />
      }
    />
  );
};

export default HomePage;
