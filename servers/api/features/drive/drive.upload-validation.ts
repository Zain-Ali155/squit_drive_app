import { PassThrough, Transform, type Readable } from "node:stream";
import {
  driveUploadMetadataSchema,
  MAX_DRIVE_FILE_SIZE
} from "./drive.validation.js";

type UploadSignature =
  | "pdf" | "ole" | "zip" | "png" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "ico" | "jp2"
  | "avif" | "heic" | "mp4" | "avi" | "ebml" | "flv" | "mpeg" | "mp3" | "wav" | "ogg" | "flac"
  | "aac" | "aiff" | "wma" | "midi" | "rar" | "7z" | "gzip" | "bzip2" | "xz" | "zstd" | "tar"
  | "text" | "svg";

type UploadPolicy = Readonly<{
  contentType: string;
  acceptedMimeTypes: readonly string[];
  signature: UploadSignature;
}>;

const policy = (contentType: string, signature: UploadSignature, ...acceptedMimeTypes: string[]): UploadPolicy =>
  Object.freeze({ contentType, signature, acceptedMimeTypes: Object.freeze([contentType, ...acceptedMimeTypes]) });

const textPolicy = (contentType: string, ...acceptedMimeTypes: string[]): UploadPolicy =>
  policy(contentType, "text", ...acceptedMimeTypes);

const uploadPolicies: Readonly<Record<string, UploadPolicy>> = Object.freeze({
  pdf: policy("application/pdf", "pdf"),
  doc: policy("application/msword", "ole"),
  docx: policy("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "zip"),
  xls: policy("application/vnd.ms-excel", "ole"),
  xlsx: policy("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "zip"),
  ppt: policy("application/vnd.ms-powerpoint", "ole"),
  pptx: policy("application/vnd.openxmlformats-officedocument.presentationml.presentation", "zip"),
  odt: policy("application/vnd.oasis.opendocument.text", "zip"),
  ods: policy("application/vnd.oasis.opendocument.spreadsheet", "zip"),
  odp: policy("application/vnd.oasis.opendocument.presentation", "zip"),
  txt: textPolicy("text/plain"),
  csv: textPolicy("text/csv", "application/csv", "application/vnd.ms-excel"),
  tsv: textPolicy("text/tab-separated-values", "text/plain"),
  json: textPolicy("application/json", "text/plain", "text/json"),
  xml: textPolicy("application/xml", "text/xml", "text/plain"),
  md: textPolicy("text/plain", "text/markdown", "text/x-markdown"),
  markdown: textPolicy("text/plain", "text/markdown", "text/x-markdown"),
  html: textPolicy("application/octet-stream", "text/html", "application/xhtml+xml", "text/plain"),
  htm: textPolicy("application/octet-stream", "text/html", "application/xhtml+xml", "text/plain"),
  css: textPolicy("text/plain", "text/css"),
  yaml: textPolicy("text/plain", "application/yaml", "text/yaml"),
  yml: textPolicy("text/plain", "application/yaml", "text/yaml"),
  c: textPolicy("text/plain", "text/x-c", "text/x-csrc"),
  h: textPolicy("text/plain", "text/x-c", "text/x-chdr"),
  cc: textPolicy("text/plain", "text/x-c++", "text/x-c++src"),
  cpp: textPolicy("text/plain", "text/x-c++", "text/x-c++src"),
  hpp: textPolicy("text/plain", "text/x-c++", "text/x-c++hdr"),
  cs: textPolicy("text/plain", "text/x-csharp"),
  java: textPolicy("text/plain", "text/x-java-source"),
  js: textPolicy("text/plain", "text/javascript", "application/javascript", "application/x-javascript"),
  jsx: textPolicy("text/plain", "text/javascript", "application/javascript", "application/x-javascript"),
  mjs: textPolicy("text/plain", "text/javascript", "application/javascript"),
  cjs: textPolicy("text/plain", "text/javascript", "application/javascript"),
  ts: textPolicy("text/plain", "text/typescript", "application/typescript"),
  tsx: textPolicy("text/plain", "text/typescript", "application/typescript"),
  py: textPolicy("text/plain", "text/x-python", "application/x-python"),
  rb: textPolicy("text/plain", "text/x-ruby"),
  go: textPolicy("text/plain", "text/x-go"),
  rs: textPolicy("text/plain", "text/x-rust"),
  php: textPolicy("text/plain", "text/x-php", "application/x-httpd-php"),
  sql: textPolicy("text/plain", "application/sql", "text/x-sql"),
  sh: textPolicy("text/plain", "application/x-sh", "text/x-shellscript"),
  bash: textPolicy("text/plain", "application/x-sh", "text/x-shellscript"),
  ps1: textPolicy("text/plain", "text/plain"),
  bat: textPolicy("text/plain", "text/plain"),
  cmd: textPolicy("text/plain", "text/plain"),
  png: policy("image/png", "png"),
  jpg: policy("image/jpeg", "jpeg"),
  jpeg: policy("image/jpeg", "jpeg"),
  jpe: policy("image/jpeg", "jpeg"),
  jfif: policy("image/jpeg", "jpeg"),
  gif: policy("image/gif", "gif"),
  apng: policy("image/apng", "png", "image/png"),
  webp: policy("image/webp", "webp"),
  bmp: policy("image/bmp", "bmp", "image/x-ms-bmp"),
  tif: policy("image/tiff", "tiff"),
  tiff: policy("image/tiff", "tiff"),
  ico: policy("image/x-icon", "ico", "image/vnd.microsoft.icon"),
  jp2: policy("image/jp2", "jp2", "image/jpeg2000"),
  avif: policy("image/avif", "avif"),
  heic: policy("image/heic", "heic", "image/heif"),
  heif: policy("image/heif", "heic", "image/heic"),
  svg: policy("application/octet-stream", "svg", "image/svg+xml", "text/xml", "application/xml"),
  mp4: policy("video/mp4", "mp4", "application/mp4"),
  m4v: policy("video/mp4", "mp4", "application/mp4"),
  mov: policy("video/quicktime", "mp4", "video/mp4"),
  "3gp": policy("video/3gpp", "mp4", "video/mp4"),
  avi: policy("video/x-msvideo", "avi"),
  mkv: policy("video/x-matroska", "ebml"),
  webm: policy("video/webm", "ebml"),
  flv: policy("video/x-flv", "flv"),
  mpg: policy("video/mpeg", "mpeg"),
  mpeg: policy("video/mpeg", "mpeg"),
  mp3: policy("audio/mpeg", "mp3", "audio/mp3"),
  wav: policy("audio/wav", "wav", "audio/x-wav", "audio/wave"),
  ogg: policy("audio/ogg", "ogg", "application/ogg"),
  oga: policy("audio/ogg", "ogg", "application/ogg"),
  flac: policy("audio/flac", "flac", "audio/x-flac"),
  aac: policy("audio/aac", "aac"),
  m4a: policy("audio/mp4", "mp4"),
  aiff: policy("audio/aiff", "aiff", "audio/x-aiff"),
  aif: policy("audio/aiff", "aiff", "audio/x-aiff"),
  wma: policy("audio/x-ms-wma", "wma"),
  mid: policy("audio/midi", "midi", "audio/x-midi"),
  midi: policy("audio/midi", "midi", "audio/x-midi"),
  zip: policy("application/zip", "zip", "application/x-zip-compressed"),
  rar: policy("application/vnd.rar", "rar", "application/x-rar-compressed"),
  "7z": policy("application/x-7z-compressed", "7z"),
  gz: policy("application/gzip", "gzip", "application/x-gzip"),
  tgz: policy("application/gzip", "gzip", "application/x-gzip"),
  tar: policy("application/x-tar", "tar"),
  bz2: policy("application/x-bzip2", "bzip2", "application/bzip2"),
  xz: policy("application/x-xz", "xz"),
  zst: policy("application/zstd", "zstd")
});

const prohibitedExtensions = new Set([
  "exe", "dll", "com", "scr", "msi", "msp", "cpl", "sys", "drv", "ocx", "efi", "app", "dmg",
  "pkg", "deb", "rpm", "apk", "appx", "msix", "jar", "war", "class", "docm", "dotm", "xlsm",
  "xltm", "xlam", "pptm", "potm", "ppam"
]);

const prohibitedMimeTypes = new Set([
  "application/x-msdownload", "application/x-dosexec", "application/vnd.microsoft.portable-executable",
  "application/x-executable"
]);

const startsWith = (sample: Buffer, signature: readonly number[]): boolean =>
  signature.every((byte, index) => sample[index] === byte);

const tarHeaderIsValid = (sample: Buffer): boolean => {
  if (sample.length < 512) return false;
  const declaredChecksum = Number.parseInt(sample.subarray(148, 156).toString("ascii").replace(/\0.*$/u, "").trim(), 8);
  if (!Number.isFinite(declaredChecksum)) return false;
  let checksum = 0;
  for (let index = 0; index < 512; index += 1) {
    checksum += index >= 148 && index < 156 ? 32 : sample[index] ?? 0;
  }
  return checksum === declaredChecksum;
};

const matchesSignature = (signature: UploadSignature, sample: Buffer): boolean => {
  const isIsoBmff = sample.subarray(4, 8).toString("ascii") === "ftyp";
  const isoBrand = sample.subarray(8, 12).toString("ascii");
  switch (signature) {
    case "pdf": return sample.subarray(0, 5).toString("ascii") === "%PDF-";
    case "ole": return startsWith(sample, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "zip": return startsWith(sample, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(sample, [0x50, 0x4b, 0x05, 0x06]) || startsWith(sample, [0x50, 0x4b, 0x07, 0x08]);
    case "png": return startsWith(sample, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg": return startsWith(sample, [0xff, 0xd8, 0xff]);
    case "gif": return ["GIF87a", "GIF89a"].includes(sample.subarray(0, 6).toString("ascii"));
    case "webp": return sample.subarray(0, 4).toString("ascii") === "RIFF" && sample.subarray(8, 12).toString("ascii") === "WEBP";
    case "bmp": return sample.subarray(0, 2).toString("ascii") === "BM";
    case "tiff": return startsWith(sample, [0x49, 0x49, 0x2a, 0x00]) || startsWith(sample, [0x4d, 0x4d, 0x00, 0x2a]);
    case "ico": return startsWith(sample, [0x00, 0x00, 0x01, 0x00]);
    case "jp2": return startsWith(sample, [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
    case "avif": return isIsoBmff && ["avif", "avis"].includes(isoBrand);
    case "heic": return isIsoBmff && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(isoBrand);
    case "mp4": return isIsoBmff;
    case "avi": return sample.subarray(0, 4).toString("ascii") === "RIFF" && sample.subarray(8, 12).toString("ascii") === "AVI ";
    case "ebml": return startsWith(sample, [0x1a, 0x45, 0xdf, 0xa3]);
    case "flv": return sample.subarray(0, 3).toString("ascii") === "FLV";
    case "mpeg": return startsWith(sample, [0x00, 0x00, 0x01, 0xba]) || startsWith(sample, [0x00, 0x00, 0x01, 0xb3]);
    case "mp3": return sample.subarray(0, 3).toString("ascii") === "ID3" ||
      (sample[0] === 0xff && ((sample[1] ?? 0) & 0xe0) === 0xe0);
    case "wav": return sample.subarray(0, 4).toString("ascii") === "RIFF" && sample.subarray(8, 12).toString("ascii") === "WAVE";
    case "ogg": return sample.subarray(0, 4).toString("ascii") === "OggS";
    case "flac": return sample.subarray(0, 4).toString("ascii") === "fLaC";
    case "aac": return startsWith(sample, [0xff, 0xf1]) || startsWith(sample, [0xff, 0xf9]) || sample.subarray(0, 4).toString("ascii") === "ADIF";
    case "aiff": return sample.subarray(0, 4).toString("ascii") === "FORM" &&
      ["AIFF", "AIFC"].includes(sample.subarray(8, 12).toString("ascii"));
    case "wma": return startsWith(sample, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]);
    case "midi": return sample.subarray(0, 4).toString("ascii") === "MThd";
    case "rar": return startsWith(sample, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
      startsWith(sample, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]);
    case "7z": return startsWith(sample, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    case "gzip": return startsWith(sample, [0x1f, 0x8b]);
    case "bzip2": return sample.subarray(0, 3).toString("ascii") === "BZh";
    case "xz": return startsWith(sample, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
    case "zstd": return startsWith(sample, [0x28, 0xb5, 0x2f, 0xfd]);
    case "tar": return sample.subarray(257, 262).toString("ascii") === "ustar" || tarHeaderIsValid(sample);
    case "text": {
      if (sample.includes(0)) return false;
      return !Array.from(sample).some((byte) => byte < 32 && ![9, 10, 13].includes(byte));
    }
    case "svg": {
      if (sample.includes(0) || Array.from(sample).some((byte) => byte < 32 && ![9, 10, 13].includes(byte))) return false;
      return /<svg(?:\s|>)/iu.test(sample.toString("utf8"));
    }
  }
};

const startsWithExecutableSignature = (sample: Buffer): boolean =>
  startsWith(sample, [0x4d, 0x5a]) || startsWith(sample, [0x7f, 0x45, 0x4c, 0x46]) ||
  startsWith(sample, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(sample, [0xce, 0xfa, 0xed, 0xfe]) ||
  startsWith(sample, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(sample, [0xcf, 0xfa, 0xed, 0xfe]) ||
  startsWith(sample, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(sample, [0xbe, 0xba, 0xfe, 0xca]) ||
  startsWith(sample, [0x00, 0x61, 0x73, 0x6d]);

export type ValidatedUploadStream = Readonly<{
  stream: PassThrough;
  completion: Promise<number>;
  contentType: string;
  cancel: () => void;
}>;

export const createValidatedUploadStream = ({
  source,
  name,
  contentType,
  contentLength
}: Readonly<{ source: Readable; name: string; contentType: string; contentLength: number }>): ValidatedUploadStream => {
  const metadata = driveUploadMetadataSchema.parse({ name, contentType, contentLength });
  const normalizedName = metadata.name.replace(/[. ]+$/u, "");
  const extension = normalizedName.split(".").at(-1)?.toLowerCase() ?? "";
  const normalizedContentType = metadata.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const filePolicy = Object.hasOwn(uploadPolicies, extension) ? uploadPolicies[extension] : undefined;
  const mimePolicy = normalizedContentType === "application/octet-stream"
    ? undefined
    : Object.values(uploadPolicies).find((candidate) => candidate.acceptedMimeTypes.includes(normalizedContentType));
  if (prohibitedExtensions.has(extension) || prohibitedMimeTypes.has(normalizedContentType)) {
    throw new Error("This file type is prohibited.");
  }
  if (filePolicy && normalizedContentType !== "application/octet-stream" &&
      !filePolicy.acceptedMimeTypes.includes(normalizedContentType)) {
    throw new Error("File name and media type do not match.");
  }
  const validatedContentType = filePolicy?.contentType ?? "application/octet-stream";
  const contentPolicy = filePolicy ?? mimePolicy;
  const textDecoder = contentPolicy && ["text", "svg"].includes(contentPolicy.signature)
    ? new TextDecoder("utf-8", { fatal: true })
    : undefined;

  let byteCount = 0;
  let sample = Buffer.alloc(0);
  let validated = false;
  const validateText = (bytes: Buffer, final: boolean): boolean => {
    if (!textDecoder) return true;
    if (bytes.includes(0) || Array.from(bytes).some((byte) => byte < 32 && ![9, 10, 13].includes(byte))) return false;
    try {
      textDecoder.decode(bytes, { stream: !final });
      return true;
    } catch {
      return false;
    }
  };
  const matchesUploadContent = (bytes: Buffer, final: boolean): boolean => {
    if (startsWithExecutableSignature(bytes)) return false;
    if (startsWith(bytes, [0x23, 0x21]) && !contentPolicy) return false;
    if (!contentPolicy) return true;
    if (!matchesSignature(contentPolicy.signature, bytes)) return false;
    return validateText(bytes, final);
  };
  const validator = new Transform({
    transform(chunk: Buffer, _encoding, callback): void {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteCount += bytes.length;
      if (byteCount > MAX_DRIVE_FILE_SIZE || byteCount > metadata.contentLength) {
        callback(new Error("Upload exceeds its declared or configured size limit."));
        return;
      }
      if (validated) {
        if (!validateText(bytes, false)) {
          callback(new Error("Text file content is not valid UTF-8."));
          return;
        }
        callback(null, bytes);
        return;
      }
      const remainingSampleBytes = 512 - sample.length;
      const sampledBytes = bytes.subarray(0, remainingSampleBytes);
      sample = Buffer.concat([sample, sampledBytes]);
      const rest = bytes.subarray(sampledBytes.length);
      if (sample.length < 512) {
        callback();
        return;
      }
      if (!matchesUploadContent(sample, false)) {
        callback(new Error("Uploaded file content does not match its declared file type."));
        return;
      }
      validated = true;
      if (rest.length > 0 && !validateText(rest, false)) {
        callback(new Error("Text file content is not valid UTF-8."));
        return;
      }
      callback(null, rest.length > 0 ? Buffer.concat([sample, rest]) : sample);
      sample = Buffer.alloc(0);
    },
    flush(callback): void {
      if (!validated && !matchesUploadContent(sample, true)) {
        callback(new Error("Uploaded file content does not match its declared file type."));
        return;
      }
      if (validated && !validateText(Buffer.alloc(0), true)) {
        callback(new Error("Text file content is not valid UTF-8."));
        return;
      }
      if (!validated) {
        validated = true;
        callback(null, sample);
        return;
      }
      callback();
    }
  });
  const stream = new PassThrough();
  let settled = false;
  const completion = new Promise<number>((resolve, reject) => {
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      source.unpipe(validator);
      validator.unpipe(stream);
      stream.destroy();
      reject(error);
    };
    source.once("error", fail);
    validator.once("error", fail);
    stream.once("finish", () => {
      if (byteCount !== metadata.contentLength) {
        fail(new Error("Upload size differs from its declared length."));
        return;
      }
      if (!settled) {
        settled = true;
        resolve(byteCount);
      }
    });
    source.pipe(validator).pipe(stream);
  });
  const cancel = (): void => {
    source.unpipe(validator);
    validator.unpipe(stream);
    validator.destroy();
    stream.destroy();
    source.resume();
  };
  return Object.freeze({ stream, completion, contentType: validatedContentType, cancel });
};
