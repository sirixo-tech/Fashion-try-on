import { HttpStatus, Injectable } from "@nestjs/common";

import { type SelfxGarmentIntent } from "@selfx/shared";

import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../../provider-errors.js";
import {
  GarmentPreviewProvider,
  type GarmentPreviewInput,
  type GarmentPreviewProviderMetadata,
  type GarmentPreviewResult,
} from "../garment-preview.provider.js";

@Injectable()
export class OpenAiGarmentPreviewProvider extends GarmentPreviewProvider {
  private readonly endpoint = "https://api.openai.com/v1/images/edits";
  private readonly model =
    process.env.GARMENT_EXTRACTION_OPENAI_MODEL?.trim() || "gpt-image-1";
  private readonly timeoutMs = 120_000;

  override metadata(): GarmentPreviewProviderMetadata {
    return {
      provider: "openai",
      providerDisplayName: "OpenAI",
      model: this.model,
    };
  }

  override assertConfigured(): void {
    if (!readOpenAiApiKey()) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.configurationError,
        "Garment extraction is not configured.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  override async generatePreview(
    input: GarmentPreviewInput,
  ): Promise<GarmentPreviewResult> {
    const apiKey = readOpenAiApiKey();
    if (!apiKey) {
      this.assertConfigured();
      throw new Error("OPENAI_API_KEY missing after configuration check.");
    }

    const form = new FormData();
    form.append(
      "image",
      new Blob([Uint8Array.from(input.image.buffer)], {
        type: input.image.mimeType,
      }),
      input.image.filename || "garment-reference.png",
    );
    form.append("model", this.model);
    form.append("prompt", promptFor(input.garmentIntent));
    form.append("size", "1024x1536");
    form.append("output_format", "png");

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.providerUnavailable,
        "SelfX could not reach the garment extraction provider.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body = await safeJson(response);
    if (!response.ok) {
      throw openAiFailure(response.status, body);
    }

    const b64 = openAiImageBase64From(body);
    if (!b64) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.generationFailed,
        "Garment extraction did not return an image.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      imageDataUri: `data:image/png;base64,${b64}`,
      mimeType: "image/png",
    };
  }
}

export function promptFor(intent: SelfxGarmentIntent): string {
  const target = (() => {
    switch (intent) {
      case "TOP":
        return "the upper-body garment only, such as the shirt, blouse, jacket, sweater or top";
      case "BOTTOM":
        return "the lower-body garment only, such as the pants, jeans, shorts or skirt";
      case "ONE_PIECE":
        return "the one-piece garment only, such as the dress, jumpsuit or romper";
      case "FULL_OUTFIT":
        return "the complete outfit only, separated from the person";
      case "AUTO":
      default:
        return "the visible garment or outfit only";
    }
  })();

  return [
    `Extract ${target} from the reference image.`,
    "Remove the person, face, hair, skin, hands, arms, legs, shoes, accessories, background, shadows and any mannequin or hanger.",
    "Output a clean product-style garment cutout centered in the image on a plain transparent or white background.",
    "Preserve the garment's exact color, pattern, fabric texture, seams, buttons, collar, sleeves, hem and silhouette.",
    "Do not invent a new garment and do not include any body parts.",
  ].join(" ");
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function openAiImageBase64From(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("data" in value)) {
    return null;
  }
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return null;
  }
  const first = data[0];
  if (!first || typeof first !== "object" || !("b64_json" in first)) {
    return null;
  }
  const b64 = (first as { b64_json?: unknown }).b64_json;
  return typeof b64 === "string" && b64.trim().length > 0 ? b64 : null;
}

function openAiFailure(status: number, body: unknown): SelfxAiProviderError {
  if (status === 401 || status === 403) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.providerAuthFailed,
      "Garment extraction provider authentication failed.",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  if (status === 429) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.rateLimited,
      "Garment extraction provider rate limit reached.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  if (status === 400 || status === 422) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.invalidImage,
      "SelfX could not use this garment image.",
      HttpStatus.BAD_REQUEST,
    );
  }

  return new SelfxAiProviderError(
    SELFX_AI_PROVIDER_ERROR_CODES.generationFailed,
    providerFailureMessage(body),
    status >= 500 ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
  );
}

function providerFailureMessage(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return "SelfX could not prepare the garment image.";
  }
  return "SelfX could not prepare the garment image.";
}

function readOpenAiApiKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY?.trim();
  return value ? value : undefined;
}
