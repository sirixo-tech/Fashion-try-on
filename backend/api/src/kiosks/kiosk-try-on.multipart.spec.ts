import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { parseKioskTryOnRunMultipartRequest } from "./kiosk-try-on.multipart.js";

const sessionId = "0198a9b3-d0bc-7000-8000-000000000601";
const productId = "0198a9b3-d0bc-7000-8000-000000000701";

describe("parseKioskTryOnRunMultipartRequest", () => {
  it("accepts 180-character external product references", async () => {
    const externalProductId = "p".repeat(180);
    const externalVariantId = "v".repeat(180);

    const payload = await parseKioskTryOnRunMultipartRequest(
      multipartRequest({
        sessionId,
        productId,
        externalProductId,
        externalVariantId,
      }),
    );

    expect(payload.externalProductId).toBe(externalProductId);
    expect(payload.externalVariantId).toBe(externalVariantId);
  });

  it("rejects external product references longer than 180 characters", async () => {
    await expectInvalidMetadata(
      parseKioskTryOnRunMultipartRequest(
        multipartRequest({
          sessionId,
          productId,
          externalProductId: "p".repeat(181),
        }),
      ),
      "Invalid external product ID.",
    );

    await expectInvalidMetadata(
      parseKioskTryOnRunMultipartRequest(
        multipartRequest({
          sessionId,
          productId,
          externalVariantId: "v".repeat(181),
        }),
      ),
      "Invalid external variant ID.",
    );
  });
});

function multipartRequest(fields: Record<string, string>): FastifyRequest {
  return {
    isMultipart: () => true,
    parts: async function* parts() {
      for (const [fieldname, value] of Object.entries(fields)) {
        yield {
          type: "field",
          fieldname,
          value,
        };
      }
    },
  } as never;
}

async function expectInvalidMetadata(
  promise: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected request parsing to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiErrorException);
    expect((error as ApiErrorException).getResponse()).toEqual({
      error: {
        code: TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        message,
      },
    });
  }
}
