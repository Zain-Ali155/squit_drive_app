export type ApiDriveEntry = Readonly<{
  id: string;
  kind: "file" | "folder";
  name: string;
  parentId: string | null;
  isStarred: boolean;
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

export type ApiDriveStorageUsage = Readonly<{ usedBytes: number }>;

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
