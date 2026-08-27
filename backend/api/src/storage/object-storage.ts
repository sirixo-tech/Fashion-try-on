import { createHmac, createHash } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiErrorException } from "../common/api-error.exception.js";

export interface ObjectStorageHead {
  contentType: string | null;
  sizeBytes: number;
}

export interface ObjectStorage {
  putObject(input: {
    key: string;
    contentType: string;
    body: Buffer;
  }): Promise<void>;
  createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): string;
  createReadUrl(input: {
    key: string;
    expiresInSeconds: number;
    responseContentDisposition?: string;
    responseContentType?: string;
  }): string;
  headObject(key: string): Promise<ObjectStorageHead>;
  readObject(key: string, maxBytes: number): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

export interface ObjectStorageConfig {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

@Injectable()
export class ObjectStorageService implements ObjectStorage {
  private readonly config: ObjectStorageConfig;

  constructor() {
    this.config = loadObjectStorageConfig();
  }

  async putObject(input: {
    key: string;
    contentType: string;
    body: Buffer;
  }): Promise<void> {
    const response = await fetch(this.presign("PUT", input.key, 60), {
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      body: new Uint8Array(input.body),
    });
    if (!response.ok) {
      throwStorageUnavailable("Object could not be stored.");
    }
  }

  createUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): string {
    return this.presign("PUT", input.key, input.expiresInSeconds);
  }

  createReadUrl(input: {
    key: string;
    expiresInSeconds: number;
    responseContentDisposition?: string;
    responseContentType?: string;
  }): string {
    return this.presign("GET", input.key, input.expiresInSeconds, {
      responseContentDisposition: input.responseContentDisposition,
      responseContentType: input.responseContentType,
    });
  }

  async headObject(key: string): Promise<ObjectStorageHead> {
    const response = await fetch(this.presign("HEAD", key, 60), {
      method: "HEAD",
    });
    if (!response.ok) {
      throwStorageUnavailable("Stored upload could not be inspected.");
    }
    return {
      contentType: response.headers.get("content-type"),
      sizeBytes: Number(response.headers.get("content-length") ?? "0"),
    };
  }

  async readObject(key: string, maxBytes: number): Promise<Buffer> {
    const response = await fetch(this.presign("GET", key, 60), {
      method: "GET",
    });
    if (!response.ok) {
      throwStorageUnavailable("Stored upload could not be read.");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throwStorageUnavailable("Stored upload exceeds the supported size.");
    }
    return buffer;
  }

  async deleteObject(key: string): Promise<void> {
    const response = await fetch(this.presign("DELETE", key, 60), {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 404) {
      throwStorageUnavailable("Stored upload could not be deleted.");
    }
  }

  private presign(
    method: "PUT" | "GET" | "HEAD" | "DELETE",
    key: string,
    expiresInSeconds: number,
    responseHeaders?: {
      responseContentDisposition?: string;
      responseContentType?: string;
    },
  ): string {
    const config = requireConfiguredStorage(this.config);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
    const url = objectUrl(config, key);
    const query = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(Math.max(1, Math.min(expiresInSeconds, 900))),
      "X-Amz-SignedHeaders": "host",
    });
    if (responseHeaders?.responseContentDisposition) {
      query.set(
        "response-content-disposition",
        responseHeaders.responseContentDisposition,
      );
    }
    if (responseHeaders?.responseContentType) {
      query.set("response-content-type", responseHeaders.responseContentType);
    }

    const canonicalRequest = [
      method,
      url.pathname,
      canonicalQuery(query),
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = hmacHex(
      signingKey(config.secretAccessKey, dateStamp, config.region),
      stringToSign,
    );
    query.set("X-Amz-Signature", signature);
    url.search = query.toString();
    return url.toString();
  }
}

export function loadObjectStorageConfig(
  env = process.env,
): ObjectStorageConfig {
  return {
    endpoint: env.OBJECT_STORAGE_ENDPOINT,
    region: env.OBJECT_STORAGE_REGION,
    bucket: env.OBJECT_STORAGE_BUCKET,
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  };
}

const storageEnvNames: Record<keyof ObjectStorageConfig, string> = {
  endpoint: "OBJECT_STORAGE_ENDPOINT",
  region: "OBJECT_STORAGE_REGION",
  bucket: "OBJECT_STORAGE_BUCKET",
  accessKeyId: "OBJECT_STORAGE_ACCESS_KEY_ID",
  secretAccessKey: "OBJECT_STORAGE_SECRET_ACCESS_KEY",
};

function requireConfiguredStorage(
  config: ObjectStorageConfig,
): Required<ObjectStorageConfig> {
  const missing = Object.entries(config)
    .filter(([, value]) => !value || value.trim() === "")
    .map(([key]) => storageEnvNames[key as keyof ObjectStorageConfig]);
  if (missing.length > 0) {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "OBJECT_STORAGE_NOT_CONFIGURED",
      "Object storage is not configured for customer uploads.",
    );
  }
  return config as Required<ObjectStorageConfig>;
}

function objectUrl(config: Required<ObjectStorageConfig>, key: string): URL {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(`${endpoint}/${encodeURIComponent(config.bucket)}/${encodedKey}`);
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%2F/g, "%2F")}`,
    )
    .join("&");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");
  return hmac(dateRegionServiceKey, "aws4_request");
}

function throwStorageUnavailable(message: string): never {
  throw new ApiErrorException(
    HttpStatus.SERVICE_UNAVAILABLE,
    "OBJECT_STORAGE_UNAVAILABLE",
    message,
  );
}
