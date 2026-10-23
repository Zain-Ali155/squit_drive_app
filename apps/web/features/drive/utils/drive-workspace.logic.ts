import type { ApiDriveBreadcrumb, ApiDriveEntry } from "@workspace/types";
import type { ApiDriveFileType, ApiDriveListQuery, ApiDriveSortBy, ApiDriveSortOrder } from "@workspace/types";

export const formatDriveStorageUsage = (sizeBytes: number): string => {
  if (sizeBytes < 1_000) return `${sizeBytes} B`;
  if (sizeBytes < 1_000_000) return `${(sizeBytes / 1_000).toFixed(1)} kB`;
  if (sizeBytes < 1_000_000_000) return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
  return `${(sizeBytes / 1_000_000_000).toFixed(2)} GB`;
};

export type DriveSortSelection =
  | "default"
  | "name-asc"
  | "name-desc"
  | "updatedAt-desc"
  | "updatedAt-asc"
  | "sizeBytes-asc"
  | "sizeBytes-desc";

export type DriveFilters = Readonly<{
  fileType: ApiDriveFileType | "";
  sort: DriveSortSelection;
}>;

export const emptyDriveFilters: DriveFilters = Object.freeze({
  fileType: "",
  sort: "default"
});

const driveSortOptions: Readonly<Record<DriveSortSelection, Readonly<{
  sortBy: ApiDriveSortBy;
  sortOrder: ApiDriveSortOrder;
}> | undefined>> = Object.freeze({
  default: undefined,
  "name-asc": { sortBy: "name", sortOrder: "asc" },
  "name-desc": { sortBy: "name", sortOrder: "desc" },
  "updatedAt-desc": { sortBy: "updatedAt", sortOrder: "desc" },
  "updatedAt-asc": { sortBy: "updatedAt", sortOrder: "asc" },
  "sizeBytes-asc": { sortBy: "sizeBytes", sortOrder: "asc" },
  "sizeBytes-desc": { sortBy: "sizeBytes", sortOrder: "desc" }
});

export const isDriveFileType = (value: string): value is ApiDriveFileType =>
  value === "folder" || value === "pdf" || value === "document" || value === "spreadsheet"
  || value === "presentation" || value === "image" || value === "archive" || value === "video" || value === "text";

export const isDriveSortSelection = (value: string): value is DriveSortSelection =>
  value === "default" || value === "name-asc" || value === "name-desc" || value === "updatedAt-desc"
  || value === "updatedAt-asc" || value === "sizeBytes-asc" || value === "sizeBytes-desc";

export const createDriveListFilterOptions = (filters: DriveFilters): Pick<
  ApiDriveListQuery,
  "fileType" | "sortBy" | "sortOrder"
> => {
  const selectedSort = driveSortOptions[filters.sort];
  return {
    ...(filters.fileType ? { fileType: filters.fileType } : {}),
    ...(selectedSort ? { sortBy: selectedSort.sortBy, sortOrder: selectedSort.sortOrder } : {})
  };
};

export const driveFiltersAreActive = (filters: DriveFilters): boolean =>
  Boolean(filters.fileType || driveSortOptions[filters.sort]);

export const driveFavoriteActionLabel = (entry: Pick<ApiDriveEntry, "name" | "isStarred">): string =>
  entry.isStarred ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`;

export type DriveLocation = Readonly<{
  breadcrumbs: readonly ApiDriveBreadcrumb[];
  parentId: string;
}>;

export const folderLocationFromBreadcrumbs = (breadcrumbs: readonly ApiDriveBreadcrumb[]): DriveLocation | undefined => {
  const current = breadcrumbs.at(-1);
  return current ? Object.freeze({ breadcrumbs, parentId: current.id }) : undefined;
};

export const folderLocationAtBreadcrumb = (
  breadcrumbs: readonly ApiDriveBreadcrumb[],
  index: number
): DriveLocation | undefined => folderLocationFromBreadcrumbs(breadcrumbs.slice(0, index + 1));

export const createFolderAndClearName = async (
  createFolder: () => Promise<unknown>,
  clearName: () => void
): Promise<void> => {
  await createFolder();
  clearName();
};

export type DriveMutationKind =
  | "create-folder"
  | "upload"
  | "rename"
  | "move"
  | "favorite"
  | "file-delete"
  | "folder-delete";

export const runDriveAction = async (
  action: () => Promise<unknown>,
  reload: () => Promise<void>,
  refreshStorageUsage: () => Promise<void>,
  mutation: DriveMutationKind
): Promise<void> => {
  await action();
  await reload();
  if (mutation === "upload" || mutation === "file-delete") await refreshStorageUsage();
};

type DriveRowClickTarget = Readonly<{ closest: (selector: string) => unknown }>;

export const isDriveRowActionTarget = (target: DriveRowClickTarget | null): boolean =>
  Boolean(target?.closest("button, a, input, [role='menuitem'], [data-drive-action]"));

export const cleanupDrivePreview = (
  abort: () => void,
  objectUrl: string | undefined,
  revokeObjectUrl: (url: string) => void
): void => {
  abort();
  if (objectUrl) revokeObjectUrl(objectUrl);
};
