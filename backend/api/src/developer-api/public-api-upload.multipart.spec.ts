import { describe, expect, it } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { parsePublicApiUploadMultipartRequest } from "./public-api-upload.multipart.js";

describe("parsePublicApiUploadMultipartRequest", () => {
  it("parses a validated Public API person image upload", async () => {
    const payload = await parsePublicApiUploadMultipartRequest(
      multipartRequest([
        field("purpose", "PERSON"),
        field("sessionId", "0198a9b3-d0bc-7000-8000-000000000001"),
        file("image", "person.png", "image/png", pngBuffer()),
      ]),
    );

    expect(payload).toMatchObject({
      purpose: "PERSON",
      sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
      image: {
        fieldName: "image",
        filename: "person.png",
        mimeType: "image/png",
        sizeBytes: 24,
        width: 320,
        height: 480,
      },
    });
    expect(payload.image.buffer).toBeInstanceOf(Buffer);
  });

  it("rejects uploads without multipart/form-data", async () => {
    await expect(
      parsePublicApiUploadMultipartRequest({
        isMultipart: () => false,
      } as never),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "PUBLIC_API_UPLOAD_MULTIPART_INVALID",
        },
      },
    });
  });

  it("rejects unsupported images before storage", async () => {
    await expect(
      parsePublicApiUploadMultipartRequest(
        multipartRequest([
          field("purpose", "GARMENT"),
          file(
            "image",
            "garment.txt",
            "text/plain",
            Buffer.from("not an image"),
          ),
        ]),
      ),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });

  it("accepts jewellery as an explicit upload purpose", async () => {
    const payload = await parsePublicApiUploadMultipartRequest(
      multipartRequest([
        field("purpose", "JEWELLERY"),
        field("sessionId", "0198a9b3-d0bc-7000-8000-000000000001"),
        file("image", "ring.png", "image/png", pngBuffer()),
      ]),
    );

    expect(payload).toMatchObject({
      purpose: "JEWELLERY",
      sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
    });
  });

  it("requires an explicit upload purpose", async () => {
    await expect(
      parsePublicApiUploadMultipartRequest(
        multipartRequest([
          file("image", "person.png", "image/png", pngBuffer()),
        ]),
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "PUBLIC_API_UPLOAD_MULTIPART_INVALID",
        },
      },
    });
  });
});

function multipartRequest(parts: unknown[]) {
  return {
    isMultipart: () => true,
    parts: async function* () {
      for (const part of parts) {
        yield part;
      }
    },
  } as never;
}

function field(fieldname: string, value: string) {
  return { type: "field", fieldname, value };
}

function file(
  fieldname: string,
  filename: string,
  mimetype: string,
  buffer: Buffer,
) {
  return {
    type: "file",
    fieldname,
    filename,
    mimetype,
    toBuffer: async () => buffer,
  };
}

function pngBuffer(): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(320, 16);
  buffer.writeUInt32BE(480, 20);
  return buffer;
}
