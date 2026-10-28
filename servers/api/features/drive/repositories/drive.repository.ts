import type { DriveEntryRecord, DriveEntryState, DrivePage, DriveShareRecord } from "../drive.types.js";

export type DriveRepository = Readonly<{
  findOwnedEntry: (ownerId: string, entryId: string) => Promise<DriveEntryRecord | null>;
  recordOwnedFileAccess: (ownerId: string, entryId: string, accessedAt: Date) => Promise<DriveEntryRecord | null>;
  findOwnedEntryForDeletion: (ownerId: string, entryId: string) => Promise<DriveEntryRecord | null>;
  listOwnedEntries: (ownerId: string, parentId: string | null, options: DrivePage) => Promise<Readonly<{
    entries: readonly DriveEntryRecord[]; total: number;
  }>>;
  getOwnedStorageUsage: (ownerId: string) => Promise<number>;
  reserveOwnedStorageQuota: (ownerId: string, reservationId: string, sizeBytes: number, usedBytes: number, expiresAt: Date) => Promise<boolean>;
  releaseOwnedStorageQuota: (ownerId: string, reservationId: string) => Promise<void>;
  createEntry: (entry: Omit<DriveEntryRecord, "createdAt" | "updatedAt">) => Promise<DriveEntryRecord>;
  hasOwnedUploadEntry: (ownerId: string, entryId: string, storageKey: string) => Promise<boolean>;
  updateOwnedEntry: (ownerId: string, entryId: string, changes: Readonly<{
    name?: string; parentId?: string | null; normalizedName?: string; state?: DriveEntryState; isStarred?: boolean;
  }>) => Promise<DriveEntryRecord | null>;
  moveOwnedEntryToTrash: (ownerId: string, entryId: string, trashedAt: Date) => Promise<DriveEntryRecord | null>;
  restoreOwnedEntry: (ownerId: string, entryId: string) => Promise<DriveEntryRecord | null>;
  markOwnedEntryPendingDelete: (ownerId: string, entryId: string) => Promise<DriveEntryRecord | null>;
  hasOwnedChildren: (ownerId: string, parentId: string) => Promise<boolean>;
  deleteOwnedEntry: (ownerId: string, entryId: string) => Promise<boolean>;
  ensureRoot: (ownerId: string) => Promise<DriveEntryRecord>;
  createShare: (share: Omit<DriveShareRecord, "createdAt" | "updatedAt">) => Promise<DriveShareRecord>;
  createOrRotateLinkShare: (share: Omit<DriveShareRecord, "createdAt" | "updatedAt">) => Promise<DriveShareRecord>;
  findSharesForOwnedEntry: (ownerId: string, entryId: string) => Promise<readonly DriveShareRecord[]>;
  findShareForRecipient: (shareId: string, recipientEmail: string) => Promise<DriveShareRecord | null>;
  findShareByTokenHash: (tokenHash: string) => Promise<DriveShareRecord | null>;
  deleteOwnedShare: (ownerId: string, entryId: string, shareId: string) => Promise<boolean>;
  deleteOwnedEntryShares: (ownerId: string, entryId: string) => Promise<void>;
}>;
