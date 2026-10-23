import type { ApiDriveEntry, ApiDriveFolderPathResponse, ApiDriveListQuery, ApiDriveListResponse, ApiDriveStorageUsage } from "@workspace/types";
import { drivePreviewKind, maxDrivePreviewBytes, normalizeDriveMimeType } from "./utils/drive-preview.logic";
import type { DriveUploadProgress } from "./types/drive.types";

type DriveApiDependencies = Readonly<{
  baseUrl: string;
  fetchImpl?: typeof fetch;
  xhrFactory?: () => XMLHttpRequest;
}>;
const errorMessage = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const apiError = payload.error;
      if (typeof apiError === "object" && apiError !== null && "message" in apiError && typeof apiError.message === "string") {
        return apiError.message;
      }
    }
  } catch { /* Use a safe fallback if the API response is not JSON. */ }
  return "The Drive request could not be completed.";
};

const readBoundedBlob = async (response: Response, maxBytes: number): Promise<Blob> => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("This file is too large to preview. Download it to open it in a compatible application.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    if (blob.size > maxBytes) {
      throw new Error("This file is too large to preview. Download it to open it in a compatible application.");
    }
    return blob;
  }

  const chunks: ArrayBuffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("This file is too large to preview. Download it to open it in a compatible application.");
      }
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
    }
  } finally {
    reader.releaseLock();
  }
  const contentType = response.headers.get("content-type")?.trim().replace(/\s*;\s*/gu, ";") ?? "";
  return new Blob(chunks, { type: contentType });
};

export const createDriveApi = ({ baseUrl, fetchImpl = fetch, xhrFactory = () => new XMLHttpRequest() }: DriveApiDependencies) => {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/u, "")}${path}`, init);
    } catch {
      throw new Error("The local Drive API is unavailable. Start the API and check its local configuration.");
    }
    if (!response.ok) throw new Error(await errorMessage(response));
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  };

  const list = (input: ApiDriveListQuery = {}): Promise<ApiDriveListResponse> => {
    const query = new URLSearchParams({ page: String(input.page ?? 1), pageSize: String(input.pageSize ?? 25) });
    if (input.parentId) query.set("parentId", input.parentId);
    if (input.search) query.set("search", input.search);
    if (input.favorites) query.set("favorites", "true");
    if (input.recent) query.set("recent", "true");
    if (input.fileType) query.set("fileType", input.fileType);
    if (input.modifiedAfter) query.set("modifiedAfter", input.modifiedAfter);
    if (input.modifiedBefore) query.set("modifiedBefore", input.modifiedBefore);
    if (input.minSizeBytes !== undefined) query.set("minSizeBytes", String(input.minSizeBytes));
    if (input.maxSizeBytes !== undefined) query.set("maxSizeBytes", String(input.maxSizeBytes));
    if (input.sortBy) query.set("sortBy", input.sortBy);
    if (input.sortOrder) query.set("sortOrder", input.sortOrder);
    return request(`/drive/entries?${query.toString()}`);
  };

  const storageUsage = (): Promise<ApiDriveStorageUsage> => request("/drive/storage-usage");

  const folderPath = (id: string): Promise<ApiDriveFolderPathResponse> =>
    request(`/drive/folders/${encodeURIComponent(id)}/path`);

  const createFolder = (input: Readonly<{ name: string; parentId?: string }>): Promise<ApiDriveEntry> =>
    request("/drive/folders", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input)
    });

  const updateEntry = (id: string, changes: Readonly<{ name?: string; parentId?: string }>): Promise<ApiDriveEntry> =>
    request(`/drive/entries/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes)
    });

  const setFavorite = (id: string, isStarred: boolean): Promise<ApiDriveEntry> =>
    request(`/drive/entries/${encodeURIComponent(id)}/favorite`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isStarred })
    });

  const recordFileAccess = (id: string): Promise<void> =>
    request(`/drive/entries/${encodeURIComponent(id)}/access`, { method: "POST" });

  const deleteEntry = (id: string): Promise<void> => request(`/drive/entries/${encodeURIComponent(id)}`, { method: "DELETE" });

  const uploadFile = (file: File, parentId: string, onProgress?: (progress: DriveUploadProgress) => void): Promise<ApiDriveEntry> =>
    new Promise((resolve, reject) => {
      const xhr = xhrFactory();
      xhr.open("PUT", `${baseUrl.replace(/\/$/u, "")}/drive/files`);
      xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("x-drive-parent-id", parentId);
      xhr.upload.onprogress = (event): void => {
        if (event.lengthComputable) onProgress?.({ loaded: event.loaded, total: event.total });
      };
      xhr.onerror = (): void => reject(new Error("The local Drive API is unavailable. Start the API and check its local configuration."));
      xhr.onload = (): void => {
        if (xhr.status < 200 || xhr.status >= 300) {
          const errorResponse = new Response(xhr.responseText, { status: xhr.status });
          void errorMessage(errorResponse).then((message) => reject(new Error(message)));
          return;
        }
        try {
          onProgress?.({ loaded: file.size, total: file.size });
          resolve(JSON.parse(xhr.responseText) as ApiDriveEntry);
        } catch {
          reject(new Error("The Drive API returned an invalid upload response."));
        }
      };
      xhr.send(file);
    });

  const downloadUrl = (id: string): string =>
    `${baseUrl.replace(/\/$/u, "")}/drive/files/${encodeURIComponent(id)}/download`;

  const downloadFile = async (id: string): Promise<Blob> => {
    let response: Response;
    try {
      response = await fetchImpl(downloadUrl(id));
    } catch {
      throw new Error("The local Drive API is unavailable. Start the API and check its local configuration.");
    }
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.blob();
  };

  const previewFile = async (id: string, signal: AbortSignal, maxBytes = maxDrivePreviewBytes, fileName?: string): Promise<Blob> => {
    let response: Response;
    try {
      response = await fetchImpl(downloadUrl(id), { signal });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("The local Drive API is unavailable. Start the API and check its local configuration.");
    }
    if (!response.ok) throw new Error(await errorMessage(response));
    const blob = await readBoundedBlob(response, maxBytes);
    const previewKind = drivePreviewKind(blob.type, fileName);
    if (!normalizeDriveMimeType(blob.type) && previewKind !== "csv" && previewKind !== "pptx") {
      throw new Error("Preview is not available for this file type.");
    }
    return blob;
  };

  return Object.freeze({ list, storageUsage, folderPath, createFolder, updateEntry, setFavorite, recordFileAccess, deleteEntry, uploadFile, downloadUrl, downloadFile, previewFile });
};
