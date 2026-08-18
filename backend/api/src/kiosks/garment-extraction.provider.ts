import { type SelfxGarmentIntent } from "@selfx/shared";

import { type KioskGarmentExtractionImage } from "./kiosk-garment-extraction.multipart.js";

export interface GarmentExtractionProviderInput {
  garmentImage: KioskGarmentExtractionImage;
  garmentIntent: SelfxGarmentIntent;
}

export interface GarmentExtractionProviderResult {
  imageDataUri: string;
  mimeType: "image/png";
}

export abstract class GarmentExtractionProvider {
  abstract extract(
    input: GarmentExtractionProviderInput,
  ): Promise<GarmentExtractionProviderResult>;
}

export class GarmentExtractionProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export class OpenAiGarmentExtractionProvider extends GarmentExtractionProvider {
  private readonly endpoint = "https://api.openai.com/v1/images/edits";
  private readonly model =
    process.env.GARMENT_EXTRACTION_OPENAI_MODEL?.trim() || "gpt-image-1";
  private readonly timeoutMs = 120_000;

  override async extract(
    input: GarmentExtractionProviderInput,
  ): Promise<GarmentExtractionProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new GarmentExtractionProviderError(
        "GARMENT_EXTRACTION_NOT_CONFIGURED",
        "Garment extraction is not configured.",
        503,
      );
    }

    const form = new FormData();
    form.append(
      "image",
      new Blob([input.garmentImage.buffer], {
        type: input.garmentImage.mimeType,
      }),
      input.garmentImage.filename || "garment-reference.png",
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
      throw new GarmentExtractionProviderError(
        "GARMENT_EXTRACTION_PROVIDER_UNAVAILABLE",
        "SelfX could not reach the garment extraction provider.",
        503,
      );
    }

    const body = await safeJson(response);
    if (!response.ok) {
      throw new GarmentExtractionProviderError(
        "GARMENT_EXTRACTION_PROVIDER_FAILED",
        providerFailureMessage(body),
        response.status >= 500 ? 503 : 502,
      );
    }

    const b64 = imageBase64From(body);
    if (!b64) {
      throw new GarmentExtractionProviderError(
        "GARMENT_EXTRACTION_PROVIDER_FAILED",
        "Garment extraction did not return an image.",
        502,
      );
    }

    return {
      imageDataUri: `data:image/png;base64,${b64}`,
      mimeType: "image/png",
    };
  }
}

function promptFor(intent: SelfxGarmentIntent): string {
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

function imageBase64From(value: unknown): string | null {
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
