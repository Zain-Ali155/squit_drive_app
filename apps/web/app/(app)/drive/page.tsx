import type { ReactElement } from "react";
import { createApiConfiguration, readWebEnvironment } from "@/config";
import { AuthControls } from "@/features/auth/components/auth-controls";
import { DriveWorkspace } from "@/features/drive/components/drive-workspace";

const DrivePage = (): ReactElement => {
  const api = createApiConfiguration(readWebEnvironment());
  return <DriveWorkspace
    apiBaseUrl={api.baseUrl}
    authControls={<AuthControls apiBaseUrl={api.baseUrl} className="flex shrink-0 items-center" compactLabel />}
  />;
};

export default DrivePage;
