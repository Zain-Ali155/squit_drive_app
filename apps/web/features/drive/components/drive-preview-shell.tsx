"use client";

import type { ReactNode } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { Button } from "@workspace/ui";
import { DriveFileTypeIcon } from "./drive-file-icon";

type DrivePreviewSurfaceProps = Readonly<{
  fileName: string;
  mimeType?: string | undefined;
  sizeLabel: string;
  thumbnailUrl?: string | undefined;
  downloading: boolean;
  onDownload: () => void;
  onClose: () => void;
  children?: ReactNode;
}>;

type DriveUnsupportedPreviewProps = Readonly<{
  fileName: string;
  downloading: boolean;
  error?: string | undefined;
  onDownload: () => void;
}>;

export const DriveUnsupportedPreview = ({
  fileName,
  downloading,
  error,
  onDownload
}: DriveUnsupportedPreviewProps) => (
  <div className="flex h-full min-h-[min(55vh,420px)] items-center justify-center p-6">
    <div className="max-w-lg space-y-3 rounded-lg bg-white p-6 text-center shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">Preview not available</h2>
      <p className="break-words text-sm leading-6 text-slate-600">
        {fileName} can’t be previewed in SQUID Drive. Download it to open it with a compatible application.
      </p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button disabled={downloading} type="button" onClick={onDownload}>
        {downloading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
        Download file
      </Button>
    </div>
  </div>
);

export const DrivePreviewSurface = ({
  fileName,
  mimeType,
  sizeLabel,
  thumbnailUrl,
  downloading,
  onDownload,
  onClose,
  children
}: DrivePreviewSurfaceProps) => {
  return (
    <section aria-label={`File preview: ${fileName}`} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#f1f3f4]">
      <header className="z-20 flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 bg-[#202124] px-2 py-2 text-white sm:px-4">
        <Button
          aria-label="Close preview"
          className="size-10 shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
        <DriveFileTypeIcon className="size-8" fileName={fileName} mimeType={mimeType} thumbnailUrl={thumbnailUrl} />
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-medium sm:text-base" title={fileName}>{fileName}</h1>
          <p className="truncate text-xs text-white/65">{sizeLabel}</p>
        </div>
        <Button
          aria-label={downloading ? "Downloading file" : "Download file"}
          className="shrink-0 text-white hover:bg-white/10 hover:text-white"
          disabled={downloading}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onDownload}
        >
          <Download aria-hidden="true" className="size-5" />
        </Button>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {children}
      </div>
    </section>
  );
};
