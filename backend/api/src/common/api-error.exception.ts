import { HttpException, type HttpStatus } from "@nestjs/common";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

export class ApiErrorException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(
      {
        error: {
          code,
          message,
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        },
      } satisfies ApiErrorBody,
      status,
    );
  }
}
