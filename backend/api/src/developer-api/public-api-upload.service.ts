import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { KioskAssignmentScope, TryOnAssetPurpose } from "@prisma/client";

import { ObjectStorageService } from "../storage/object-storage.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import {
  type PublicApiUploadResponseDto,
  type PublicApiUploadPurpose,
} from "./dto/public-api-upload.dto.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import { type PublicApiUploadPayload } from "./public-api-upload.multipart.js";

@Injectable()
export class PublicApiUploadService {
  constructor(
    private readonly storage: ObjectStorageService,
    private readonly tryOnSessions: TryOnSessionService,
  ) {}

  async uploadImage(
    credential: PublicApiCredentialContext,
    payload: PublicApiUploadPayload,
  ): Promise<PublicApiUploadResponseDto> {
    const expiresAt = new Date(Date.now() + TRY_ON_RESULT_RETENTION_MS);
    let storageKey: string | undefined;
    let createdSessionId: string | undefined;

    try {
      const sessionId =
        payload.sessionId ??
        (
          await this.tryOnSessions.createSession({
            assignmentScope: KioskAssignmentScope.ORGANIZATION,
            organizationId: credential.storeId,
            storeId: null,
            kioskDeviceId: null,
            expiresAt,
          })
        ).id;
      createdSessionId = payload.sessionId ? undefined : sessionId;
      storageKey = objectKeyFor({
        storeId: credential.storeId,
        sessionId,
        purpose: payload.purpose,
        contentType: payload.image.mimeType,
      });

      await this.storage.putObject({
        key: storageKey,
        contentType: payload.image.mimeType,
        body: payload.image.buffer,
      });

      const assetInput = {
        sessionId,
        organizationId: credential.storeId,
        storeId: null,
        kioskDeviceId: null,
        storageKey,
        contentType: payload.image.mimeType,
        sizeBytes: payload.image.sizeBytes,
        width: payload.image.width,
        height: payload.image.height,
        expiresAt,
      };
      const asset =
        payload.purpose === "PERSON"
          ? await this.tryOnSessions.attachPersonAsset(assetInput)
          : await this.tryOnSessions.attachGarmentAsset(assetInput);

      return {
        sessionId,
        assetId: asset.id,
        purpose: payload.purpose,
        contentType: payload.image.mimeType,
        sizeBytes: payload.image.sizeBytes,
        width: payload.image.width,
        height: payload.image.height,
        expiresAt: asset.expiresAt.toISOString(),
        serverTime: new Date().toISOString(),
      };
    } catch (error) {
      if (storageKey) {
        await this.deleteObjectBestEffort(storageKey);
      }
      if (createdSessionId) {
        await this.completeSessionBestEffort(
          createdSessionId,
          credential.storeId,
        );
      }
      throw error;
    }
  }

  private async deleteObjectBestEffort(storageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(storageKey);
    } catch {
      // Durable retention cleanup is the fallback if immediate cleanup fails.
    }
  }

  private async completeSessionBestEffort(
    sessionId: string,
    storeId: string,
  ): Promise<void> {
    try {
      await this.tryOnSessions.completeSession({
        sessionId,
        organizationId: storeId,
        storeId: null,
        kioskDeviceId: null,
      });
    } catch {
      // Avoid masking the original upload failure.
    }
  }
}

function objectKeyFor(input: {
  storeId: string;
  sessionId: string;
  purpose: PublicApiUploadPurpose;
  contentType: string;
}): string {
  const extension =
    input.contentType === "image/png"
      ? "png"
      : input.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const purpose =
    input.purpose === TryOnAssetPurpose.PERSON
      ? "person"
      : input.purpose === "JEWELLERY"
        ? "jewellery"
        : "garment";
  return [
    "public-api",
    input.storeId,
    input.sessionId,
    `${purpose}-${randomUUID()}.${extension}`,
  ].join("/");
}
