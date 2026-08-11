import { HttpException, type HttpStatus } from "@nestjs/common";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class ApiErrorException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ error: { code, message } } satisfies ApiErrorBody, status);
  }
}
