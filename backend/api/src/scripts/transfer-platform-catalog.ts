import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadSelfxEnv } from "../config/load-env.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  applyCatalogTransfer,
  CatalogTransferError,
  inspectTransferImages,
  previewCatalogTransfer,
  transferHash,
  type CatalogTransferPlan,
} from "./platform-catalog-transfer.js";

const help = `Platform catalog → one real Store (all garments/jewellery, including inactive products).

Dry run (default; database read-only, image HEAD checks only):
  npm run catalog:transfer --workspace @selfx/api -- --dry-run --store-slug avinash-stores --out /tmp/catalog-plan.json

Apply the exact reviewed plan (requires an active platform operator and explicit Store ID/hash):
  npm run catalog:transfer --workspace @selfx/api -- --apply --plan /tmp/catalog-plan.json --store-id STORE_UUID --confirm-plan PLAN_HASH --actor-email YOUR_PLATFORM_LOGIN --backup /tmp/catalog-backup.json

Plan/backup files contain catalog records and image references; keep them private and download them before redeploying.
This command never deletes images, creates stock, reassigns kiosks, changes plans, or removes platform Products UI.
DATABASE_URL and object storage configuration come from the deployed API environment; never paste them into the command.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
    console.log(help);
    return;
  }
  const options = parseOptions(args);
  loadSelfxEnv();
  if (!process.env.DATABASE_URL)
    throw new CatalogTransferError(
      "DATABASE_URL must be configured in the selected API environment.",
    );
  const db = new PrismaClient();
  const storage = new ObjectStorageService();
  try {
    if (!options.apply) {
      const plan = await previewCatalogTransfer(db, options.storeSlug!);
      await inspectTransferImages(plan, storage);
      await writeArtifact(options.out!, plan);
      printPlan(plan);
      console.log(
        `READ ONLY: plan saved to ${resolve(options.out!)}. No database or storage objects were changed.`,
      );
      return;
    }
    const plan = await readPlan(options.plan!);
    const result = await applyCatalogTransfer({
      db,
      storage,
      plan,
      expectedStoreId: options.storeId!,
      expectedHash: options.confirmPlan!,
      actorEmail: options.actorEmail!,
      writeBackup: (value) => writeArtifact(options.backup!, value, true),
    });
    console.log(
      JSON.stringify(
        {
          ...result,
          transferId: plan.id,
          storeId: plan.target.id,
          planHash: plan.hash,
        },
        null,
        2,
      ),
    );
    console.log(
      "Verify Store products/images and kiosk catalog refresh. Platform Products retirement is a separate change.",
    );
  } finally {
    await db.$disconnect();
  }
}

function parseOptions(args: string[]) {
  const values: Record<string, string> = {};
  const names = new Set([
    "--store-slug",
    "--out",
    "--plan",
    "--store-id",
    "--confirm-plan",
    "--actor-email",
    "--backup",
  ]);
  let mode: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--dry-run" || arg === "--apply") {
      if (mode) throw new CatalogTransferError("Choose exactly one mode.");
      mode = arg;
      continue;
    }
    if (
      !names.has(arg) ||
      values[arg] !== undefined ||
      !args[index + 1] ||
      args[index + 1]!.startsWith("--")
    )
      throw new CatalogTransferError(
        "Unknown, duplicate or incomplete option. Run with --help.",
      );
    values[arg] = args[++index]!;
  }
  const apply = mode === "--apply";
  const required = apply
    ? ["--plan", "--store-id", "--confirm-plan", "--actor-email", "--backup"]
    : ["--store-slug", "--out"];
  if (
    required.some((name) => !values[name]?.trim()) ||
    Object.keys(values).some((name) => !required.includes(name))
  )
    throw new CatalogTransferError(
      "Missing or incompatible options. Run with --help.",
    );
  if (
    apply &&
    (!/^[a-f0-9-]{36}$/i.test(values["--store-id"]!) ||
      !/^[a-f0-9]{64}$/.test(values["--confirm-plan"]!))
  )
    throw new CatalogTransferError(
      "Copy the exact Store UUID and plan hash from the dry run.",
    );
  if (apply && resolve(values["--plan"]!) === resolve(values["--backup"]!))
    throw new CatalogTransferError(
      "Backup must have a different path from the reviewed plan.",
    );
  return {
    apply,
    storeSlug: values["--store-slug"],
    out: values["--out"],
    plan: values["--plan"],
    storeId: values["--store-id"],
    confirmPlan: values["--confirm-plan"],
    actorEmail: values["--actor-email"],
    backup: values["--backup"],
  };
}

async function readPlan(file: string): Promise<CatalogTransferPlan> {
  const value = JSON.parse(await readFile(file, "utf8")) as CatalogTransferPlan;
  if (
    !value ||
    value.version !== 1 ||
    typeof value.hash !== "string" ||
    !value.target ||
    typeof value.target.id !== "string" ||
    !Array.isArray(value.products) ||
    !Array.isArray(value.categories)
  )
    throw new CatalogTransferError("Invalid plan artifact.");
  const { hash, ...content } = value;
  if (hash !== transferHash(content))
    throw new CatalogTransferError(
      "The plan artifact was edited or corrupted. Generate a new dry run.",
    );
  return value;
}

async function writeArtifact(
  file: string,
  plan: CatalogTransferPlan,
  reuseIdentical = false,
) {
  try {
    await writeFile(file, `${JSON.stringify(plan, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (reuseIdentical && (error as NodeJS.ErrnoException).code === "EEXIST") {
      const previous = await readPlan(file);
      if (previous.hash === plan.hash) return;
    }
    throw new CatalogTransferError(
      "Could not write a private artifact: check the path and use a new filename if one already exists.",
    );
  }
}

function printPlan(plan: CatalogTransferPlan) {
  console.log(
    JSON.stringify(
      {
        transferId: plan.id,
        planHash: plan.hash,
        target: plan.target,
        products: plan.products.length,
        categories: plan.categories.length,
        garments: plan.products.filter(
          (item) => item.before.productVertical === "GARMENT",
        ).length,
        jewellery: plan.products.filter(
          (item) => item.before.productVertical === "JEWELLERY",
        ).length,
        storedImagesToCopy: plan.products.filter((item) => item.imageStorageKey)
          .length,
        slugChanges: [...plan.categories, ...plan.products]
          .filter((item) => item.slug !== item.before.slug)
          .map((item) => ({
            id: item.before.id,
            name: item.before.name,
            before: item.before.slug,
            after: item.slug,
          })),
        references: plan.references,
        warnings: plan.warnings,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof CatalogTransferError
      ? error.message
      : "Transfer command failed. Check database/storage/file access and the transfer audit record before retrying; credentials are not printed.",
  );
  process.exitCode = 1;
});
