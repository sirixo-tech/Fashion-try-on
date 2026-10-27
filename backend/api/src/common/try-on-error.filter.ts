import { ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiErrorException, type ApiErrorBody } from "./api-error.exception.js";
import { publicTryOnErrorMessage } from "./public-try-on-errors.js";

@Catch(ApiErrorException)
export class TryOnErrorFilter implements ExceptionFilter<ApiErrorException> {
  catch(exception: ApiErrorException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const body = exception.getResponse() as ApiErrorBody;
    const isTryOn =
      /\/(?:try-on(?:s|-lab|-sessions)?|garment-extractions|garment-preview)(?:\/|\?|$)/.test(
        request.url,
      );
    const response = isTryOn
      ? {
          error: {
            ...body.error,
            message:
              publicTryOnErrorMessage(body.error.code, body.error.message) ??
              "SelfX could not complete this Try-On.",
          },
        }
      : body;
    if (exception.getStatus() === 429 && body.error.retryAfterSeconds) {
      reply.header("Retry-After", body.error.retryAfterSeconds);
    }
    reply.status(exception.getStatus()).send(response);
  }
}
