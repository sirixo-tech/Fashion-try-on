import { HttpStatus } from "@nestjs/common";
import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";
import { ApiErrorException } from "./api-error.exception.js";
import { validateTechnicalImageBuffer } from "./image-validation.js";
import { TRY_ON_RESULT_MAX_IMAGE_BYTES } from "../try-on/try-on.constants.js";

// Lab and legacy kiosk responses use temporary inline images. Fetch remote
// adapter outputs on the server so browsers never receive vendor CDN URLs.
export async function inlineTryOnResult(image: string): Promise<string> {
  if (image.startsWith("data:image/")) return image;
  const signal = AbortSignal.timeout(15_000);
  try {
    let url = new URL(image);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (url.protocol !== "https:" || url.username || url.password) break;
      const response = await fetch(url, { redirect: "manual", signal });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) break;
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        break;
      }
      if (
        Number(response.headers.get("content-length")) >
        TRY_ON_RESULT_MAX_IMAGE_BYTES
      ) {
        await response.body.cancel();
        break;
      }
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > TRY_ON_RESULT_MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error("Result exceeds image limit");
        }
        chunks.push(Buffer.from(value));
      }
      const buffer = Buffer.concat(chunks, length);
      const metadata = validateTechnicalImageBuffer({
        buffer,
        maxBytes: TRY_ON_RESULT_MAX_IMAGE_BYTES,
      });
      return `data:${metadata.mimeType};base64,${buffer.toString("base64")}`;
    }
  } catch {
    // Do not include signed URLs or adapter errors in the client error.
  }
  throw new ApiErrorException(
    HttpStatus.BAD_GATEWAY,
    TRY_ON_LAB_ERROR_CODES.failed,
    "SelfX could not load this Try-On result. Please try again.",
  );
}
