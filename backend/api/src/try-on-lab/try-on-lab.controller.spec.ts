import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { AUTH_ERROR_CODES } from "../auth/auth.constants.js";
import type { AuthService } from "../auth/auth.service.js";
import type { TryOnLabService } from "./try-on-lab.service.js";
import { TryOnLabController } from "./try-on-lab.controller.js";

describe("TryOnLabController", () => {
  it("denies unauthenticated create requests", async () => {
    const controller = new TryOnLabController(
      {
        requireAccessUser: async () => {
          throw new ApiErrorException(
            401,
            AUTH_ERROR_CODES.accessTokenInvalid,
            "Access token is invalid or expired.",
          );
        },
      } as unknown as AuthService,
      {} as TryOnLabService,
    );

    await expect(controller.create(fakeRequest())).rejects.toMatchObject({
      response: {
        error: { code: AUTH_ERROR_CODES.accessTokenInvalid },
      },
    });
  });
});

function fakeRequest(): FastifyRequest {
  return {
    headers: {},
  } as FastifyRequest;
}
