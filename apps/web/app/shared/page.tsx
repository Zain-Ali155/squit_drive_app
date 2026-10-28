import type { Metadata } from "next";
import type { ReactElement } from "react";
import { createApiConfiguration, readWebEnvironment } from "@/config";
import { PublicDriveSharePage } from "@/features/drive/components/public-drive-share-page";

export const metadata: Metadata = {
  title: "Shared file | SQUID Drive",
  robots: { index: false, follow: false }
};

const SharedFilePage = (): ReactElement => {
  const api = createApiConfiguration(readWebEnvironment());
  return <PublicDriveSharePage apiBaseUrl={api.baseUrl} />;
};

export default SharedFilePage;
