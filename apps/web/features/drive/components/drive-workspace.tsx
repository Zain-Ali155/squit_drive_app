"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ArrowLeft, ChevronRight, Clock3, Download, Folder, FolderPlus, Grid2X2, HardDrive, List, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@workspace/ui";
import { Input } from "@workspace/ui/primitives/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/primitives/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@workspace/ui/primitives/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/primitives/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui/primitives/dropdown-menu";
import { createDriveApi } from "../drive.api";
import { driveEntryOpenAction, drivePreviewKind, drivePreviewTypeLabel, hasPdfFileSignature, maxDriveImagePreviewBytes, maxDrivePreviewBytes, maxDrivePptxPreviewBytes } from "../utils/drive-preview.logic";
import type { DrivePreviewKind, DriveUploadProgress, SafeDocxNode } from "../types/drive.types";
import { DriveFileVisual } from "./drive-file-icon";
import { DrivePreviewSurface, DriveUnsupportedPreview } from "./drive-preview-shell";
import {
  cleanupDrivePreview,
  createDriveListFilterOptions,
  createFolderAndClearName,
  driveFavoriteActionLabel,
  driveFiltersAreActive,
  emptyDriveFilters,
  formatDriveStorageUsage,
  folderLocationAtBreadcrumb,
  folderLocationFromBreadcrumbs,
  isDriveFileType,
  isDriveRowActionTarget,
  isDriveSortSelection,
  runDriveAction
} from "../utils/drive-workspace.logic";
import type { DriveFilters, DriveMutationKind } from "../utils/drive-workspace.logic";
import { convertDocxBlob, maxDocxInputBytes } from "../utils/drive.docx";
import { SafeDocxPreview } from "./drive.docx-preview";
import { maxDriveCsvBytes, parseDriveCsv, type DriveCsvPreview } from "../utils/drive.csv";
import { DriveCsvTable } from "./drive.csv-preview";
import { DrivePdfPreview } from "./drive-pdf";
import { DrivePptxPreview } from "./drive-pptx-preview";
import { DriveTextPreview } from "./drive-text-preview";
import { DriveImagePreview } from "./drive-image-preview";
import type { ApiDriveEntry } from "@workspace/types";

const pageSize = 25;
const maxUploadBytes = 50_000_000;
const maxNameLength = 255;
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
  docxNodes?: readonly SafeDocxNode[];
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

type DriveWorkspaceProps = Readonly<{ apiBaseUrl: string }>;
type DriveStorageUsageProps = Readonly<{
  usedBytes: number | undefined;
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  className: string;
}>;

const DriveStorageUsage = ({ usedBytes, loading, error, onRetry, className }: DriveStorageUsageProps) => (
  <section aria-label="Storage usage" aria-live="polite" className={className}>
    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <HardDrive aria-hidden="true" className="size-3.5 shrink-0" />
      <span>Storage</span>
    </div>
    <div aria-hidden="true" className="mb-1 h-1 w-full rounded-full bg-muted-foreground/40" />
    {loading
      ? <p className="truncate text-xs text-muted-foreground">Loading storage…</p>
      : error
        ? <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-destructive"><span className="truncate">Storage unavailable</span><button className="shrink-0 underline underline-offset-2" type="button" onClick={onRetry}>Retry</button></div>
        : <p className="truncate text-xs font-medium text-muted-foreground">{formatDriveStorageUsage(usedBytes ?? 0)} used</p>}
  </section>
);

export const DriveWorkspace = ({ apiBaseUrl }: DriveWorkspaceProps) => {
  const api = useMemo(() => createDriveApi({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
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
  const [viewMode, setViewMode] = useState<DriveViewMode>("list");
  const [filters, setFilters] = useState<DriveFilters>(emptyDriveFilters);
  const [page, setPage] = useState(1);
  const [listRefresh, setListRefresh] = useState(0);
  const [storageUsage, setStorageUsage] = useState<number>();
  const [storageUsageLoading, setStorageUsageLoading] = useState(true);
  const [storageUsageError, setStorageUsageError] = useState<string>();
  const [total, setTotal] = useState(0);
  const [folderName, setFolderName] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameEntry, setRenameEntry] = useState<ApiDriveEntry>();
  const [renameName, setRenameName] = useState("");
  const [renameValidationError, setRenameValidationError] = useState<string>();
  const [deleteEntry, setDeleteEntry] = useState<ApiDriveEntry>();
  const [unsupportedEntry, setUnsupportedEntry] = useState<ApiDriveEntry>();
  const [previewEntry, setPreviewEntry] = useState<ApiDriveEntry>();
  const [previewContent, setPreviewContent] = useState<PreviewContent>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloadingEntryId, setDownloadingEntryId] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<DriveUploadProgress>();
  const [error, setError] = useState<string>();
  const downloadsInFlight = useRef(new Set<string>());
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
    } catch (cause) {
      setStorageUsageError(cause instanceof Error ? cause.message : "Could not load storage usage.");
    } finally {
      setStorageUsageLoading(false);
    }
  }, [api]);

  const listInput = useMemo(() => ({
    ...(!search.trim() && !favoritesView && !recentView && parentId ? { parentId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(favoritesView ? { favorites: true } : {}),
    ...(recentView ? { recent: true } : {}),
    ...createDriveListFilterOptions(filters),
    page,
    pageSize
  }), [favoritesView, filters, page, parentId, recentView, search]);
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
        const docxNodes = await convertDocxBlob(blob);
        completePreview({ kind: actualKind, loading: false, docxNodes });
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
    const mutation = deleteEntry.kind === "file" ? "file-delete" : "folder-delete";
    if (await runAction(() => api.deleteEntry(deleteEntry.id), mutation)) setDeleteEntry(undefined);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activePreview = previewContent?.entryId === previewEntry?.id ? previewContent : undefined;

  const searchActive = search.trim().length > 0;
  const filtersActive = driveFiltersAreActive(filters);
  const currentFolder = path.at(-1)?.name ?? "My Drive";
  const currentViewName = recentView ? "Recent" : favoritesView ? "Favorites" : currentFolder;
  const displayedPreviewEntry = previewEntry ?? unsupportedEntry;
  const updateFilter = (update: () => void): void => {
    setLoading(true);
    setPage(1);
    update();
  };
  const resetFilters = (): void => {
    updateFilter(() => setFilters(emptyDriveFilters));
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
    <main className="min-h-screen bg-muted/30 text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background lg:flex" aria-label="Drive sidebar">
          <a href="/drive" className="flex items-center gap-3 px-6 py-6 text-foreground no-underline">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><HardDrive aria-hidden="true" className="size-5" /></span>
            <span className="leading-tight"><span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">SQUID</span><span className="text-lg font-semibold tracking-tight">Drive</span></span>
          </a>
          <div className="px-4 pb-5">
            <Button className="h-12 w-full justify-start rounded-xl px-5 shadow-sm" onClick={() => { setError(undefined); setCreateFolderOpen(true); }}><Plus aria-hidden="true" className="size-5" /> New</Button>
          </div>
          <nav aria-label="Drive navigation" className="space-y-1 px-3">
            <button aria-current={searchActive || favoritesView || recentView ? undefined : "page"} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${searchActive || favoritesView || recentView ? "text-muted-foreground hover:bg-muted" : "bg-primary/10 text-primary"}`} type="button" onClick={() => goTo(0)}>
              <HardDrive aria-hidden="true" className="size-4" /> My Drive
            </button>
            <button aria-current={favoritesView && !searchActive ? "page" : undefined} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${favoritesView && !searchActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={() => { setLoading(true); setFavoritesView(true); setRecentView(false); setPage(1); }}>
              <Star aria-hidden="true" className="size-4" /> Favorites
            </button>
            <button aria-current={recentView && !searchActive ? "page" : undefined} className={`flex h-10 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${recentView && !searchActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={() => { setLoading(true); setFavoritesView(false); setRecentView(true); setPage(1); }}>
              <Clock3 aria-hidden="true" className="size-4" /> Recent
            </button>
            <DriveStorageUsage
              className="mb-4 px-4 pt-2"
              usedBytes={storageUsage}
              loading={storageUsageLoading}
              error={storageUsageError}
              onRetry={() => { void loadStorageUsage(); }}
            />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] items-center gap-3">
              <a href="/drive" aria-label="SQUID Drive home" className="flex shrink-0 items-center gap-2 text-foreground no-underline lg:hidden">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><HardDrive aria-hidden="true" className="size-4" /></span>
                <span className="font-semibold">SQUID Drive</span>
              </a>
              <label className="relative min-w-0 flex-1 lg:max-w-2xl">
                <span className="sr-only">Search all files and folders</span>
                <Search aria-hidden="true" className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search all Drive" className="h-11 rounded-xl border-transparent bg-muted/70 pl-10 pr-10 shadow-none focus-visible:border-input focus-visible:bg-background" type="search" placeholder="Search all Drive" value={search} onChange={(event) => { setLoading(true); setSearch(event.target.value); setPage(1); }} />
                {search.length > 0 && <button aria-label="Clear search" className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={() => { setLoading(true); setSearch(""); setPage(1); }}><X aria-hidden="true" className="size-4" /></button>}
              </label>
              <Button className="shrink-0 lg:hidden" onClick={() => { setError(undefined); setCreateFolderOpen(true); }}><Plus aria-hidden="true" /> New</Button>
              <p className="ml-auto hidden rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:block">Local demo</p>
            </div>
          </header>
          <div className="border-b border-border px-4 py-2 lg:hidden">
            <div className="mx-auto max-w-[1440px]">
              <DriveStorageUsage
                className="min-w-0"
                usedBytes={storageUsage}
                loading={storageUsageLoading}
                error={storageUsageError}
                onRetry={() => { void loadStorageUsage(); }}
              />
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            <div className="mb-6 flex flex-col gap-5 border-b border-border/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{searchActive ? `Global search · ${favoritesView ? "Favorites" : recentView ? "Recent files" : "All Drive folders"}` : recentView ? "Recently opened files" : favoritesView ? "Your starred items" : "Your workspace"}</p>
                <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{searchActive ? "Search results" : currentViewName}</h1>
                <nav aria-label="Folder path" className="mt-3 flex min-w-0 items-center gap-1 overflow-x-auto text-sm text-muted-foreground">
                  {path.map((crumb, index) => (
                    <span className="flex shrink-0 items-center gap-1" key={crumb.id}>
                      {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5" />}
                      <button className={`max-w-40 truncate rounded px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === path.length - 1 ? "font-medium text-foreground" : ""}`} type="button" onClick={() => goTo(index)}>{crumb.name}</button>
                    </span>
                  ))}
                  {searchActive && <span className="ml-2 truncate text-xs">across {favoritesView ? "Favorites" : recentView ? "Recent files" : "all Drive folders"} for “{search.trim()}”</span>}
                </nav>
              </div>
              <div className="flex flex-wrap shrink-0 items-center gap-2">
                <p className="mr-2 text-sm text-muted-foreground">{total} {total === 1 ? "item" : "items"}</p>
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
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-within:ring-2 focus-within:ring-ring has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
                  <Upload aria-hidden="true" className="size-4" /><span>Upload files</span>
                  <input aria-label="Upload files" className="sr-only" type="file" disabled={busy || !parentId} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                </label>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-4" aria-label="Drive filters">
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                File type
                <Select value={filters.fileType || "all"} onValueChange={selectFileType}>
                  <SelectTrigger aria-label="Filter by file type" className="w-44"><SelectValue /></SelectTrigger>
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
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Sort by
                <Select value={filters.sort} onValueChange={selectSort}>
                  <SelectTrigger aria-label="Sort Drive entries" className="w-48"><SelectValue /></SelectTrigger>
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
              <Button className="h-9" disabled={!filtersActive} variant="outline" onClick={resetFilters}>Reset Filters</Button>
            </div>

            {uploadProgress && <div className="mb-5 rounded-xl border border-border bg-background p-4" aria-live="polite">
              <div className="mb-2 flex justify-between text-sm"><span className="font-medium">Uploading file…</span><span className="text-muted-foreground">{Math.min(100, Math.floor((uploadProgress.loaded / Math.max(uploadProgress.total, 1)) * 100))}%</span></div>
              <progress className="h-2 w-full accent-primary" aria-label="Upload progress" max={uploadProgress.total || 1} value={uploadProgress.loaded} />
            </div>}

            <section aria-labelledby="entries-heading" aria-busy={loading} className="flex flex-1 flex-col">
              <h2 id="entries-heading" className="sr-only">{searchActive ? "Search results" : recentView ? "Recently opened files" : favoritesView ? "Favorite files and folders" : `${currentFolder} files and folders`}</h2>
              {error && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                <p>{error}</p>
                <Button disabled={loading || busy} size="sm" variant="outline" onClick={() => { void reload(); }}>Retry</Button>
              </div>}
              {busy && !uploadProgress && <p className="mb-4 text-sm text-muted-foreground" role="status">Saving Drive changes…</p>}
              {loading ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-background text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary" /> Loading Drive…</div>
              ) : !error && entries.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background px-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Folder aria-hidden="true" className="size-6" /></span>
                  <div><p className="font-semibold">{searchActive ? "No matching files or folders" : filtersActive ? "No items match these filters" : recentView ? "No recent files yet" : favoritesView ? "No favorites yet" : "This folder is empty"}</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">{searchActive ? "Try a different name or clear your search." : filtersActive ? "Change or reset the filters to see more items." : recentView ? "Files appear here after you open a preview." : favoritesView ? "Star a file or folder to find it here." : "Create a folder or upload files to get started."}</p></div>
                  {searchActive ? <Button variant="outline" onClick={() => { setLoading(true); setSearch(""); setPage(1); }}>Clear search</Button> : filtersActive ? <Button variant="outline" onClick={resetFilters}>Reset Filters</Button> : recentView ? <Button variant="outline" onClick={() => goTo(0)}>Go to My Drive</Button> : <Button onClick={() => { setError(undefined); setCreateFolderOpen(true); }}><FolderPlus aria-hidden="true" /> Create a folder</Button>}
                </div>
              ) : (
                <div className={viewMode === "list" ? "overflow-hidden rounded-2xl border border-border bg-background shadow-sm" : ""}>
                  {viewMode === "list" && <div className="hidden grid-cols-[minmax(0,1fr)_10rem_7rem_auto] items-center gap-4 border-b border-border bg-muted/35 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Name</span><span>Last modified</span><span>File size</span><span className="w-56 text-right">Actions</span>
                  </div>}
                  <ul
                    aria-label={`Drive entries in ${viewMode} view`}
                    className={viewMode === "grid"
                      ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                      : "divide-y divide-border"}
                  >
                    {entries.map((entry) => (
                      <li className={viewMode === "grid"
                        ? "group flex min-h-56 cursor-pointer flex-col justify-between gap-4 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20 focus-within:border-primary/40"
                        : "group grid cursor-pointer gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/35 focus-within:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_10rem_7rem_auto] sm:items-center sm:px-5"} key={entry.id} onClick={(event) => openEntryFromRow(event, entry)}>
                        <div className={viewMode === "grid" ? "flex min-w-0 flex-col items-start gap-4" : "flex min-w-0 items-center gap-3"}>
                          <span className={`flex shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${viewMode === "grid" ? "size-14" : "size-10"} ${entry.kind === "folder" ? "bg-sky-50" : "bg-muted/80"}`}>
                            {entry.kind === "folder"
                              ? <Folder aria-hidden="true" className={viewMode === "grid" ? "size-8 text-sky-600" : "size-5 text-sky-600"} />
                              : <DriveFileVisual className={viewMode === "grid" ? "size-10" : "size-7"} fileId={entry.id} fileName={entry.name} loadThumbnail={loadThumbnail} mimeType={entry.mimeType} />}
                          </span>
                          <div className={viewMode === "grid" ? "min-w-0 w-full" : "flex min-w-0 flex-1 items-center gap-3"}>
                            <button aria-label={entry.kind === "folder" ? `Open folder ${entry.name}` : driveEntryOpenAction(entry) === "preview" ? `Preview ${entry.name}` : `Preview unavailable for ${entry.name}`} className="min-w-0 max-w-full truncate rounded-sm text-left text-sm font-semibold text-foreground decoration-primary underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={(event) => { event.stopPropagation(); openEntry(entry); }}>{entry.name}</button>
                            {viewMode === "list" && <span className="ml-auto text-xs text-muted-foreground sm:hidden">{formatSize(entry.sizeBytes)}</span>}
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
                        <div className={viewMode === "grid" ? "flex w-full items-center justify-between gap-1 border-t border-border/70 pt-3" : "flex flex-wrap items-center justify-start gap-1 sm:w-56 sm:justify-end"}>
                          <Button
                            aria-label={driveFavoriteActionLabel(entry)}
                            aria-pressed={entry.isStarred}
                            data-drive-action
                            disabled={busy}
                            size="icon"
                            variant="ghost"
                            onClick={() => { void setFavorite(entry); }}
                          ><Star aria-hidden="true" className={entry.isStarred ? "fill-current text-amber-500" : ""} /></Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button disabled={busy} size="icon" variant="ghost" aria-label={`More actions for ${entry.name}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {entry.kind === "file" && <DropdownMenuItem disabled={downloadingEntryId !== undefined} onSelect={() => { void download(entry); }}>{downloadingEntryId === entry.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />} Download</DropdownMenuItem>}
                              {(searchActive || favoritesView || recentView) && entry.parentId !== parentId && <DropdownMenuItem disabled={busy} onSelect={() => { void moveHere(entry); }}>Move here</DropdownMenuItem>}
                              <DropdownMenuItem disabled={busy} onSelect={() => openRename(entry)}><Pencil aria-hidden="true" /> Rename</DropdownMenuItem>
                              <DropdownMenuItem disabled={busy} className="text-destructive focus:text-destructive" onSelect={() => { setDeleteEntry(entry); setError(undefined); }}><Trash2 aria-hidden="true" /> Delete permanently</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-4">
                <Button disabled={!rootId || path.length < 2 || loading} variant="ghost" onClick={() => goTo(Math.max(0, path.length - 2))}><ArrowLeft aria-hidden="true" /> Back</Button>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
                {activePreview?.kind === "docx" && activePreview.docxNodes && <SafeDocxPreview nodes={activePreview.docxNodes} />}
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
            <AlertDialogTitle>Permanently delete “{deleteEntry?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. Folders must be empty before they can be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{busy ? "Deleting…" : "Delete permanently"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
