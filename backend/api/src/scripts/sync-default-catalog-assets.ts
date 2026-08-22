import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import {
  type SupportedImageMimeType,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../try-on-lab/try-on-lab.constants.js";

type CatalogAudience = "MEN" | "WOMEN" | "UNISEX";
type GarmentIntent = "AUTO" | "TOP" | "BOTTOM" | "ONE_PIECE" | "FULL_OUTFIT";
type GarmentCategory = "AUTO" | "TOP" | "BOTTOM" | "ONE_PIECE";

interface DefaultCatalogAsset {
  catalogKey: string;
  name: string;
  audience: CatalogAudience;
  categorySlug: string;
  garmentIntent: GarmentIntent;
  garmentCategory: GarmentCategory;
  garmentPhotoType: string;
  contentType: SupportedImageMimeType;
  localPath: string;
  storageKey: string;
}

interface DefaultCatalogAssetManifest {
  version: number;
  assets: DefaultCatalogAsset[];
}

const scriptDir = __dirname;
const repoRoot = resolve(scriptDir, "../../../..");
const defaultManifestPath = resolve(
  repoRoot,
  "catalog/defaults/default-catalog-assets.json",
);

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const manifestPath = resolve(repoRoot, options.manifestPath);
  const manifest = await readManifest(manifestPath);
  validateManifest(manifest);

  const missing: DefaultCatalogAsset[] = [];
  const ready: Array<{ asset: DefaultCatalogAsset; buffer: Buffer }> = [];

  for (const asset of manifest.assets) {
    const absolutePath = resolve(repoRoot, asset.localPath);
    if (!existsSync(absolutePath)) {
      missing.push(asset);
      continue;
    }

    const buffer = await readFile(absolutePath);
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType: asset.contentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    if (
      metadata.mimeType !== "image/png" ||
      asset.contentType !== "image/png"
    ) {
      throw new Error(
        `${asset.localPath} must be a PNG because seed-catalog.ts stores image/png.`,
      );
    }
    ready.push({ asset, buffer });
  }

  if (missing.length > 0) {
    printMissing(missing);
    process.exitCode = 1;
    return;
  }

  if (options.dryRun) {
    for (const { asset } of ready) {
      console.log(`[dry-run] ${asset.localPath} -> ${asset.storageKey}`);
    }
    return;
  }

  const storage = new ObjectStorageService();
  for (const { asset, buffer } of ready) {
    await storage.putObject({
      key: asset.storageKey,
      contentType: asset.contentType,
      body: buffer,
    });
    console.log(`${asset.localPath} -> ${asset.storageKey}`);
  }
}

function parseOptions(args: string[]): {
  dryRun: boolean;
  manifestPath: string;
} {
  let manifestPath = defaultManifestPath;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run" || arg === "--check") {
      dryRun = true;
      continue;
    }
    if (arg === "--manifest") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--manifest requires a file path.");
      }
      manifestPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return { dryRun, manifestPath };
}

async function readManifest(
  manifestPath: string,
): Promise<DefaultCatalogAssetManifest> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { assets?: unknown }).assets)
  ) {
    throw new Error("Default catalog asset manifest is invalid.");
  }
  return parsed as DefaultCatalogAssetManifest;
}

function validateManifest(manifest: DefaultCatalogAssetManifest): void {
  const catalogKeys = new Set<string>();
  const localPaths = new Set<string>();
  const storageKeys = new Set<string>();

  for (const asset of manifest.assets) {
    requireNonEmpty(asset.catalogKey, "catalogKey");
    requireNonEmpty(asset.name, "name");
    requireNonEmpty(asset.categorySlug, "categorySlug");
    requireNonEmpty(asset.localPath, "localPath");
    requireNonEmpty(asset.storageKey, "storageKey");
    if (asset.contentType !== "image/png") {
      throw new Error(`${asset.catalogKey} must use image/png.`);
    }
    addUnique(catalogKeys, asset.catalogKey, "catalogKey");
    addUnique(localPaths, asset.localPath, "localPath");
    addUnique(storageKeys, asset.storageKey, "storageKey");
  }
}

function printMissing(missing: DefaultCatalogAsset[]): void {
  console.error("Missing default catalog garment image files:");
  for (const asset of missing) {
    console.error(
      `- ${asset.name} (${asset.catalogKey}) -> ${asset.localPath}`,
    );
  }
}

function requireNonEmpty(value: string, fieldName: string): void {
  if (!value || value.trim() === "") {
    throw new Error(`Manifest field ${fieldName} is required.`);
  }
}

function addUnique(
  values: Set<string>,
  value: string,
  fieldName: string,
): void {
  if (values.has(value)) {
    throw new Error(`Duplicate manifest ${fieldName}: ${value}`);
  }
  values.add(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
