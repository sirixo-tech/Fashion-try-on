export const TRY_ON_LAB_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const TRY_ON_LAB_MULTIPART_LIMITS = {
  files: 2,
  fileSize: TRY_ON_LAB_MAX_IMAGE_BYTES,
  fields: 18,
  parts: 20,
} as const;
export const TRY_ON_LAB_MAX_RUNS = 100;
export const TRY_ON_LAB_RUN_TTL_MS = 60 * 60 * 1000;
