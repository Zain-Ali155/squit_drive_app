import type { DriveEntryRecord, DriveEntryState, DrivePage } from "../drive.types.js";

export type DriveRepository = Readonly<{
  findOwnedEntry: (ownerId: string, entryId: string) => Promise<DriveEntryRecord | null>;
  recordOwnedFileAccess: (ownerId: string, entryId: string, accessedAt: Date) => Promise<DriveEntryRecord | null>;
  findOwnedEntryForDeletion: (ownerId: string, entryId: string) => Promise<DriveEntryRecord | null>;
  listOwnedEntries: (ownerId: string, parentId: string | null, options: DrivePage) => Promise<Readonly<{
    entries: readonly DriveEntryRecord[]; total: number;
  }>>;
  getOwnedStorageUsage: (ownerId: string) => Promise<number>;
  createEntry: (entry: Omit<DriveEntryRecord, "createdAt" | "updatedAt">) => Promise<DriveEntryRecord>;
  hasOwnedUploadEntry: (ownerId: string, entryId: string, storageKey: string) => Promise<boolean>;
  updateOwnedEntry: (ownerId: string, entryId: string, changes: Readonly<{
    name?: string; parentId?: string | null; normalizedName?: string; state?: DriveEntryState; isStarred?: boolean;
  }>) => Promise<DriveEntryRecord | null>;
  hasOwnedChildren: (ownerId: string, parentId: string) => Promise<boolean>;
  deleteOwnedEntry: (ownerId: string, entryId: string) => Promise<boolean>;
  ensureRoot: (ownerId: string) => Promise<DriveEntryRecord>;
}>;
