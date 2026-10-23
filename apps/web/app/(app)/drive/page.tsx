import type { ReactElement } from "react";
import { createApiConfiguration, readWebEnvironment } from "@/config";
import { DriveWorkspace } from "@/features/drive/components/drive-workspace";

const DrivePage = (): ReactElement => {
  const api = createApiConfiguration(readWebEnvironment());
  return <DriveWorkspace apiBaseUrl={api.baseUrl} />;
};

export default DrivePage;
