import { Schema, model, type Model } from "mongoose";
import type { DriveEntryRecord } from "../drive.types.js";

export const driveEntryKinds = ["file", "folder"] as const;
export const driveEntryStates = ["active", "pending_delete"] as const;

export type { DriveEntryKind, DriveEntryRecord, DriveEntryState } from "../drive.types.js";
export type DriveRepositoryModel = Model<DriveEntryRecord>;

export const driveEntrySchema = new Schema<DriveEntryRecord>({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true },
  kind: { type: String, enum: driveEntryKinds, required: true },
  name: { type: String, required: true, maxlength: 255 },
  normalizedName: { type: String, required: true, maxlength: 255 },
  parentId: { type: String, default: null },
  isStarred: { type: Boolean, default: false, required: true },
  lastAccessedAt: { type: Date },
  mimeType: { type: String },
  sizeBytes: { type: Number, min: 0, max: 50_000_000 },
  storageKey: { type: String },
  state: { type: String, enum: driveEntryStates, default: "active", required: true }
}, { timestamps: true, versionKey: false });

driveEntrySchema.index(
  { ownerId: 1, parentId: 1, normalizedName: 1 },
  { unique: true, name: "drive_owner_parent_name_unique" }
);
driveEntrySchema.index(
  { ownerId: 1, parentId: 1, kind: 1, updatedAt: -1, _id: 1 },
  { name: "drive_owner_parent_listing" }
);
driveEntrySchema.index(
  { ownerId: 1, normalizedName: 1, kind: 1 },
  { name: "drive_owner_search" }
);
driveEntrySchema.index(
  { ownerId: 1, state: 1, isStarred: 1, kind: 1, normalizedName: 1, _id: 1 },
  { name: "drive_owner_favorites" }
);
driveEntrySchema.index(
  { ownerId: 1, state: 1, kind: 1, lastAccessedAt: -1, _id: 1 },
  { name: "drive_owner_recent" }
);
driveEntrySchema.index(
  { storageKey: 1 },
  { unique: true, partialFilterExpression: { storageKey: { $type: "string" } }, name: "drive_storage_key_unique" }
);

export const DriveEntryModel = model<DriveEntryRecord>("DriveEntry", driveEntrySchema);
