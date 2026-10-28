"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { Download, File, LoaderCircle } from "lucide-react";
import { Button } from "@workspace/ui";
import { resolveBrowserApiBaseUrl } from "@/config/api";
import { createDriveApi } from "../drive.api";
import type { ApiDriveSharedFile } from "@workspace/types";

type PublicDriveSharePageProps = Readonly<{ apiBaseUrl: string }>;
const pendingToken = "__pending__";
const invalidToken = "__invalid__";

const subscribeToShareFragment = (notify: () => void): (() => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};

const readShareToken = (): string => {
  const candidate = window.location.hash.slice(1);
  return /^[A-Za-z0-9_-]{43}$/u.test(candidate) ? candidate : invalidToken;
};

const formatFileSize = (sizeBytes: number): string => {
  if (sizeBytes < 1_000) return `${sizeBytes} bytes`;
  if (sizeBytes < 1_000_000) return `${(sizeBytes / 1_000).toFixed(1)} kB`;
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
};

export const PublicDriveSharePage = ({ apiBaseUrl }: PublicDriveSharePageProps): ReactElement => {
  const api = useMemo(() => createDriveApi({ baseUrl: resolveBrowserApiBaseUrl(apiBaseUrl) }), [apiBaseUrl]);
  const token = useSyncExternalStore(subscribeToShareFragment, readShareToken, () => pendingToken);
  const [file, setFile] = useState<ApiDriveSharedFile>();
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string>();
  const objectUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (token === pendingToken || token === invalidToken) return;
    let active = true;
    void api.getPublicShare(token).then((result) => {
      if (active) setFile(result);
    }).catch(() => {
      if (active) setError("This download link is invalid, expired, or has been revoked.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api, token]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const download = async (): Promise<void> => {
    if (token === pendingToken || token === invalidToken || !file || downloading) return;
    setDownloading(true);
    setError(undefined);
    try {
      const blob = await api.downloadPublicShare(token);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.rel = "noreferrer";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        if (objectUrlRef.current === objectUrl) objectUrlRef.current = undefined;
      }, 1_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100dvh-1rem)] items-center justify-center bg-muted/30 px-4 py-10">
      <section aria-labelledby="shared-file-title" className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <File aria-hidden="true" className="size-6" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">SQUID Drive · Shared file</p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight" id="shared-file-title">
          {loading ? "Loading shared file…" : file?.name ?? "Shared file unavailable"}
        </h1>
        {token === invalidToken && <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">This download link is invalid, expired, or has been revoked.</p>}
        {(token === pendingToken || (loading && token !== invalidToken)) && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Checking this download link…</p>}
        {file && !loading && <>
          <p className="mt-2 text-sm text-muted-foreground">{formatFileSize(file.sizeBytes)}</p>
          <Button className="mt-6 w-full" disabled={downloading} onClick={() => { void download(); }} type="button">
            {downloading ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Preparing download…</> : <><Download aria-hidden="true" /> Download file</>}
          </Button>
        </>}
        {error && <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">This link provides download access to this file only. It expires automatically and can be revoked by its owner.</p>
      </section>
    </main>
  );
};
