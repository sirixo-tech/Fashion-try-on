export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ValidatedImageMetadata {
  mimeType: SupportedImageMimeType;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface ValidateImageBufferInput {
  buffer: Buffer;
  declaredContentType?: string | null;
  maxBytes: number;
}

export class TechnicalImageValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function validateTechnicalImageBuffer({
  buffer,
  declaredContentType,
  maxBytes,
}: ValidateImageBufferInput): ValidatedImageMetadata {
  if (buffer.length === 0) {
    throw new TechnicalImageValidationError(
      "IMAGE_EMPTY",
      "Uploaded image is empty.",
    );
  }
  if (buffer.length > maxBytes) {
    throw new TechnicalImageValidationError(
      "IMAGE_TOO_LARGE",
      "Uploaded image is too large.",
    );
  }

  const detected = detectImageMimeType(buffer);
  if (!detected) {
    throw new TechnicalImageValidationError(
      "IMAGE_TYPE_UNSUPPORTED",
      "Uploaded image type is not supported.",
    );
  }
  if (declaredContentType && declaredContentType !== detected) {
    throw new TechnicalImageValidationError(
      "IMAGE_TYPE_MISMATCH",
      "Uploaded image type does not match its content.",
    );
  }

  const dimensions = readImageDimensions(buffer, detected);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new TechnicalImageValidationError(
      "IMAGE_DECODE_FAILED",
      "Uploaded image could not be decoded.",
    );
  }

  return {
    mimeType: detected,
    sizeBytes: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function detectImageMimeType(
  buffer: Buffer,
): SupportedImageMimeType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function readImageDimensions(
  buffer: Buffer,
  mimeType: SupportedImageMimeType,
): { width: number; height: number } | null {
  switch (mimeType) {
    case "image/png":
      return readPngDimensions(buffer);
    case "image/jpeg":
      return readJpegDimensions(buffer);
    case "image/webp":
      return readWebpDimensions(buffer);
  }
}

function readPngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) {
      return null;
    }

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function readWebpDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 30) {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}
