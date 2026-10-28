export type ApiDriveEntry = Readonly<{
  id: string;
  kind: "file" | "folder";
  name: string;
  parentId: string | null;
  isStarred: boolean;
  state?: "trashed" | "deletion_pending";
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}>;

export type ApiDriveListResponse = Readonly<{
  entries: readonly ApiDriveEntry[];
  total: number;
  parentId: string;
}>;

export type ApiDriveStorageUsage = Readonly<{ usedBytes: number; totalBytes: number }>;

export type ApiDriveShare = Readonly<{
  id: string;
  accessType: "link" | "email";
  recipientEmail?: string;
  expiresAt?: string;
  createdAt: string;
}>;

export type ApiDriveShareListResponse = Readonly<{ shares: readonly ApiDriveShare[] }>;

export type ApiDriveShareLinkResponse = Readonly<{
  id: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}>;

export type ApiDriveSharedFile = Readonly<{
  name: string;
  mimeType: string;
  sizeBytes: number;
}>;

export type ApiDriveFileType =
  | "folder"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "archive"
  | "video"
  | "text";

export type ApiDriveSortBy = "name" | "updatedAt" | "sizeBytes";
export type ApiDriveSortOrder = "asc" | "desc";

export type ApiDriveListQuery = Readonly<{
  parentId?: string;
  search?: string;
  favorites?: boolean;
  recent?: boolean;
  trash?: boolean;
  page?: number;
  pageSize?: number;
  fileType?: ApiDriveFileType;
  modifiedAfter?: string;
  modifiedBefore?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  sortBy?: ApiDriveSortBy;
  sortOrder?: ApiDriveSortOrder;
}>;

export type ApiDriveBreadcrumb = Readonly<{ id: string; name: string }>;

export type ApiDriveFolderPathResponse = Readonly<{
  breadcrumbs: readonly ApiDriveBreadcrumb[];
}>;
