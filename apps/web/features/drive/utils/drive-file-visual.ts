export type DriveFileVisualType = "pdf" | "pptx" | "ppt" | "docx" | "doc" | "xlsx" | "xls" | "csv" | "txt" | "odt" | "ods" | "odp" | "image" | "archive" | "video" | "audio" | "code" | "generic";

export type DriveFileVisual = Readonly<{
  type: DriveFileVisualType;
  label: string;
  badge: string;
  iconClass: string;
  badgeClass: string;
  supportsThumbnail: boolean;
}>;

const driveFileVisuals: Readonly<Record<DriveFileVisualType, DriveFileVisual>> = Object.freeze({
  pdf: Object.freeze({ type: "pdf", label: "PDF document", badge: "PDF", iconClass: "text-red-600", badgeClass: "bg-red-100 text-red-800", supportsThumbnail: false }),
  pptx: Object.freeze({ type: "pptx", label: "PowerPoint presentation", badge: "PPTX", iconClass: "text-orange-600", badgeClass: "bg-orange-100 text-orange-800", supportsThumbnail: false }),
  ppt: Object.freeze({ type: "ppt", label: "PowerPoint presentation", badge: "PPT", iconClass: "text-orange-600", badgeClass: "bg-orange-100 text-orange-800", supportsThumbnail: false }),
  docx: Object.freeze({ type: "docx", label: "Word document", badge: "DOCX", iconClass: "text-blue-600", badgeClass: "bg-blue-100 text-blue-800", supportsThumbnail: false }),
  doc: Object.freeze({ type: "doc", label: "Word document", badge: "DOC", iconClass: "text-blue-600", badgeClass: "bg-blue-100 text-blue-800", supportsThumbnail: false }),
  xlsx: Object.freeze({ type: "xlsx", label: "Excel spreadsheet", badge: "XLSX", iconClass: "text-emerald-700", badgeClass: "bg-emerald-100 text-emerald-800", supportsThumbnail: false }),
  xls: Object.freeze({ type: "xls", label: "Excel spreadsheet", badge: "XLS", iconClass: "text-emerald-700", badgeClass: "bg-emerald-100 text-emerald-800", supportsThumbnail: false }),
  csv: Object.freeze({ type: "csv", label: "CSV spreadsheet", badge: "CSV", iconClass: "text-green-700", badgeClass: "bg-green-100 text-green-800", supportsThumbnail: false }),
  txt: Object.freeze({ type: "txt", label: "Plain text", badge: "TXT", iconClass: "text-slate-600", badgeClass: "bg-slate-100 text-slate-700", supportsThumbnail: false }),
  odt: Object.freeze({ type: "odt", label: "OpenDocument text document", badge: "ODT", iconClass: "text-violet-700", badgeClass: "bg-violet-100 text-violet-800", supportsThumbnail: false }),
  ods: Object.freeze({ type: "ods", label: "OpenDocument spreadsheet", badge: "ODS", iconClass: "text-green-700", badgeClass: "bg-green-100 text-green-800", supportsThumbnail: false }),
  odp: Object.freeze({ type: "odp", label: "OpenDocument presentation", badge: "ODP", iconClass: "text-orange-700", badgeClass: "bg-orange-100 text-orange-800", supportsThumbnail: false }),
  image: Object.freeze({ type: "image", label: "Image file", badge: "IMG", iconClass: "text-violet-600", badgeClass: "bg-violet-100 text-violet-800", supportsThumbnail: false }),
  archive: Object.freeze({ type: "archive", label: "Archive file", badge: "ZIP", iconClass: "text-orange-600", badgeClass: "bg-orange-100 text-orange-800", supportsThumbnail: false }),
  video: Object.freeze({ type: "video", label: "Video file", badge: "VIDEO", iconClass: "text-rose-600", badgeClass: "bg-rose-100 text-rose-800", supportsThumbnail: false }),
  audio: Object.freeze({ type: "audio", label: "Audio file", badge: "AUDIO", iconClass: "text-purple-700", badgeClass: "bg-purple-100 text-purple-800", supportsThumbnail: false }),
  code: Object.freeze({ type: "code", label: "Code or structured text file", badge: "CODE", iconClass: "text-cyan-700", badgeClass: "bg-cyan-100 text-cyan-800", supportsThumbnail: false }),
  generic: Object.freeze({ type: "generic", label: "Unknown file type", badge: "FILE", iconClass: "text-muted-foreground", badgeClass: "bg-slate-100 text-slate-700", supportsThumbnail: false })
});

const mimeTypeToDriveFileType: Readonly<Record<string, DriveFileVisualType>> = Object.freeze({
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/plain": "txt",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/json": "code",
  "text/html": "code",
  "text/css": "code",
  "application/xml": "code"
});

const extensionToDriveFileType: Readonly<Record<string, DriveFileVisualType>> = Object.freeze({
  pdf: "pdf",
  pptx: "pptx",
  ppt: "ppt",
  docx: "docx",
  doc: "doc",
  xlsx: "xlsx",
  xls: "xls",
  csv: "csv",
  txt: "txt",
  odt: "odt",
  ods: "ods",
  odp: "odp",
  png: "image",
  jpg: "image",
  jpeg: "image",
  jpe: "image",
  jfif: "image",
  gif: "image",
  apng: "image",
  webp: "image",
  jp2: "image",
  bmp: "image",
  avif: "image",
  heic: "image",
  heif: "image",
  tif: "image",
  tiff: "image",
  ico: "image",
  svg: "image",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  gz: "archive",
  tgz: "archive",
  tar: "archive",
  bz2: "archive",
  xz: "archive",
  zst: "archive",
  zstd: "archive",
  mp4: "video",
  m4v: "video",
  mov: "video",
  "3gp": "video",
  avi: "video",
  mkv: "video",
  webm: "video",
  flv: "video",
  mpg: "video",
  mpeg: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  flac: "audio",
  aac: "audio",
  m4a: "audio",
  aiff: "audio",
  aif: "audio",
  wma: "audio",
  mid: "audio",
  midi: "audio",
  md: "txt",
  markdown: "txt",
  json: "code",
  xml: "code",
  html: "code",
  htm: "code",
  css: "code",
  yaml: "code",
  yml: "code",
  c: "code",
  h: "code",
  cc: "code",
  cpp: "code",
  hpp: "code",
  cs: "code",
  java: "code",
  js: "code",
  jsx: "code",
  mjs: "code",
  cjs: "code",
  ts: "code",
  tsx: "code",
  py: "code",
  rb: "code",
  go: "code",
  rs: "code",
  php: "code",
  sql: "code",
  sh: "code",
  bash: "code",
  ps1: "code",
  bat: "code",
  cmd: "code"
});

const thumbnailMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const imageMimeBadges: Readonly<Record<string, string>> = Object.freeze({
  jpeg: "JPG",
  jpg: "JPG",
  "svg+xml": "SVG",
  "x-icon": "ICO",
  "vnd.microsoft.icon": "ICO"
});

export const driveFileVisual = (mimeType?: string, fileName?: string): DriveFileVisual => {
  const normalizedMimeType = mimeType?.split(";")[0]?.trim().toLowerCase();
  const extension = fileName?.match(/\.([^.]+)$/u)?.[1]?.toLowerCase();
  const mappedMimeType = normalizedMimeType && Object.hasOwn(mimeTypeToDriveFileType, normalizedMimeType)
    ? mimeTypeToDriveFileType[normalizedMimeType]
    : undefined;
  const mappedExtension = extension && Object.hasOwn(extensionToDriveFileType, extension)
    ? extensionToDriveFileType[extension]
    : undefined;
  const mappedType = mappedMimeType === "txt" && mappedExtension === "code"
    ? mappedExtension
    : mappedMimeType
    ?? (normalizedMimeType?.startsWith("image/") ? "image" : undefined)
    ?? (normalizedMimeType?.startsWith("video/") ? "video" : undefined)
    ?? (normalizedMimeType?.startsWith("audio/") ? "audio" : undefined)
    ?? mappedExtension;

  if (!mappedType) {
    return Object.freeze({
      ...driveFileVisuals.generic,
      badge: extension?.slice(0, 4).toUpperCase() ?? driveFileVisuals.generic.badge
    });
  }
  if (mappedType === "archive") {
    return Object.freeze({ ...driveFileVisuals.archive, badge: extension?.toUpperCase() ?? driveFileVisuals.archive.badge });
  }

  if (mappedType === "audio" || mappedType === "code" || mappedType === "video") {
    const fallback = driveFileVisuals[mappedType];
    return Object.freeze({ ...fallback, badge: extension?.slice(0, 4).toUpperCase() ?? fallback.badge });
  }

  if (mappedType === "txt" && extension && extension !== "txt") {
    return Object.freeze({ ...driveFileVisuals.txt, badge: extension.slice(0, 4).toUpperCase() });
  }

  if (mappedType === "odt" || mappedType === "ods" || mappedType === "odp") {
    return Object.freeze({ ...driveFileVisuals[mappedType], badge: extension?.slice(0, 4).toUpperCase() ?? mappedType.toUpperCase() });
  }

  if (mappedType !== "image") return driveFileVisuals[mappedType];

  const supportsThumbnail = (normalizedMimeType !== undefined && thumbnailMimeTypes.has(normalizedMimeType))
    || (extension !== undefined && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension));
  const imageFormat = normalizedMimeType?.replace(/^image\//u, "");
  const imageMimeBadge = imageFormat && Object.hasOwn(imageMimeBadges, imageFormat)
    ? imageMimeBadges[imageFormat]
    : undefined;
  return Object.freeze({
    ...driveFileVisuals.image,
    badge: extension?.toUpperCase() ?? imageMimeBadge ?? (imageFormat ? imageFormat.split(/[.+-]/u)[0]?.slice(0, 4).toUpperCase() : undefined) ?? driveFileVisuals.image.badge,
    supportsThumbnail
  });
};
