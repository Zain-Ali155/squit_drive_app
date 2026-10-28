"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
}: Readonly<{ visual: DriveFileVisualData; className: string }>) => {
  if (visual.type === "archive") {
    return <span className={`${className} ${visual.iconClass}`} data-file-type={visual.type}>
      <svg aria-hidden="true" className="size-full" viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="4" width="23" height="8" rx="1.5" fill="#d94b45" stroke="#713b32" />
        <rect x="5" y="12" width="23" height="8" rx="1.5" fill="#4b9a55" stroke="#32633a" />
        <rect x="5" y="20" width="23" height="8" rx="1.5" fill="#456caa" stroke="#344e75" />
        <rect x="13" y="4" width="5" height="24" fill="#f4d879" stroke="#9b8140" />
        <path d="M14.5 7h2m-2 4h2m-2 4h2m-2 4h2m-2 4h2" stroke="#6b5b37" strokeWidth="1" />
      </svg>
    </span>;
  }

  const mark = visual.type === "pdf" ? "PDF"
    : visual.type === "doc" || visual.type === "docx" ? "W"
      : visual.type === "ppt" || visual.type === "pptx" || visual.type === "odp" ? "P"
        : visual.type === "xls" || visual.type === "xlsx" || visual.type === "csv" || visual.type === "ods" ? "X"
          : visual.type === "txt" || visual.type === "odt" ? "T"
            : visual.type === "image" ? "IMG"
              : visual.type === "audio" ? "♪"
                : visual.type === "video" ? "▶"
                  : visual.type === "code" ? "</>"
                    : visual.badge.slice(0, 3);
  const markClass = visual.type === "pdf" ? "bg-red-600"
    : visual.type === "doc" || visual.type === "docx" ? "bg-blue-700"
      : visual.type === "ppt" || visual.type === "pptx" || visual.type === "odp" ? "bg-orange-600"
        : visual.type === "xls" || visual.type === "xlsx" || visual.type === "csv" || visual.type === "ods" ? "bg-green-700"
          : visual.type === "txt" || visual.type === "odt" ? "bg-slate-600"
            : visual.type === "image" ? "bg-violet-600"
              : visual.type === "audio" ? "bg-purple-700"
                : visual.type === "video" ? "bg-rose-600"
                  : visual.type === "code" ? "bg-cyan-700"
                    : "bg-slate-500";

  return <span className={className} data-file-type={visual.type}>
    <svg aria-hidden="true" className="size-full" fill="none" viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 2.5h12l8 8v22H6z" fill="white" stroke="#94a3b8" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M18 3v8h8" fill="#e2e8f0" stroke="#94a3b8" strokeLinejoin="round" strokeWidth="1.25" />
      <path d="M12.5 16h8m-8 4h8m-8 4h5" stroke="#94a3b8" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
    <span className={`absolute bottom-0 left-0 z-10 flex min-h-[42%] min-w-[48%] items-center justify-center border border-white px-0.5 text-[7px] font-bold leading-none tracking-[-0.04em] text-white shadow-sm ${markClass}`} data-file-mark={visual.type}>
      {mark}
    </span>
  </span>;
};

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
        ) : <DriveDocumentFileIcon className="absolute inset-0 size-full" visual={visual} />
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
