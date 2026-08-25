import { HttpStatus, Injectable } from "@nestjs/common";

import {
  SELFX_GARMENT_INTENTS,
  type SelfxGarmentIntent,
} from "@selfx/shared";

import { type SelfxImage } from "../garment-preview/garment-preview.provider.js";
import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../provider-errors.js";

export interface GarmentIntentClassificationResult {
  intent: Exclude<SelfxGarmentIntent, "AUTO">;
  confidence: number;
}

type ClassifierIntent = Exclude<SelfxGarmentIntent, "AUTO"> | "UNKNOWN";

const MIN_CLASSIFICATION_CONFIDENCE = 0.62;
const CLASSIFIER_INTENTS = new Set<string>([
  ...SELFX_GARMENT_INTENTS,
  "UNKNOWN",
]);

@Injectable()
export class GarmentIntentClassifierService {
  private readonly endpoint = "https://api.openai.com/v1/chat/completions";
  private readonly model =
    process.env.GARMENT_INTENT_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  private readonly timeoutMs = 30_000;

  async classify(
    image: SelfxImage,
  ): Promise<GarmentIntentClassificationResult> {
    const apiKey = readOpenAiApiKey();
    if (!apiKey) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.configurationError,
        "Garment classification is not configured.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Classify the garment type in kiosk Try-On images. Return strict JSON only.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Identify the main garment to try on. Use TOP for shirts, blouses, jackets, sweaters, t-shirts and upper-body items. Use BOTTOM for pants, jeans, shorts, skirts and lower-body items. Use ONE_PIECE for dresses, jumpsuits, rompers and single-piece garments. Use FULL_OUTFIT only when a complete outfit with separate top and bottom items is clearly shown. If no clear garment is visible, multiple competing garments are visible, or confidence is low, use UNKNOWN. Return JSON: {\"intent\":\"TOP|BOTTOM|ONE_PIECE|FULL_OUTFIT|UNKNOWN\",\"confidence\":0-1}.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: toDataUri(image),
                    detail: "low",
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.providerUnavailable,
        "SelfX could not reach the garment classifier.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body = await safeJson(response);
    if (!response.ok) {
      throw classificationFailure(response.status);
    }

    const parsed = parseClassification(body);
    if (
      parsed.intent === "UNKNOWN" ||
      parsed.confidence < MIN_CLASSIFICATION_CONFIDENCE
    ) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.garmentNotDetected,
        "SelfX could not identify the garment type clearly.",
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
    } as GarmentIntentClassificationResult;
  }
}

function parseClassification(value: unknown): {
  intent: ClassifierIntent;
  confidence: number;
} {
  const content = firstMessageContent(value);
  if (!content) {
    throwInvalidClassification();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throwInvalidClassification();
  }
  if (!parsed || typeof parsed !== "object") {
    throwInvalidClassification();
  }
  const intent = (parsed as { intent?: unknown }).intent;
  const confidence = Number((parsed as { confidence?: unknown }).confidence);
  if (
    typeof intent !== "string" ||
    !CLASSIFIER_INTENTS.has(intent) ||
    intent === "AUTO" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throwInvalidClassification();
  }
  return {
    intent: intent as ClassifierIntent,
    confidence,
  };
}

function firstMessageContent(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("choices" in value)) {
    return null;
  }
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return null;
  }
  const first = choices[0];
  if (!first || typeof first !== "object" || !("message" in first)) {
    return null;
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object" || !("content" in message)) {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function stripJsonFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function throwInvalidClassification(): never {
  throw new SelfxAiProviderError(
    SELFX_AI_PROVIDER_ERROR_CODES.garmentNotDetected,
    "SelfX could not identify the garment type clearly.",
    HttpStatus.BAD_REQUEST,
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function classificationFailure(status: number): SelfxAiProviderError {
  if (status === 401 || status === 403) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.providerAuthFailed,
      "Garment classifier authentication failed.",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  if (status === 429) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.rateLimited,
      "Garment classifier rate limit reached.",
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
    SELFX_AI_PROVIDER_ERROR_CODES.providerUnavailable,
    "SelfX could not classify the garment image.",
    status >= 500 ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
  );
}

function toDataUri(image: SelfxImage): string {
  return `data:${image.mimeType};base64,${image.buffer.toString("base64")}`;
}

function readOpenAiApiKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY?.trim();
  return value ? value : undefined;
}
