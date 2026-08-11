import {
  type ArgumentMetadata,
  HttpStatus,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

import { ApiErrorException } from "./api-error.exception.js";
import { COMMON_ERROR_CODES } from "./common-error-codes.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SelfxUuidParamPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (typeof value === "string" && UUID_PATTERN.test(value)) {
      return value;
    }

    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      COMMON_ERROR_CODES.invalidUuidPathParameter,
      `${metadata.data ?? "id"} must be a valid UUID.`,
    );
  }
}
