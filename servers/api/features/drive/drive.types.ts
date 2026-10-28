import type { ApiDriveFileType, ApiDriveSortBy, ApiDriveSortOrder } from "@workspace/types";

export type DriveEntryKind = "file" | "folder";
export type DriveEntryState = "active" | "trashed" | "pending_delete";

export type DriveShareRecord = Readonly<{
  _id: string;
  ownerId: string;
  entryId: string;
  recipientEmail?: string;
  tokenHash?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type DriveEntryRecord = Readonly<{
  _id: string;
  ownerId: string;
  kind: DriveEntryKind;
  name: string;
  normalizedName: string;
  parentId: string | null;
  isStarred?: boolean;
  lastAccessedAt?: Date;
  mimeType?: string;
  sizeBytes?: number;
  storageKey?: string;
  state: DriveEntryState;
  trashedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type DrivePage = Readonly<{
  page: number;
  pageSize: number;
  search?: string;
  favorites?: boolean;
  recent?: boolean;
  trash?: boolean;
  fileType?: ApiDriveFileType;
  modifiedAfter?: string;
  modifiedBefore?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  sortBy?: ApiDriveSortBy;
  sortOrder?: ApiDriveSortOrder;
}>;
