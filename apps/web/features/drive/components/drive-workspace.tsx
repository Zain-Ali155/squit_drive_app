"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Clock3, Copy, Download, Folder, FolderPlus, Grid2X2, HardDrive, Link2, List, LoaderCircle, MoreHorizontal, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@workspace/ui";
import { resolveBrowserApiBaseUrl } from "@/config/api";
import { Input } from "@workspace/ui/primitives/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/primitives/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@workspace/ui/primitives/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/primitives/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui/primitives/dropdown-menu";
import { createDriveApi } from "../drive.api";
import { driveEntryOpenAction, drivePreviewKind, drivePreviewTypeLabel, hasPdfFileSignature, maxDriveImagePreviewBytes, maxDrivePreviewBytes, maxDrivePptxPreviewBytes, maxDriveXlsxPreviewBytes } from "../utils/drive-preview.logic";
import type { DrivePreviewKind, DriveUploadProgress } from "../types/drive.types";
import { DriveFileVisual } from "./drive-file-icon";
import { DrivePreviewSurface, DriveUnsupportedPreview } from "./drive-preview-shell";
import {
  cleanupDrivePreview,
  createDriveListFilterOptions,
  createFolderAndClearName,
  driveFavoriteActionLabel,
  driveFiltersAreActive,
  emptyDriveFilters,
  driveStorageUsagePercent,
  formatDriveStorageUsage,
  folderLocationAtBreadcrumb,
  folderLocationFromBreadcrumbs,
  isDriveFileType,
  isDriveRowActionTarget,
  isDriveSortSelection,
  runDriveAction
} from "../utils/drive-workspace.logic";
import type { DriveFilters, DriveMutationKind } from "../utils/drive-workspace.logic";
import { maxDocxInputBytes } from "../utils/drive.docx";
import { DriveDocxDocumentPreview } from "./drive.docx-document-preview";
import { maxDriveCsvBytes, parseDriveCsv, type DriveCsvPreview } from "../utils/drive.csv";
import { DriveCsvTable } from "./drive.csv-preview";
import { parseDriveXlsxBlob, type DriveXlsxPreview } from "../utils/drive.xlsx";
import { DriveXlsxTable } from "./drive.xlsx-preview";
import { DrivePdfPreview } from "./drive-pdf";
import { DrivePptxPreview } from "./drive-pptx-preview";
import { DriveTextPreview } from "./drive-text-preview";
import { DriveImagePreview } from "./drive-image-preview";
import type { ApiDriveEntry, ApiDriveShare } from "@workspace/types";

const pageSize = 25;
const maxUploadBytes = 50_000_000;
const maxNameLength = 255;
const driveFileTypeLabels = {
  folder: "Folders",
  pdf: "PDF files",
  document: "Documents",
  spreadsheet: "Spreadsheets",
  presentation: "Presentations",
  image: "Images",
  archive: "Archives",
  video: "Videos",
  text: "Text files"
} as const;
const driveSortLabels = {
  default: "Default order",
  "name-asc": "Name (A to Z)",
  "name-desc": "Name (Z to A)",
  "updatedAt-desc": "Last modified (newest)",
  "updatedAt-asc": "Last modified (oldest)",
  "sizeBytes-asc": "File size (smallest)",
  "sizeBytes-desc": "File size (largest)"
} as const satisfies Record<DriveFilters["sort"], string>;
type Breadcrumb = Readonly<{ id: string; name: string }>;
type DriveViewMode = "list" | "grid";
type PreviewContent = Readonly<{
  entryId: string;
  kind: DrivePreviewKind;
  loading: boolean;
  url?: string;
  blob?: Blob;
  text?: string;
  csvPreview?: DriveCsvPreview;
  xlsxPreview?: DriveXlsxPreview;
  error?: string;
}>;

const formatSize = (sizeBytes?: number): string => {
  if (sizeBytes === undefined) return "Folder";
  if (sizeBytes < 1_000) return `${sizeBytes} B`;
  if (sizeBytes < 1_000_000) return `${(sizeBytes / 1_000).toFixed(1)} kB`;
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
};

const formatModified = (value: string): string => new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", year: "numeric"
}).format(new Date(value));

type DriveWorkspaceProps = Readonly<{ apiBaseUrl: string; authControls?: ReactNode }>;
type DriveStorageUsageProps = Readonly<{
  usedBytes: number | undefined;
  totalBytes: number | undefined;
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  className: string;
  compact?: boolean;
}>;

const DriveStorageUsage = ({ usedBytes, totalBytes, loading, error, onRetry, className, compact = false }: DriveStorageUsageProps) => compact ? (
  <section aria-label="Storage usage" aria-live="polite" className={className}>
    <div className="flex items-center justify-between gap-2 text-xs leading-4">
      <span className="shrink-0 font-medium text-muted-foreground">Storage</span>
      {loading
        ? <span className="truncate text-muted-foreground" role="status">Loading…</span>
        : error
          ? <span className="flex min-w-0 items-center gap-1 text-destructive"><span className="truncate">Unavailable</span><button className="shrink-0 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={onRetry}>Retry</button></span>
          : <span className="truncate font-semibold tabular-nums text-foreground">{formatDriveStorageUsage(usedBytes ?? 0)}{totalBytes !== undefined && ` / ${formatDriveStorageUsage(totalBytes)}`}</span>}
    </div>
    {!loading && !error && usedBytes !== undefined && totalBytes !== undefined && <div aria-label="Storage quota usage" aria-valuemax={totalBytes} aria-valuemin={0} aria-valuenow={Math.min(usedBytes, totalBytes)} className="mt-1 h-1 overflow-hidden rounded-full bg-muted" role="meter">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${driveStorageUsagePercent(usedBytes, totalBytes)}%` }} />
    </div>}
  </section>
) : (
  <section aria-label="Storage usage" aria-live="polite" className={`rounded-xl border border-border bg-background p-3 ${className}`}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <HardDrive aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">Storage</p>
        {loading
          ? <p className="truncate text-xs text-muted-foreground" role="status">Loading storage…</p>
          : error
            ? <div className="flex min-w-0 items-center gap-2 text-xs text-destructive"><span className="truncate">Storage unavailable</span><button className="shrink-0 rounded px-1 py-0.5 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={onRetry}>Retry</button></div>
            : <p className="truncate text-sm font-semibold tabular-nums text-foreground">{formatDriveStorageUsage(usedBytes ?? 0)} <span className="text-xs font-normal text-muted-foreground">used</span>{totalBytes !== undefined && <span className="text-xs font-normal text-muted-foreground"> / {formatDriveStorageUsage(totalBytes)}</span>}</p>}
      </div>
    </div>
    {!loading && !error && usedBytes !== undefined && totalBytes !== undefined && <div aria-label="Storage quota usage" aria-valuemax={totalBytes} aria-valuemin={0} aria-valuenow={Math.min(usedBytes, totalBytes)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="meter">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${driveStorageUsagePercent(usedBytes, totalBytes)}%` }} />
    </div>}
  </section>
);

type DriveFilterControlsProps = Readonly<{
  filters: DriveFilters;
  onFileTypeChange: (value: string) => void;
  onSortChange: (value: string) => void;
  className: string;
}>;

const DriveFilterControls = ({ filters, onFileTypeChange, onSortChange, className }: DriveFilterControlsProps) => (
  <div aria-label="Drive filters" className={className}>
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      File type
      <Select value={filters.fileType || "all"} onValueChange={onFileTypeChange}>
        <SelectTrigger aria-label="Filter by file type" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All file types</SelectItem>
          <SelectItem value="folder">Folders</SelectItem>
          <SelectItem value="pdf">PDF files</SelectItem>
          <SelectItem value="document">Documents</SelectItem>
          <SelectItem value="spreadsheet">Spreadsheets</SelectItem>
          <SelectItem value="presentation">Presentations</SelectItem>
          <SelectItem value="image">Images</SelectItem>
          <SelectItem value="archive">Archives</SelectItem>
          <SelectItem value="video">Videos</SelectItem>
          <SelectItem value="text">Text files</SelectItem>
        </SelectContent>
      </Select>
    </label>
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      Sort by
      <Select value={filters.sort} onValueChange={onSortChange}>
        <SelectTrigger aria-label="Sort Drive entries" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default order</SelectItem>
          <SelectItem value="name-asc">Name (A to Z)</SelectItem>
          <SelectItem value="name-desc">Name (Z to A)</SelectItem>
          <SelectItem value="updatedAt-desc">Last modified (newest)</SelectItem>
          <SelectItem value="updatedAt-asc">Last modified (oldest)</SelectItem>
          <SelectItem value="sizeBytes-asc">File size (smallest)</SelectItem>
          <SelectItem value="sizeBytes-desc">File size (largest)</SelectItem>
        </SelectContent>
      </Select>
    </label>
  </div>
);

export const DriveWorkspace = ({ apiBaseUrl, authControls }: DriveWorkspaceProps) => {
  const api = useMemo(() => createDriveApi({ baseUrl: resolveBrowserApiBaseUrl(apiBaseUrl) }), [apiBaseUrl]);
  const loadThumbnail = useCallback(
    (fileId: string, signal: AbortSignal, fileName: string): Promise<Blob> =>
      api.previewFile(fileId, signal, maxDriveImagePreviewBytes, fileName),
    [api]
  );
  const [entries, setEntries] = useState<readonly ApiDriveEntry[]>([]);
  const [parentId, setParentId] = useState<string>();
  const [rootId, setRootId] = useState<string>();
  const [path, setPath] = useState<readonly Breadcrumb[]>([]);
  const [search, setSearch] = useState("");
  const [favoritesView, setFavoritesView] = useState(false);
  const [recentView, setRecentView] = useState(false);
  const [trashView, setTrashView] = useState(false);
  const [viewMode, setViewMode] = useState<DriveViewMode>("list");
  const [filters, setFilters] = useState<DriveFilters>(emptyDriveFilters);
  const [page, setPage] = useState(1);
  const [listRefresh, setListRefresh] = useState(0);
  const [storageUsage, setStorageUsage] = useState<number>();
  const [storageQuota, setStorageQuota] = useState<number>();
  const [storageUsageLoading, setStorageUsageLoading] = useState(true);
  const [storageUsageError, setStorageUsageError] = useState<string>();
  const [total, setTotal] = useState(0);
  const [folderName, setFolderName] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameEntry, setRenameEntry] = useState<ApiDriveEntry>();
  const [renameName, setRenameName] = useState("");
  const [renameValidationError, setRenameValidationError] = useState<string>();
  const [deleteEntry, setDeleteEntry] = useState<ApiDriveEntry>();
  const [shareEntry, setShareEntry] = useState<ApiDriveEntry>();
  const [shareLinkUrl, setShareLinkUrl] = useState<string>();
  const [shares, setShares] = useState<readonly ApiDriveShare[]>([]);
  const [sharesEntryId, setSharesEntryId] = useState<string>();
  const [shareBusy, setShareBusy] = useState(false);
  const [revokingShareId, setRevokingShareId] = useState<string>();
  const [shareError, setShareError] = useState<string>();
  const [shareNotice, setShareNotice] = useState<string>();
  const [unsupportedEntry, setUnsupportedEntry] = useState<ApiDriveEntry>();
  const [previewEntry, setPreviewEntry] = useState<ApiDriveEntry>();
  const [previewContent, setPreviewContent] = useState<PreviewContent>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloadingEntryId, setDownloadingEntryId] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<DriveUploadProgress>();
  const [error, setError] = useState<string>();
  const downloadsInFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!shareEntry) return;
    let active = true;
    void api.listShares(shareEntry.id).then(({ shares: currentShares }) => {
      if (active) {
        setShares(currentShares);
        setSharesEntryId(shareEntry.id);
      }
    }).catch((cause: unknown) => {
      if (active) {
        setShares([]);
        setShareError(cause instanceof Error ? cause.message : "Could not load sharing access.");
        setSharesEntryId(shareEntry.id);
      }
    });
    return () => { active = false; };
  }, [api, shareEntry]);

  const openShare = (entry: ApiDriveEntry): void => {
    setShareEntry(entry);
    setShareLinkUrl(undefined);
    setShareError(undefined);
    setShareNotice(undefined);
  };

  const createShareLink = async (): Promise<void> => {
    if (!shareEntry) return;
    setShareBusy(true);
    setShareError(undefined);
    setShareNotice(undefined);
    try {
      const created = await api.createShareLink(shareEntry.id);
      const link = `${window.location.origin}/shared#${created.token}`;
      setShareLinkUrl(link);
      const createdShare: ApiDriveShare = {
        id: created.id,
        accessType: "link",
        expiresAt: created.expiresAt,
        createdAt: created.createdAt
      };
      setShares((current) => [...(sharesEntryId === shareEntry.id ? current.filter((share) => share.accessType !== "link") : []), createdShare]);
      setSharesEntryId(shareEntry.id);
      setShareNotice("Download link created. Anyone with the link can download this file for 7 days.");
      try {
        await navigator.clipboard.writeText(link);
        setShareNotice("Download link copied. Anyone with the link can download this file for 7 days.");
      } catch {
        setShareNotice("Download link created. Copy it below; anyone with the link can download for 7 days.");
      }
    } catch (cause) {
      setShareError(cause instanceof Error ? cause.message : "Could not create the download link.");
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async (): Promise<void> => {
    if (!shareLinkUrl) return;
    try {
      await navigator.clipboard.writeText(shareLinkUrl);
      setShareNotice("Download link copied.");
      setShareError(undefined);
    } catch {
      setShareError("Clipboard access is unavailable. Select and copy the link below.");
    }
  };

  const revokeShareAccess = async (shareId: string): Promise<void> => {
    if (!shareEntry) return;
    setRevokingShareId(shareId);
    setShareError(undefined);
    try {
      await api.revokeShare(shareEntry.id, shareId);
      setShares((current) => current.filter((share) => share.id !== shareId));
      if (shares.find((share) => share.id === shareId)?.accessType === "link") setShareLinkUrl(undefined);
      setShareNotice("Download access removed.");
    } catch (cause) {
      setShareError(cause instanceof Error ? cause.message : "Could not remove sharing access.");
    } finally {
      setRevokingShareId(undefined);
    }
  };
  const recentViewRef = useRef(recentView);
  useEffect(() => { recentViewRef.current = recentView; }, [recentView]);
  const recordOpenedFile = useCallback((entryId: string): void => {
    void api.recordFileAccess(entryId).then(() => {
      if (recentViewRef.current) setListRefresh((current) => current + 1);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not record this file as recently opened.");
    });
  }, [api]);
  const markPreviewOpened = useCallback((): void => {
    if (previewEntry) recordOpenedFile(previewEntry.id);
  }, [previewEntry, recordOpenedFile]);
  const loadStorageUsage = useCallback(async (): Promise<void> => {
    setStorageUsageLoading(true);
    setStorageUsageError(undefined);
    try {
      const result = await api.storageUsage();
      setStorageUsage(result.usedBytes);
      setStorageQuota(result.totalBytes);
    } catch (cause) {
      setStorageUsageError(cause instanceof Error ? cause.message : "Could not load storage usage.");
    } finally {
      setStorageUsageLoading(false);
    }
  }, [api]);

  const listInput = useMemo(() => ({
    ...(!search.trim() && !favoritesView && !recentView && !trashView && parentId ? { parentId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(favoritesView ? { favorites: true } : {}),
    ...(recentView ? { recent: true } : {}),
    ...(trashView ? { trash: true } : {}),
    ...createDriveListFilterOptions(filters),
    page,
    pageSize
  }), [favoritesView, filters, page, parentId, recentView, search, trashView]);
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      let result = await api.list(listInput);
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (listInput.page > lastPage) {
        setPage(lastPage);
        result = await api.list({ ...listInput, page: lastPage });
      }
      setEntries(result.entries);
      setTotal(result.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Drive entries.");
    } finally {
      setLoading(false);
    }
  }, [api, listInput]);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        let result = await api.list(listInput);
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (listInput.page > lastPage) {
          setTotal(result.total);
          setPage(lastPage);
          result = await api.list({ ...listInput, page: lastPage });
          if (!active) return;
        }
        setEntries(result.entries);
        setTotal(result.total);
        if (!rootId) {
          setRootId(result.parentId);
          setParentId(result.parentId);
          setPath([{ id: result.parentId, name: "My Drive" }]);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Drive entries.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [api, listInput, listRefresh, rootId]);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const result = await api.storageUsage();
        if (active) setStorageUsage(result.usedBytes);
        if (active) setStorageQuota(result.totalBytes);
      } catch (cause) {
        if (active) setStorageUsageError(cause instanceof Error ? cause.message : "Could not load storage usage.");
      } finally {
        if (active) setStorageUsageLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!previewEntry) return;
    const kind = drivePreviewKind(previewEntry.mimeType, previewEntry.name);
    if (!kind) return;

    const controller = new AbortController();
    let active = true;
    let objectUrl: string | undefined;
    const maxBytes = kind === "csv" || kind === "text"
      ? maxDriveCsvBytes
      : kind === "docx" ? maxDocxInputBytes
        : kind === "xlsx" ? maxDriveXlsxPreviewBytes
          : kind === "image" ? maxDriveImagePreviewBytes
          : kind === "pptx" ? maxDrivePptxPreviewBytes : maxDrivePreviewBytes;
    const completePreview = (content: Omit<PreviewContent, "entryId">, opened = true): void => {
      if (!active) return;
      setPreviewContent({ ...content, entryId: previewEntry.id });
      if (opened) recordOpenedFile(previewEntry.id);
    };
    void api.previewFile(previewEntry.id, controller.signal, maxBytes, previewEntry.name).then(async (blob) => {
      const actualKind = drivePreviewKind(blob.type, previewEntry.name);
      if (!actualKind) throw new Error("Preview is not available for this file type.");
      if (actualKind === "text") {
        const text = await blob.text();
        completePreview({ kind: actualKind, loading: false, text });
        return;
      }
      if (actualKind === "csv") {
        const csvPreview = parseDriveCsv(await blob.text());
        completePreview({ kind: actualKind, loading: false, csvPreview });
        return;
      }
      if (actualKind === "docx") {
        completePreview({ kind: actualKind, loading: false, blob }, false);
        return;
      }
      if (actualKind === "xlsx") {
        const xlsxPreview = await parseDriveXlsxBlob(blob);
        completePreview({ kind: actualKind, loading: false, xlsxPreview });
        return;
      }
      if (actualKind === "pdf" && !await hasPdfFileSignature(blob)) {
        throw new Error("This file does not contain a valid PDF document.");
      }
      if (actualKind === "pdf") {
        completePreview({ kind: actualKind, loading: false, blob }, false);
        return;
      }
      if (actualKind === "pptx") {
        completePreview({ kind: actualKind, loading: false, blob }, false);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      if (active) completePreview({ kind: actualKind, loading: false, url: objectUrl }, false);
      else URL.revokeObjectURL(objectUrl);
    }).catch((cause: unknown) => {
      if (active && !(cause instanceof Error && cause.name === "AbortError")) {
        setPreviewContent({
          entryId: previewEntry.id,
          kind,
          loading: false,
          error: cause instanceof Error ? cause.message : "Could not load this preview."
        });
      }
    });
    return () => {
      active = false;
      cleanupDrivePreview(() => controller.abort(), objectUrl, (url) => URL.revokeObjectURL(url));
    };
  }, [api, previewEntry, recordOpenedFile]);

  const runAction = async (action: () => Promise<unknown>, mutation: DriveMutationKind): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      await runDriveAction(action, reload, loadStorageUsage, mutation);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Drive action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || !parentId) return;
    const created = await runAction(() => createFolderAndClearName(
      () => api.createFolder({ name, parentId }),
      () => setFolderName("")
    ), "create-folder");
    if (created) setCreateFolderOpen(false);
  };

  const upload = async (file: File | undefined): Promise<void> => {
    if (!file || !parentId) return;
    if (file.size > maxUploadBytes) {
      setError("Files must be 50,000,000 bytes or smaller.");
      return;
    }
    setUploadProgress({ loaded: 0, total: file.size });
    try {
      await runAction(() => api.uploadFile(file, parentId, setUploadProgress), "upload");
    } finally {
      setUploadProgress(undefined);
    }
  };

  const download = async (entry: ApiDriveEntry): Promise<void> => {
    if (downloadsInFlight.current.size > 0) return;
    downloadsInFlight.current.add(entry.id);
    setDownloadingEntryId(entry.id);
    setError(undefined);
    try {
      const blob = await api.downloadFile(entry.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = entry.name;
      try {
        document.body.append(link);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      } catch (cause) {
        URL.revokeObjectURL(objectUrl);
        throw cause;
      } finally {
        link.remove();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download this file.");
    } finally {
      downloadsInFlight.current.delete(entry.id);
      setDownloadingEntryId(undefined);
    }
  };

  const openFolder = async (entry: ApiDriveEntry): Promise<void> => {
    setLoading(true);
    setError(undefined);
    setFavoritesView(false);
    setRecentView(false);
    setTrashView(false);
    if (search.trim() || favoritesView) {
      try {
        const result = await api.folderPath(entry.id);
        const location = folderLocationFromBreadcrumbs(result.breadcrumbs);
        if (!location || location.parentId !== entry.id) throw new Error("Could not load this folder path.");
        setPath(location.breadcrumbs);
        setParentId(location.parentId);
        setSearch("");
        setPage(1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load this folder path.");
        setLoading(false);
      }
      return;
    }
    setParentId(entry.id);
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
    setSearch("");
    setPage(1);
  };

  const openEntry = (entry: ApiDriveEntry): void => {
    const action = driveEntryOpenAction(entry);
    if (action === "folder") {
      void openFolder(entry);
      return;
    }
    if (action === "preview") {
      const kind = drivePreviewKind(entry.mimeType, entry.name);
      if (!kind) return;
      setError(undefined);
      setPreviewContent({ entryId: entry.id, kind, loading: true });
      setPreviewEntry(entry);
      return;
    }
    setError(undefined);
    setUnsupportedEntry(entry);
  };

  const openEntryFromRow = (event: MouseEvent<HTMLLIElement>, entry: ApiDriveEntry): void => {
    if (trashView) return;
    const target = event.target instanceof Element ? event.target : null;
    if (isDriveRowActionTarget(target)) return;
    openEntry(entry);
  };

  const goTo = (index: number): void => {
    const location = folderLocationAtBreadcrumb(path, index);
    if (!location) return;
    setLoading(true);
    setFavoritesView(false);
    setRecentView(false);
    setTrashView(false);
    setPath(location.breadcrumbs);
    setParentId(location.parentId);
    setSearch("");
    setPage(1);
  };

  const openRename = (entry: ApiDriveEntry): void => {
    setRenameEntry(entry);
    setRenameName(entry.name);
    setRenameValidationError(undefined);
    setError(undefined);
  };

  const rename = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!renameEntry) return;
    const name = renameName.trim();
    if (!name) {
      setRenameValidationError("Enter a name.");
      return;
    }
    if (name.length > maxNameLength) {
      setRenameValidationError(`Names must be ${maxNameLength} characters or fewer.`);
      return;
    }
    if (name.includes("/") || name.includes("\\") || Array.from(name).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })) {
      setRenameValidationError("Names cannot contain slashes or control characters.");
      return;
    }
    setRenameValidationError(undefined);
    if (name === renameEntry.name) {
      setRenameEntry(undefined);
      return;
    }
    if (await runAction(() => api.updateEntry(renameEntry.id, { name }), "rename")) setRenameEntry(undefined);
  };

  const moveHere = async (entry: ApiDriveEntry): Promise<void> => {
    if (!parentId || entry.parentId === parentId) return;
    await runAction(() => api.updateEntry(entry.id, { parentId }), "move");
  };

  const setFavorite = async (entry: ApiDriveEntry): Promise<void> => {
    await runAction(() => api.setFavorite(entry.id, !entry.isStarred), "favorite");
  };

  const remove = async (): Promise<void> => {
    if (!deleteEntry) return;
    const action = trashView ? api.permanentlyDeleteEntry(deleteEntry.id) : api.deleteEntry(deleteEntry.id);
    const mutation = trashView ? "permanent-delete" : "trash";
    if (await runAction(() => action, mutation)) setDeleteEntry(undefined);
  };

  const restore = async (entry: ApiDriveEntry): Promise<void> => {
    await runAction(() => api.restoreEntry(entry.id), "restore");
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activePreview = previewContent?.entryId === previewEntry?.id ? previewContent : undefined;

  const searchActive = search.trim().length > 0;
  const filtersActive = driveFiltersAreActive(filters);
  const currentFolder = path.at(-1)?.name ?? "My Drive";
  const currentViewName = trashView ? "Trash" : recentView ? "Recent" : favoritesView ? "Favorites" : currentFolder;
  const enterTrash = (): void => {
    setLoading(true);
    setTrashView(true);
    setFavoritesView(false);
    setRecentView(false);
    setSearch("");
    setFilters(emptyDriveFilters);
    setPage(1);
  };
  const displayedPreviewEntry = previewEntry ?? unsupportedEntry;
  const updateFilter = (update: () => void): void => {
    setLoading(true);
    setPage(1);
    update();
  };
  const selectFileType = (value: string): void => {
    if (value === "all" || isDriveFileType(value)) {
      updateFilter(() => setFilters((current) => ({ ...current, fileType: value === "all" ? "" : value })));
    }
  };
  const selectSort = (value: string): void => {
    if (isDriveSortSelection(value)) updateFilter(() => setFilters((current) => ({ ...current, sort: value })));
  };
  const closePreview = (): void => {
    setPreviewEntry(undefined);
    setUnsupportedEntry(undefined);
  };

  return (
    <main className="min-h-dvh bg-muted/30 text-foreground">
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-background lg:flex" aria-label="Drive sidebar">
          <a href="/drive" className="flex items-center gap-3 px-6 py-6 text-foreground no-underline">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><HardDrive aria-hidden="true" className="size-5" /></span>
            <span className="leading-tight"><span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">SQUID</span><span className="text-lg font-semibold tracking-tight">Drive</span></span>
          </a>
          {!trashView && <div className="px-4 pb-5">
            <Button className="h-11 w-full justify-start rounded-xl px-5 shadow-sm" onClick={() => { setError(undefined); setCreateFolderOpen(true); }}><Plus aria-hidden="true" className="size-5" /> New</Button>
          </div>}
          <nav aria-label="Drive navigation" className="space-y-1 px-3">
            <button aria-current={searchActive || favoritesView || recentView || trashView ? undefined : "page"} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${searchActive || favoritesView || recentView || trashView ? "text-muted-foreground hover:bg-muted" : "bg-primary/10 text-primary"}`} type="button" onClick={() => goTo(0)}>
              <HardDrive aria-hidden="true" className="size-4" /> My Drive
            </button>
            <button aria-current={favoritesView && !searchActive ? "page" : undefined} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${favoritesView && !searchActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={() => { setLoading(true); setTrashView(false); setFavoritesView(true); setRecentView(false); setPage(1); }}>
              <Star aria-hidden="true" className="size-4" /> Favorites
            </button>
            <button aria-current={recentView && !searchActive ? "page" : undefined} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${recentView && !searchActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={() => { setLoading(true); setTrashView(false); setFavoritesView(false); setRecentView(true); setPage(1); }}>
              <Clock3 aria-hidden="true" className="size-4" /> Recent
            </button>
            <button aria-current={trashView ? "page" : undefined} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${trashView ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={enterTrash}>
              <Trash2 aria-hidden="true" className="size-4" /> Trash
            </button>
          </nav>
          <div className="mt-auto pt-8">
            <DriveStorageUsage
              className="px-4 pb-5"
              usedBytes={storageUsage}
              totalBytes={storageQuota}
              loading={storageUsageLoading}
              error={storageUsageError}
              onRetry={() => { void loadStorageUsage(); }}
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center justify-between gap-3 lg:contents">
                <a href="/drive" aria-label="SQUID Drive home" className="flex shrink-0 items-center gap-2 text-foreground no-underline lg:hidden">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><HardDrive aria-hidden="true" className="size-4" /></span>
                <span className="font-semibold">SQUID Drive</span>
                </a>
                <div className="ml-auto flex shrink-0 items-center gap-2 lg:order-2">
                  {!trashView && <Button className="lg:hidden" onClick={() => { setError(undefined); setCreateFolderOpen(true); }}><Plus aria-hidden="true" /> New</Button>}
                  {authControls && <div className="flex shrink-0 items-center">{authControls}</div>}
                </div>
              </div>
              <label className="relative order-2 min-w-0 flex-1 lg:order-1 lg:max-w-2xl">
                <span className="sr-only">Search all files and folders</span>
                <Search aria-hidden="true" className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search all Drive" className="h-11 rounded-xl border-transparent bg-muted/70 pl-10 pr-10 shadow-none transition-colors focus-visible:border-input focus-visible:bg-background" type="search" placeholder="Search all Drive" value={search} onChange={(event) => { setLoading(true); setTrashView(false); setSearch(event.target.value); setPage(1); }} />
                {search.length > 0 && <button aria-label="Clear search" className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={() => { setLoading(true); setSearch(""); setPage(1); }}><X aria-hidden="true" className="size-4" /></button>}
              </label>
            </div>
          </header>
          <nav aria-label="Drive views" className="flex gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 lg:hidden">
            <button aria-current={searchActive || favoritesView || recentView || trashView ? undefined : "page"} className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${searchActive || favoritesView || recentView || trashView ? "text-muted-foreground hover:bg-muted" : "bg-primary/10 text-primary"}`} type="button" onClick={() => goTo(0)}><HardDrive aria-hidden="true" className="size-4" /> My Drive</button>
            <button aria-current={favoritesView && !searchActive ? "page" : undefined} className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${favoritesView && !searchActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={() => { setLoading(true); setTrashView(false); setFavoritesView(true); setRecentView(false); setPage(1); }}><Star aria-hidden="true" className="size-4" /> Favorites</button>
            <button aria-current={recentView && !searchActive ? "page" : undefined} className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${recentView && !searchActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={() => { setLoading(true); setTrashView(false); setFavoritesView(false); setRecentView(true); setPage(1); }}><Clock3 aria-hidden="true" className="size-4" /> Recent</button>
            <button aria-current={trashView ? "page" : undefined} className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${trashView ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={enterTrash}><Trash2 aria-hidden="true" className="size-4" /> Trash</button>
          </nav>

          <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-8">
            <div className="mb-5 flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{searchActive ? `Global search · ${favoritesView ? "Favorites" : recentView ? "Recent files" : "All Drive folders"}` : trashView ? "Deleted items" : recentView ? "Recently opened files" : favoritesView ? "Your starred items" : "Your workspace"}</p>
                <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{searchActive ? "Search results" : currentViewName}</h1>
                {path.length > 1 && <nav aria-label="Folder path" className="mt-2 flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-muted-foreground">
                  {path.map((crumb, index) => (
                    <span className="flex shrink-0 items-center gap-1" key={crumb.id}>
                      {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5" />}
                      <button className={`max-w-40 truncate rounded px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === path.length - 1 ? "font-medium text-foreground" : ""}`} type="button" onClick={() => goTo(index)}>{crumb.name}</button>
                    </span>
                  ))}
                </nav>}
                {searchActive && <p className="mt-2 truncate text-xs text-muted-foreground">Across {favoritesView ? "Favorites" : recentView ? "Recent files" : "all Drive folders"} for “{search.trim()}”</p>}
              </div>
              <div className="flex flex-wrap shrink-0 items-center gap-2 sm:justify-end">
                <p className="mr-1 rounded-full bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-border">{total} {total === 1 ? "item" : "items"}</p>
                <div aria-label="Drive view" className="inline-flex items-center rounded-lg border border-input bg-background p-1" role="group">
                  <Button
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                    className="h-8 px-2.5"
                    size="sm"
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    onClick={() => setViewMode("list")}
                  ><List aria-hidden="true" className="size-4" /><span className="sr-only">List View</span></Button>
                  <Button
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    className="h-8 px-2.5"
                    size="sm"
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    onClick={() => setViewMode("grid")}
                  ><Grid2X2 aria-hidden="true" className="size-4" /><span className="sr-only">Grid View</span></Button>
                </div>
                {!trashView && <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-within:ring-2 focus-within:ring-ring has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
                  <Upload aria-hidden="true" className="size-4" /><span>Upload files</span>
                  <input aria-label="Upload files" className="sr-only" type="file" disabled={busy || !parentId} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                </label>}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
              <DriveStorageUsage
                className="min-w-[9rem] flex-1 rounded-lg border border-border bg-background px-3 py-2"
                usedBytes={storageUsage}
                totalBytes={storageQuota}
                loading={storageUsageLoading}
                error={storageUsageError}
                onRetry={() => { void loadStorageUsage(); }}
                compact
              />
            {!trashView && <details aria-label="Filters and sorting" className="shrink-0 rounded-lg border border-border/80 bg-background px-3 py-1 shadow-sm open:order-3 open:w-full sm:hidden">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium text-foreground outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
                <span>Filters &amp; sort</span>
                {filtersActive && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Active</span>}
                <ChevronRight aria-hidden="true" className="ml-auto size-4 text-muted-foreground transition-transform open:rotate-90" />
              </summary>
              <DriveFilterControls filters={filters} onFileTypeChange={selectFileType} onSortChange={selectSort} className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3" />
            </details>}
            </div>
            {!trashView && <div aria-label="Filters and sorting" className="mb-5 hidden w-full items-center justify-between gap-5 rounded-xl border border-border/80 bg-background px-5 py-4 shadow-sm sm:flex">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><SlidersHorizontal aria-hidden="true" className="size-4" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Filter and sort</p>
                  <p className="text-xs text-muted-foreground">Narrow items by type or choose their order.</p>
                </div>
              </div>
              <DriveFilterControls filters={filters} onFileTypeChange={selectFileType} onSortChange={selectSort} className="grid shrink-0 grid-cols-[11rem_12rem] items-end gap-3" />
            </div>}
            {!trashView && filtersActive && <div aria-label="Active filters" className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Filtered by</span>
              {filters.fileType && <button aria-label={`Clear file type filter: ${driveFileTypeLabels[filters.fileType]}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={() => selectFileType("all")}>
                {driveFileTypeLabels[filters.fileType]}<X aria-hidden="true" className="size-3.5 text-muted-foreground" />
              </button>}
              {filters.sort !== "default" && <button aria-label={`Clear sort filter: ${driveSortLabels[filters.sort]}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={() => selectSort("default")}>
                {driveSortLabels[filters.sort]}<X aria-hidden="true" className="size-3.5 text-muted-foreground" />
              </button>}
            </div>}

            {uploadProgress && <div className="mb-5 rounded-xl border border-border bg-background p-4" aria-live="polite">
              <div className="mb-2 flex justify-between text-sm"><span className="font-medium">Uploading file…</span><span className="text-muted-foreground">{Math.min(100, Math.floor((uploadProgress.loaded / Math.max(uploadProgress.total, 1)) * 100))}%</span></div>
              <progress className="h-2 w-full accent-primary" aria-label="Upload progress" max={uploadProgress.total || 1} value={uploadProgress.loaded} />
            </div>}

            <section aria-labelledby="entries-heading" aria-busy={loading} className="flex flex-1 flex-col">
              <h2 id="entries-heading" className="sr-only">{searchActive ? "Search results" : trashView ? "Drive Trash" : recentView ? "Recently opened files" : favoritesView ? "Favorite files and folders" : `${currentFolder} files and folders`}</h2>
              {error && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                <p>{error}</p>
                <Button disabled={loading || busy} size="sm" variant="outline" onClick={() => { void reload(); }}>Retry</Button>
              </div>}
              {busy && !uploadProgress && <p className="mb-4 text-sm text-muted-foreground" role="status">Saving Drive changes…</p>}
              {loading ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-background text-sm text-muted-foreground"><span className="flex size-12 items-center justify-center rounded-full bg-primary/10"><LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary" /></span>Loading your Drive…</div>
              ) : !error && entries.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background px-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Folder aria-hidden="true" className="size-6" /></span>
                  <div><p className="font-semibold">{searchActive ? "No matching files or folders" : trashView ? "Trash is empty" : filtersActive ? "No items match these filters" : recentView ? "No recent files yet" : favoritesView ? "No favorites yet" : "This folder is empty"}</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">{searchActive ? "Try a different name or clear your search." : trashView ? "Items you move to Trash will appear here. You can restore them or delete them permanently." : filtersActive ? "Change the filters to see more items." : recentView ? "Files appear here after you open a preview." : favoritesView ? "Star a file or folder to find it here." : "Create a folder or upload files to get started."}</p></div>
                  {searchActive ? <Button variant="outline" onClick={() => { setLoading(true); setSearch(""); setPage(1); }}>Clear search</Button> : trashView ? <Button variant="outline" onClick={() => goTo(0)}>Go to My Drive</Button> : filtersActive ? null : recentView ? <Button variant="outline" onClick={() => goTo(0)}>Go to My Drive</Button> : <Button onClick={() => { setError(undefined); setCreateFolderOpen(true); }}><FolderPlus aria-hidden="true" /> Create a folder</Button>}
                </div>
              ) : (
                <div className={viewMode === "list" ? "overflow-hidden sm:rounded-2xl sm:border sm:border-border/80 sm:bg-background sm:shadow-sm" : ""}>
                  {viewMode === "list" && <div className="hidden grid-cols-[minmax(0,1fr)_10rem_7rem_8rem] items-center gap-4 border-b border-border bg-muted/35 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Name</span><span>Last modified</span><span>File size</span><span className="text-right">Actions</span>
                  </div>}
                  <ul
                    aria-label={`Drive entries in ${viewMode} view`}
                    className={viewMode === "grid"
                      ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                      : "space-y-2 p-1 sm:space-y-0 sm:divide-y sm:divide-border sm:p-0"}
                  >
                    {entries.map((entry) => (
                      <li className={viewMode === "grid"
                      ? `group flex min-h-56 flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-background p-5 shadow-sm transition-all focus-within:border-primary/40 ${trashView ? "" : "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"}`
                        : `group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 rounded-xl border border-border/80 bg-background px-3 py-3 shadow-sm transition-colors focus-within:border-primary/40 sm:grid-cols-[minmax(0,1fr)_10rem_7rem_8rem] sm:gap-x-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-2.5 sm:shadow-none ${trashView ? "" : "cursor-pointer hover:border-primary/30 hover:bg-muted/25 sm:hover:bg-muted/35"}`} key={entry.id} onClick={(event) => openEntryFromRow(event, entry)}>
                        <div className={viewMode === "grid" ? "flex min-w-0 flex-col items-start gap-4" : "flex min-w-0 items-center gap-3"}>
                          <span className={`flex shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${viewMode === "grid" ? "size-14" : "size-10"} ${entry.kind === "folder" ? "bg-sky-50" : "bg-muted/80"}`}>
                            {entry.kind === "folder"
                              ? <Folder aria-hidden="true" className={viewMode === "grid" ? "size-8 text-sky-600" : "size-5 text-sky-600"} />
                              : <DriveFileVisual className={viewMode === "grid" ? "size-10" : "size-7"} fileId={entry.id} fileName={entry.name} loadThumbnail={trashView ? undefined : loadThumbnail} mimeType={entry.mimeType} />}
                          </span>
                          <div className={viewMode === "grid" ? "min-w-0 w-full" : "min-w-0 flex-1 sm:flex sm:items-center sm:gap-3"}>
                            <button disabled={trashView} aria-label={entry.kind === "folder" ? `Open folder ${entry.name}` : driveEntryOpenAction(entry) === "preview" ? `Preview ${entry.name}` : `Preview unavailable for ${entry.name}`} className="min-w-0 max-w-full truncate rounded-sm text-left text-sm font-semibold text-foreground decoration-primary underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:no-underline disabled:hover:text-foreground" type="button" onClick={(event) => { event.stopPropagation(); openEntry(entry); }}>{entry.name}</button>
                            {trashView && <span className="ml-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{entry.state === "deletion_pending" ? "Deletion pending" : "In Trash"}</span>}
                            {viewMode === "list" && <span className="mt-1 block text-xs text-muted-foreground sm:hidden">{formatModified(entry.updatedAt)} <span aria-hidden="true">·</span> {formatSize(entry.sizeBytes)}</span>}
                            {viewMode === "grid" && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{formatModified(entry.updatedAt)}</span>
                              <span>{formatSize(entry.sizeBytes)}</span>
                            </div>}
                          </div>
                        </div>
                        {viewMode === "list" && <>
                          <span className="hidden text-sm text-muted-foreground sm:block">{formatModified(entry.updatedAt)}</span>
                          <span className="hidden text-sm text-muted-foreground sm:block">{formatSize(entry.sizeBytes)}</span>
                        </>}
                        <div className={viewMode === "grid" ? "flex w-full items-center justify-between gap-1 border-t border-border/70 pt-3" : "flex items-center justify-end gap-1"}>
                          {!trashView && <Button
                            aria-label={driveFavoriteActionLabel(entry)}
                            aria-pressed={entry.isStarred}
                            data-drive-action
                            disabled={busy}
                            size="icon"
                            variant="ghost"
                            onClick={() => { void setFavorite(entry); }}
                          ><Star aria-hidden="true" className={entry.isStarred ? "fill-current text-amber-500" : ""} /></Button>}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button disabled={busy} size="icon" variant="ghost" aria-label={`More actions for ${entry.name}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {trashView ? <>
                                {entry.state !== "deletion_pending" && <DropdownMenuItem disabled={busy} onSelect={() => { void restore(entry); }}><RotateCcw aria-hidden="true" /> Restore</DropdownMenuItem>}
                                <DropdownMenuItem disabled={busy} className="text-destructive focus:text-destructive" onSelect={() => { setDeleteEntry(entry); setError(undefined); }}><Trash2 aria-hidden="true" /> {entry.state === "deletion_pending" ? "Retry deletion" : "Delete permanently"}</DropdownMenuItem>
                              </> : <>
                                {entry.kind === "file" && <DropdownMenuItem disabled={downloadingEntryId !== undefined} onSelect={() => { void download(entry); }}>{downloadingEntryId === entry.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />} Download</DropdownMenuItem>}
                                {entry.kind === "file" && <DropdownMenuItem disabled={busy || shareBusy} onSelect={() => openShare(entry)}><Link2 aria-hidden="true" /> Share link</DropdownMenuItem>}
                                {(searchActive || favoritesView || recentView) && entry.parentId !== parentId && <DropdownMenuItem disabled={busy} onSelect={() => { void moveHere(entry); }}>Move here</DropdownMenuItem>}
                                <DropdownMenuItem disabled={busy} onSelect={() => openRename(entry)}><Pencil aria-hidden="true" /> Rename</DropdownMenuItem>
                                <DropdownMenuItem disabled={busy} className="text-destructive focus:text-destructive" onSelect={() => { setDeleteEntry(entry); setError(undefined); }}><Trash2 aria-hidden="true" /> Move to Trash</DropdownMenuItem>
                              </>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Button disabled={loading || (!trashView && (!rootId || path.length < 2))} variant="ghost" onClick={() => trashView ? goTo(0) : goTo(Math.max(0, path.length - 2))}><ArrowLeft aria-hidden="true" /> {trashView ? "My Drive" : "Back"}</Button>
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground sm:justify-end sm:gap-3">
                  <Button disabled={page <= 1 || loading} size="sm" variant="outline" onClick={() => { setLoading(true); setPage((current) => current - 1); }}>Previous</Button>
                  <span>Page {page} of {totalPages}</span>
                  <Button disabled={page >= totalPages || loading} size="sm" variant="outline" onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Next</Button>
                </div>
              </div>
            </section>

            <footer className="pt-5 text-center text-xs text-muted-foreground">File transfers use the configured private storage bucket. Uploads are limited to 50,000,000 bytes.</footer>
          </div>
        </div>
      </div>

      <Dialog open={createFolderOpen} onOpenChange={(open) => { if (!busy) setCreateFolderOpen(open); }}>
        <DialogContent>
          <form className="space-y-4" onSubmit={(event) => { void createFolder(event); }}>
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
              <DialogDescription>Create a folder in {currentFolder}.</DialogDescription>
            </DialogHeader>
            <label className="grid gap-2 text-sm font-medium" htmlFor="new-folder">Folder name
              <Input autoFocus id="new-folder" maxLength={maxNameLength} placeholder="Name your folder" value={folderName} onChange={(event) => setFolderName(event.target.value)} />
            </label>
            {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button disabled={busy} type="button" variant="outline" onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
              <Button disabled={busy || !folderName.trim() || !parentId} type="submit">{busy ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Creating…</> : <><FolderPlus aria-hidden="true" /> Create folder</>}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shareEntry !== undefined} onOpenChange={(open) => { if (!open && !shareBusy && revokingShareId === undefined) setShareEntry(undefined); }}>
        <DialogContent>
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Share “{shareEntry?.name}”</DialogTitle>
              <DialogDescription>Create a private download link. Anyone who has the link can download this file; it expires after 7 days. You can revoke it at any time.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button disabled={shareBusy || sharesEntryId !== shareEntry?.id} onClick={() => { void createShareLink(); }} type="button">
                {shareBusy ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Creating…</> : <><Link2 aria-hidden="true" /> {shares.some((share) => share.accessType === "link") ? "Replace link" : "Create download link"}</>}
              </Button>
            </DialogFooter>
            {shares.some((share) => share.accessType === "link") && !shareLinkUrl && <p className="text-sm text-muted-foreground">An active link already exists. Creating a replacement immediately disables the old link.</p>}
            {shareLinkUrl && <label className="grid gap-2 text-sm font-medium" htmlFor="drive-share-link">Download link
              <div className="flex min-w-0 gap-2"><Input dir="ltr" id="drive-share-link" className="min-w-0 flex-1 text-left font-mono text-xs sm:text-sm" readOnly value={shareLinkUrl} /><Button aria-label="Copy download link" onClick={() => { void copyShareLink(); }} size="icon" type="button" variant="outline"><Copy aria-hidden="true" /></Button></div>
            </label>}
            {shareNotice && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800" role="status">{shareNotice}</p>}
            {shareError && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{shareError}</p>}
            <section aria-label="Download access" className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Download access</h3>
              {sharesEntryId !== shareEntry?.id ? <p className="text-sm text-muted-foreground" role="status">Loading access…</p>
                : shares.length === 0 ? <p className="text-sm text-muted-foreground">No active share links.</p>
                  : <ul className="space-y-2">{shares.map((share) => <li className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2" key={share.id}>
                    <span className="min-w-0 truncate text-sm">{share.accessType === "link" ? "Anyone with the link" : share.recipientEmail}<span className="ml-2 text-xs text-muted-foreground">{share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}` : "Can download"}</span></span>
                    <Button disabled={revokingShareId !== undefined || shareBusy} onClick={() => { void revokeShareAccess(share.id); }} size="sm" type="button" variant="outline">{revokingShareId === share.id ? "Removing…" : "Remove access"}</Button>
                  </li>)}</ul>}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={displayedPreviewEntry !== undefined} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="fixed left-0 top-0 z-50 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none [&>button:last-child]:hidden">
          {displayedPreviewEntry && <>
            <DialogTitle className="sr-only">Preview {displayedPreviewEntry.name}</DialogTitle>
            <DrivePreviewSurface
              key={displayedPreviewEntry.id}
              downloading={downloadingEntryId !== undefined}
              fileName={displayedPreviewEntry.name}
              mimeType={displayedPreviewEntry.mimeType}
              onClose={closePreview}
              onDownload={() => { void download(displayedPreviewEntry); }}
              sizeLabel={`${drivePreviewTypeLabel(activePreview?.kind ?? drivePreviewKind(displayedPreviewEntry.mimeType, displayedPreviewEntry.name), displayedPreviewEntry.mimeType, displayedPreviewEntry.name)} · ${formatSize(displayedPreviewEntry.sizeBytes)}`}
              thumbnailUrl={activePreview?.kind === "image" ? activePreview.url : undefined}
            >
            {unsupportedEntry && !previewEntry ? (
              <DriveUnsupportedPreview
                downloading={downloadingEntryId === unsupportedEntry.id}
                error={error}
                fileName={unsupportedEntry.name}
                onDownload={() => { void download(unsupportedEntry); }}
              />
            ) : (
              <>
                {activePreview?.loading && <div className="flex min-h-40 h-full items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" /> Loading preview…</div>}
                {activePreview?.error && <p className="m-4 rounded-md border border-destructive/30 bg-white p-4 text-sm text-destructive" role="alert">{activePreview.error}</p>}
                {activePreview?.kind === "image" && activePreview.url && <DriveImagePreview fileName={displayedPreviewEntry.name} src={activePreview.url} onError={() => setPreviewContent({ entryId: displayedPreviewEntry.id, kind: "image", loading: false, error: "This image could not be displayed." })} onLoad={markPreviewOpened} />}
                {activePreview?.kind === "pdf" && activePreview.blob && previewEntry && <DrivePdfPreview key={activePreview.entryId} blob={activePreview.blob} fileName={previewEntry.name} onOpened={markPreviewOpened} />}
                {activePreview?.kind === "pptx" && activePreview.blob && previewEntry && <DrivePptxPreview key={activePreview.entryId} blob={activePreview.blob} fileName={previewEntry.name} onOpened={markPreviewOpened} />}
                {activePreview?.kind === "text" && activePreview.text !== undefined && previewEntry && <DriveTextPreview fileName={previewEntry.name} text={activePreview.text} />}
                {activePreview?.kind === "csv" && activePreview.csvPreview && <DriveCsvTable preview={activePreview.csvPreview} />}
                {activePreview?.kind === "docx" && activePreview.blob && previewEntry && <DriveDocxDocumentPreview key={activePreview.entryId} blob={activePreview.blob} fileName={previewEntry.name} onOpened={markPreviewOpened} />}
                {activePreview?.kind === "xlsx" && activePreview.xlsxPreview && <DriveXlsxTable key={activePreview.entryId} preview={activePreview.xlsxPreview} />}
              </>
            )}
            </DrivePreviewSurface>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={renameEntry !== undefined} onOpenChange={(open) => { if (!open && !busy) setRenameEntry(undefined); }}>
        <DialogContent>
          <form className="space-y-4" onSubmit={(event) => { void rename(event); }}>
            <DialogHeader>
              <DialogTitle>Rename {renameEntry?.kind ?? "entry"}</DialogTitle>
              <DialogDescription>Choose a name up to {maxNameLength} characters. Names must not contain slashes or control characters.</DialogDescription>
            </DialogHeader>
            <label className="grid gap-2 text-sm font-medium" htmlFor="drive-rename-name">Name
              <Input autoFocus id="drive-rename-name" maxLength={maxNameLength} value={renameName} onChange={(event) => { setRenameName(event.target.value); setRenameValidationError(undefined); }} aria-invalid={renameValidationError !== undefined} aria-describedby={renameValidationError ? "drive-rename-error" : undefined} />
            </label>
            {renameValidationError && <p id="drive-rename-error" className="text-sm text-destructive" role="alert">{renameValidationError}</p>}
            {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button disabled={busy} type="button" variant="outline" onClick={() => setRenameEntry(undefined)}>Cancel</Button>
              <Button disabled={busy || !renameName.trim()} type="submit">{busy ? "Saving…" : "Save name"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteEntry !== undefined} onOpenChange={(open) => { if (!open && !busy) setDeleteEntry(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trashView ? `Permanently delete “${deleteEntry?.name}”?` : `Move “${deleteEntry?.name}” to Trash?`}</AlertDialogTitle>
            <AlertDialogDescription>{trashView
              ? "This permanently removes the item and its stored file bytes. This action cannot be undone."
              : "The item will move to Trash, where you can restore it or permanently delete it later. Folders must be empty before they can be moved."}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{busy ? (trashView ? "Deleting…" : "Moving…") : (trashView ? "Delete permanently" : "Move to Trash")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
