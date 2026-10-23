"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive } from "lucide-react";
import Image from "next/image";
import { driveFileVisual } from "../utils/drive-file-visual";
import type { DriveFileVisual as DriveFileVisualData, DriveFileVisualType } from "../utils/drive-file-visual";

type DriveFileTypeIconProps = Readonly<{
  mimeType?: string | undefined;
  fileName: string;
  thumbnailUrl?: string | undefined;
  className?: string | undefined;
}>;

type DriveThumbnailLoader = (fileId: string, signal: AbortSignal, fileName: string) => Promise<Blob>;

type DriveFileVisualProps = DriveFileTypeIconProps & Readonly<{
  fileId?: string | undefined;
  loadThumbnail?: DriveThumbnailLoader | undefined;
}>;

const imageFileTypes = new Set<DriveFileVisualType>(["image"]);

export const DriveDocumentFileIcon = ({
  visual,
  className
}: Readonly<{ visual: DriveFileVisualData; className: string }>) => visual.type === "archive" ? (
  <Archive
    aria-hidden="true"
    className={`${className} ${visual.iconClass}`}
    data-file-type={visual.type}
  />
) : (
  <svg
    aria-hidden="true"
    className={`${className} ${visual.iconClass}`}
    data-file-type={visual.type}
    fill="none"
    viewBox="0 0 24 28"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M4.25 1.25h10l5.5 5.5v19.5H4.25z" fill="white" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
    <path d="M14.25 1.5v5.25h5.25" fill="white" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.25" />
    {visual.type === "pdf" ? (
      <>
        <path d="M7 17.5h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M7.5 14.75c1.1-2.4 2-4.7 2.35-6.5.6 3.1 1.8 6 3.45 8.25.8-1 1.8-1.65 3.1-1.85" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
      </>
    ) : visual.type === "doc" || visual.type === "docx" ? (
      <>
        <path d="M6.5 9.5h6.25v9H6.5z" fill="currentColor" />
        <path d="m7.5 12 1 4.25L10 13l1.5 3.25 1-4.25" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.8" />
        <path d="M14.5 11h3M14.5 14h3M14.5 17h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
      </>
    ) : visual.type === "ppt" || visual.type === "pptx" ? (
      <>
        <rect x="6.25" y="9" width="11.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12 17v2.25m-2.25 0h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
        <path d="M9 14.5v-2l1.2 1 1.4-1.5 1.4 1.5 1.8-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
      </>
    ) : visual.type === "xls" || visual.type === "xlsx" || visual.type === "csv" ? (
      <>
        <rect x="6.25" y="9" width="11.5" height="9" rx="0.75" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6.5 12h11m-11 3h11m-7.5-5.75v8.5m3.75-8.5v8.5" stroke="currentColor" strokeWidth="1" />
        {visual.type === "csv" && <path d="M18.5 17.5c.6.1.8.4.65.8-.12.32-.4.53-.72.72" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />}
      </>
    ) : (
      <>
        <path d="M7 10h10M7 13h10M7 16h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
        <path d="M16.75 15.5v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
      </>
    )}
  </svg>
);

export const DriveFileTypeIcon = ({ mimeType, fileName, thumbnailUrl, className = "size-6" }: DriveFileTypeIconProps) => {
  const isPngFile = /\.png$/iu.test(fileName);
  const visual = isPngFile ? driveFileVisual("image/png", fileName) : driveFileVisual(mimeType, fileName);
  const isImage = imageFileTypes.has(visual.type);
  const hasThumbnail = Boolean(thumbnailUrl && isImage);

  return (
    <span aria-hidden="true" className={`relative inline-block shrink-0 overflow-hidden ${className}`}>
      {isImage ? (
        hasThumbnail && thumbnailUrl ? (
          <Image
            alt=""
            className="rounded-md object-cover"
            fill
            sizes="40px"
            src={thumbnailUrl}
            unoptimized
          />
        ) : (
          <svg
            aria-hidden="true"
            className={`size-full ${visual.iconClass}`}
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" fill="white" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8.5" cy="9" r="1.5" fill="currentColor" />
            <path d="m5 17 4.5-4.5 3 3L15 13l4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        )
      ) : (
        <DriveDocumentFileIcon className="absolute inset-0 size-full" visual={visual} />
      )}
    </span>
  );
};

export const DriveFileVisual = ({
  mimeType,
  fileName,
  fileId,
  loadThumbnail,
  thumbnailUrl: previewThumbnailUrl,
  className
}: DriveFileVisualProps) => {
  const visual = useMemo(
    () => /\.png$/iu.test(fileName) ? driveFileVisual("image/png", fileName) : driveFileVisual(mimeType, fileName),
    [fileName, mimeType]
  );
  const containerRef = useRef<HTMLSpanElement>(null);
  const [inThumbnailRange, setInThumbnailRange] = useState(false);
  const [thumbnail, setThumbnail] = useState<Readonly<{ key: string; url: string }>>();
  const [thumbnailUnavailableFor, setThumbnailUnavailableFor] = useState<string>();
  const thumbnailKey = fileId ? `${fileId}\u0000${fileName}` : undefined;

  useEffect(() => {
    if (!loadThumbnail || !fileId || !visual.supportsThumbnail || inThumbnailRange) return;
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setInThumbnailRange(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setInThumbnailRange(true);
      observer.disconnect();
    }, { rootMargin: "120px" });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fileId, inThumbnailRange, loadThumbnail, visual.supportsThumbnail]);

  useEffect(() => {
    if (!loadThumbnail || !fileId || !thumbnailKey || !visual.supportsThumbnail || !inThumbnailRange) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl: string | undefined;

    void loadThumbnail(fileId, controller.signal, fileName).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setThumbnail({ key: thumbnailKey, url: objectUrl });
    }).catch((cause: unknown) => {
      if (!active || (cause instanceof Error && cause.name === "AbortError")) return;
      setThumbnailUnavailableFor(thumbnailKey);
    });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, fileName, inThumbnailRange, loadThumbnail, thumbnailKey, visual.supportsThumbnail]);

  const activeThumbnailUrl = previewThumbnailUrl ?? (thumbnail && thumbnail.key === thumbnailKey ? thumbnail.url : undefined);
  if (!loadThumbnail || !fileId || !visual.supportsThumbnail) {
    return <DriveFileTypeIcon className={className} fileName={fileName} mimeType={mimeType} thumbnailUrl={previewThumbnailUrl} />;
  }

  return (
    <span
      className="relative inline-flex"
      ref={containerRef}
      title={thumbnailUnavailableFor === thumbnailKey ? "Image thumbnail unavailable; showing file icon." : undefined}
    >
      <DriveFileTypeIcon className={className} fileName={fileName} mimeType={mimeType} thumbnailUrl={activeThumbnailUrl} />
    </span>
  );
};
