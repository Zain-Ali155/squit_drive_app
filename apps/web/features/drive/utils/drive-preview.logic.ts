import type { ApiDriveEntry } from "@workspace/types";
import { driveFileVisual } from "./drive-file-visual";
import type { DrivePreviewKind } from "../types/drive.types.js";

const previewableMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv"
]);

export const maxDrivePreviewBytes = 50_000_000;
export const maxDrivePptxPreviewBytes = maxDrivePreviewBytes;
export const maxDriveImagePreviewBytes = 15_000_000;

export const normalizeDriveMimeType = (mimeType: string | undefined): string | undefined => {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return normalized && previewableMimeTypes.has(normalized) ? normalized : undefined;
};

export const drivePreviewKind = (mimeType: string | undefined, fileName?: string): DrivePreviewKind | undefined => {
  if (fileName?.toLowerCase().endsWith(".csv")) return "csv";
  const rawMimeType = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (rawMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (
    fileName?.toLowerCase().endsWith(".pptx") &&
    (!rawMimeType || ["application/octet-stream", "application/zip", "application/x-zip-compressed"].includes(rawMimeType))
  ) return "pptx";
  const normalized = normalizeDriveMimeType(mimeType);
  if (normalized?.startsWith("image/")) return "image";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (normalized === "text/plain") return "text";
  if (normalized === "text/csv") return "csv";
  return undefined;
};

export const driveEntryOpenAction = (
  entry: Readonly<{ kind: ApiDriveEntry["kind"]; mimeType?: string; name?: string }>
): "folder" | "preview" | "unsupported" => {
  if (entry.kind === "folder") return "folder";
  return drivePreviewKind(entry.mimeType, entry.name) ? "preview" : "unsupported";
};

export const hasPdfFileSignature = async (blob: Blob): Promise<boolean> => {
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return new TextDecoder().decode(header) === "%PDF-";
};

const drivePreviewTypeLabels: Readonly<Record<DrivePreviewKind, string>> = Object.freeze({
  image: "Image",
  pdf: "PDF document",
  docx: "Word document",
  pptx: "PowerPoint presentation",
  text: "Plain text",
  csv: "CSV spreadsheet"
});

export const drivePreviewTypeLabel = (kind: DrivePreviewKind | undefined, mimeType?: string, fileName?: string): string => {
  if (kind) return drivePreviewTypeLabels[kind];
  const fileVisual = driveFileVisual(mimeType, fileName);
  if (fileVisual.type !== "generic") return fileVisual.label;
  const normalizedMimeType = mimeType?.split(";")[0]?.trim();
  if (normalizedMimeType && normalizedMimeType !== "application/octet-stream") return normalizedMimeType;
  const extension = fileName?.match(/\.([^.]+)$/u)?.[1];
  return extension ? `${extension.toUpperCase()} file` : "Unknown file type";
};
