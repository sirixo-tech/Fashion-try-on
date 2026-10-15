import { HttpStatus } from "@nestjs/common";
import { ApiErrorException } from "../common/api-error.exception.js";

export function paymentCallbackOrigin() {
  try {
    const url = new URL(process.env.SELFX_PAYMENT_CALLBACK_BASE_URL ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      "PAYMENT_CALLBACK_UNCONFIGURED",
      "SelfX must configure a secure payment callback address before testing.",
    );
  }
}
