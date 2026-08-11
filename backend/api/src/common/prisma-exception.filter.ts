import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type FastifyReply } from "fastify";

import { ApiErrorException } from "./api-error.exception.js";
import { COMMON_ERROR_CODES } from "./common-error-codes.js";

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const mapped = mapPrismaError(exception);
    response.status(mapped.getStatus()).send(mapped.getResponse());
  }
}

function mapPrismaError(
  exception:
    Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
): ApiErrorException {
  if (exception instanceof Prisma.PrismaClientValidationError) {
    return new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      COMMON_ERROR_CODES.invalidDatabaseInput,
      "Request contains invalid database input.",
    );
  }

  switch (exception.code) {
    case "P2002":
      return new ApiErrorException(
        HttpStatus.CONFLICT,
        COMMON_ERROR_CODES.resourceAlreadyExists,
        "Resource already exists.",
      );
    case "P2025":
      return new ApiErrorException(
        HttpStatus.NOT_FOUND,
        COMMON_ERROR_CODES.resourceNotFound,
        "Resource was not found.",
      );
    case "P2003":
    case "P2023":
      return new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        COMMON_ERROR_CODES.invalidDatabaseInput,
        "Request contains invalid database input.",
      );
    default:
      return new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        COMMON_ERROR_CODES.databaseRequestFailed,
        "Database request failed.",
      );
  }
}
