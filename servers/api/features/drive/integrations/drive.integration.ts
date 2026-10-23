import { Readable } from "node:stream";

export type SupabaseStorageConfig = Readonly<{
  url: string;
  bucket: string;
  secretKey: string;
}>;

type SupabaseFetch = (input: string, init: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: string | ReadableStream<Uint8Array>;
    duplex?: "half";
    signal?: AbortSignal;
}>) => Promise<Response>;

type SupabaseStorageDependencies = Readonly<{ config: SupabaseStorageConfig; fetchImpl?: SupabaseFetch }>;

export type SupabaseStorageIntegration = Readonly<{
  verifyPrivateBucket: () => Promise<boolean>;
  uploadObject: (input: Readonly<{
    objectKey: string; contentType: string; contentLength: number; body: Readable;
  }>) => Promise<void>;
  downloadObject: (objectKey: string) => Promise<Readonly<{
    body: Readable; contentType: string | null; contentLength: string | null;
  }> | null>;
  removeObject: (objectKey: string) => Promise<void>;
}>;

export const createSupabaseStorageIntegration = ({
  config,
  fetchImpl = fetch
}: SupabaseStorageDependencies): SupabaseStorageIntegration => {
  const verifyPrivateBucket = async (): Promise<boolean> => {
    try {
      const bucketUrl = new URL(`/storage/v1/bucket/${encodeURIComponent(config.bucket)}`, config.url);
      const response = await fetchImpl(bucketUrl.href, {
        method: "GET",
        headers: { apikey: config.secretKey, accept: "application/json" },
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) return false;
      const bucket: unknown = await response.json();
      return typeof bucket === "object" && bucket !== null && "public" in bucket && bucket.public === false;
    } catch {
      return false;
    }
  };

  const requirePrivateBucket = async (): Promise<void> => {
    if (!await verifyPrivateBucket()) throw new Error("Configured Supabase bucket is unavailable or not private.");
  };

  const uploadObject: SupabaseStorageIntegration["uploadObject"] = async ({ objectKey, contentType, contentLength, body }) => {
    await requirePrivateBucket();
    const objectUrl = new URL(
      `/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(objectKey)}`,
      config.url
    );
    let response: Response;
    try {
      response = await fetchImpl(objectUrl.href, {
        method: "POST",
        headers: {
          apikey: config.secretKey,
          "content-type": contentType,
          "content-length": String(contentLength),
          "x-upsert": "false"
        },
        body: Readable.toWeb(body),
        duplex: "half"
      });
    } catch {
      throw new Error("Supabase Storage upload request failed.");
    }
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Supabase Storage upload failed with status ${String(response.status)}.`);
  };

  const downloadObject: SupabaseStorageIntegration["downloadObject"] = async (objectKey) => {
    await requirePrivateBucket();
    const objectUrl = new URL(
      `/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeURIComponent(objectKey)}`,
      config.url
    );
    let response: Response;
    try {
      response = await fetchImpl(objectUrl.href, { headers: { apikey: config.secretKey } });
    } catch {
      throw new Error("Supabase Storage download request failed.");
    }
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Supabase Storage download failed with status ${String(response.status)}.`);
    }
    return Object.freeze({
      body: Readable.fromWeb(response.body),
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length")
    });
  };

  const removeObject: SupabaseStorageIntegration["removeObject"] = async (objectKey) => {
    await requirePrivateBucket();
    const bucketUrl = new URL(`/storage/v1/object/${encodeURIComponent(config.bucket)}`, config.url);
    let response: Response;
    try {
      response = await fetchImpl(bucketUrl.href, {
        method: "DELETE",
        headers: { apikey: config.secretKey, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [objectKey] })
      });
    } catch {
      throw new Error("Supabase Storage delete request failed.");
    }
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Supabase Storage delete failed with status ${String(response.status)}.`);
  };

  return Object.freeze({ verifyPrivateBucket, uploadObject, downloadObject, removeObject });
};
