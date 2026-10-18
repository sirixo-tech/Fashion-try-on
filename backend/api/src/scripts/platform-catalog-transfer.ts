import { createHash } from "node:crypto";
import { Prisma, type Product, type ProductCategory } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import {
  permissionsForPlatformRole,
  PLATFORM_PERMISSIONS,
} from "../platform/platform-permissions.js";
import type { ObjectStorage } from "../storage/object-storage.js";

type Database = Prisma.TransactionClient;
export type TransferDatabase = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "$executeRaw"
> & {
  $transaction<T>(
    callback: (tx: Database) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
      timeout?: number;
    },
  ): Promise<T>;
};
type Snapshot<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] };
type Target = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
};
export interface CatalogTransferPlan {
  version: 1;
  id: string;
  createdAt: string;
  railwayProjectId: string | null;
  railwayEnvironmentId: string | null;
  target: Target;
  destinationDigest: string;
  categories: Array<{
    before: Snapshot<ProductCategory>;
    slug: string;
    catalogKey: string;
  }>;
  products: Array<{
    before: Snapshot<Product>;
    slug: string;
    catalogKey: string;
    imageStorageKey: string | null;
  }>;
  references: { completedRuns: number; looks: number; activeKiosks: number };
  warnings: string[];
  hash: string;
}
export class CatalogTransferError extends Error {}
const imageLimit = 12 * 1024 * 1024;
const action = "PLATFORM_CATALOG_TRANSFERRED";

export function transferHash(value: Omit<CatalogTransferPlan, "hash">): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** DB READ ONLY is enforced by the caller's dry-run transaction. Never writes a permission registry. */
export async function buildCatalogTransferPlan(
  tx: Database,
  storeSlug: string,
  identity = { id: createSelfxId(), createdAt: new Date().toISOString() },
  env: NodeJS.ProcessEnv = process.env,
): Promise<CatalogTransferPlan> {
  const target = await tx.organization.findUnique({
    where: { slug: storeSlug },
    select: { id: true, name: true, slug: true, status: true, updatedAt: true },
  });
  if (!target || target.status !== "ACTIVE")
    fail("Destination must be an existing ACTIVE Store; check its exact slug.");
  const products = await tx.product.findMany({
    where: { scope: "PLATFORM_DEFAULT" },
    orderBy: { id: "asc" },
  });
  if (products.some((row) => row.organizationId !== null))
    fail(
      "A platform product has an unexpected tenant. No transfer is safe until this is reviewed.",
    );
  const ids = products.map((row) => row.id);
  const categories = await tx.productCategory.findMany({
    where: { id: { in: [...new Set(products.map((row) => row.categoryId))] } },
    orderBy: { id: "asc" },
  });
  if (
    categories.some(
      (row) => row.scope !== "PLATFORM_DEFAULT" || row.organizationId !== null,
    ) ||
    categories.length !== new Set(products.map((row) => row.categoryId)).size
  )
    fail("Platform product category ownership is inconsistent.");
  const sharedCategory = await tx.product.findFirst({
    where: {
      categoryId: { in: categories.map((row) => row.id) },
      id: { notIn: ids },
    },
    select: { id: true },
  });
  if (sharedCategory)
    fail("A source category also belongs to products outside this transfer.");
  const [
    mappings,
    stock,
    storefront,
    pending,
    completedRuns,
    looks,
    activeKiosks,
    destinationProducts,
    destinationCategories,
  ] = await Promise.all([
    tx.externalProductMapping.count({ where: { productId: { in: ids } } }),
    tx.productStockSettings.count({ where: { productId: { in: ids } } }),
    tx.shopifyStorefrontTryOnSession.count({
      where: { productId: { in: ids } },
    }),
    tx.kioskTryOnRun.count({
      where: {
        productId: { in: ids },
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    }),
    tx.kioskTryOnRun.count({
      where: { productId: { in: ids }, status: "COMPLETED" },
    }),
    tx.tryOnLook.count({ where: { productId: { in: ids } } }),
    tx.kioskDevice.count({ where: { status: "ACTIVE" } }),
    tx.product.findMany({
      where: {
        OR: [
          { organizationId: target.id },
          { catalogKey: { startsWith: `store:${target.id}:product:` } },
        ],
      },
      orderBy: { id: "asc" },
    }),
    tx.productCategory.findMany({
      where: {
        OR: [
          { organizationId: target.id },
          { catalogKey: { startsWith: `store:${target.id}:category:` } },
        ],
      },
      orderBy: { id: "asc" },
    }),
  ]);
  if (mappings || stock || storefront)
    fail(
      "A source product has integration, stock or storefront ownership links. Resolve these before moving it.",
    );
  if (pending)
    fail(
      "Source products have queued/processing Try-Ons. Let them finish before creating the plan.",
    );
  if (
    [...destinationProducts, ...destinationCategories].some(
      (row) => row.scope !== "STORE" || row.organizationId !== target.id,
    )
  )
    fail("Destination catalog keys have inconsistent ownership.");
  const categorySlugs = new Set(destinationCategories.map((row) => row.slug));
  const productSlugs = new Set(destinationProducts.map((row) => row.slug));
  const categoryPlans = categories.map((before) => {
    const slug = allocateSlug(
      before.slug,
      before.audience,
      before.id,
      categorySlugs,
      120,
    );
    return {
      before: snapshot(before),
      slug,
      catalogKey: `store:${target.id}:category:${slug}`,
    };
  });
  const productPlans = products.map((before) => {
    const slug = allocateSlug(
      before.slug,
      before.audience,
      before.id,
      productSlugs,
      160,
    );
    const source = before.imageStorageKey;
    if (
      source &&
      (!source.startsWith("catalog/") ||
        source.startsWith("catalog/stores/") ||
        source.split("/").includes(".."))
    )
      fail(`Product ${before.id} has an unexpected image ownership path.`);
    if (!source && !before.imageUrl)
      fail(`Product ${before.id} has no image reference.`);
    return {
      before: snapshot(before),
      slug,
      catalogKey: `store:${target.id}:product:${slug}`,
      imageStorageKey: source
        ? `catalog/stores/${target.id}/transfers/${identity.id}/${before.id}/image`
        : null,
    };
  });
  const value: Omit<CatalogTransferPlan, "hash"> = {
    version: 1,
    ...identity,
    railwayProjectId: env.RAILWAY_PROJECT_ID ?? null,
    railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID ?? null,
    target: { ...target, updatedAt: target.updatedAt.toISOString() },
    destinationDigest: createHash("sha256")
      .update(
        JSON.stringify({
          products: destinationProducts,
          categories: destinationCategories,
        }),
      )
      .digest("hex"),
    categories: categoryPlans,
    products: productPlans,
    references: { completedRuns, looks, activeKiosks },
    warnings: [
      "Moves every platform product, including inactive products, into this one Store; no other Store receives copies.",
      "Historical runs/looks/customer images, billing, plans, memberships and kiosk assignments are not transferred.",
      "No stock is invented. Configure stock and variant options separately before shopping.",
      "Other kiosks lose platform fallback products. Connected kiosks refresh; offline devices can display stale cached entries.",
      "Keep original image objects and the plan artifact. No storage objects are deleted by this script.",
      ...(products.some((row) => !row.imageStorageKey)
        ? [
            "URL-only image references are preserved without fetching them; verify their availability and permanence manually.",
          ]
        : []),
    ],
  };
  return { ...value, hash: transferHash(value) };
}

export async function inspectTransferImages(
  plan: CatalogTransferPlan,
  storage: Pick<ObjectStorage, "headObject">,
) {
  for (const product of plan.products) {
    if (!product.before.imageStorageKey) continue;
    try {
      const head = await storage.headObject(product.before.imageStorageKey);
      if (
        !Number.isSafeInteger(head.sizeBytes) ||
        head.sizeBytes < 1 ||
        head.sizeBytes > imageLimit
      )
        fail("Invalid image size.");
    } catch {
      fail(
        `Stored image for product ${product.before.id} is missing, inaccessible or exceeds 12 MiB.`,
      );
    }
  }
}

/** A repeatable-read, explicitly read-only preview, safe even with a production URL. */
export async function previewCatalogTransfer(
  db: TransferDatabase,
  slug: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return buildCatalogTransferPlan(tx, slug, undefined, env);
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}

export async function applyCatalogTransfer(input: {
  db: TransferDatabase;
  storage: Pick<ObjectStorage, "headObject" | "readObject" | "putObject">;
  plan: CatalogTransferPlan;
  expectedStoreId: string;
  expectedHash: string;
  actorEmail: string;
  writeBackup: (plan: CatalogTransferPlan) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}) {
  const { db, plan, storage } = input;
  const { hash, ...content } = plan;
  if (
    plan.version !== 1 ||
    hash !== transferHash(content) ||
    input.expectedHash !== hash ||
    input.expectedStoreId !== plan.target.id
  )
    fail(
      "Plan hash or confirmed Store ID does not match. Do not apply an edited plan.",
    );
  const alreadyApplied = async (tx: Database) =>
    tx.auditLog.findFirst({
      where: { resourceId: plan.id, action },
      select: { organizationId: true, metadata: true },
    });
  const verify = async (tx: Database) => {
    const actor = await requireActor(tx, input.actorEmail);
    const previous = await alreadyApplied(tx);
    if (previous) {
      if (
        previous.organizationId !== plan.target.id ||
        !previous.metadata ||
        typeof previous.metadata !== "object" ||
        Array.isArray(previous.metadata) ||
        previous.metadata.planHash !== hash
      )
        fail("Transfer ID conflicts with another completed operation.");
      return { actor, complete: true };
    }
    const fresh = await buildCatalogTransferPlan(
      tx,
      plan.target.slug,
      { id: plan.id, createdAt: plan.createdAt },
      input.env,
    );
    if (fresh.hash !== hash)
      fail(
        "Catalog, Store, usage references or Railway environment changed since preview. Generate and review a fresh plan.",
      );
    return { actor, complete: false };
  };
  const preflight = await db.$transaction(verify, {
    isolationLevel: "RepeatableRead",
    timeout: 30_000,
  });
  if (preflight.complete)
    return {
      status: "ALREADY_APPLIED" as const,
      products: plan.products.length,
      categories: plan.categories.length,
    };
  if (!plan.products.length)
    fail("The plan contains no platform products to transfer.");
  // Must complete before any DB or storage mutation. The original plan is also the inverse manifest.
  await input.writeBackup(plan);
  await inspectTransferImages(plan, storage);
  for (const item of plan.products) {
    if (!item.before.imageStorageKey || !item.imageStorageKey) continue;
    try {
      const body = await storage.readObject(
        item.before.imageStorageKey,
        imageLimit,
      );
      const image = validateTechnicalImageBuffer({
        buffer: body,
        declaredContentType: item.before.imageContentType,
        maxBytes: imageLimit,
      });
      await storage.putObject({
        key: item.imageStorageKey,
        contentType: image.mimeType,
        body,
      });
      const copy = await storage.readObject(item.imageStorageKey, imageLimit);
      if (
        createHash("sha256").update(copy).digest("hex") !==
        createHash("sha256").update(body).digest("hex")
      )
        fail("Image copy verification failed.");
    } catch {
      fail(
        `Image copy failed for product ${item.before.id}. No catalog ownership was changed; originals remain intact.`,
      );
    }
  }
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721103, 1)`;
      // Only the short ownership commit locks catalog writes; no network requests occur under this lock.
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`LOCK TABLE products, product_categories IN SHARE ROW EXCLUSIVE MODE`;
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${plan.target.id}::uuid FOR UPDATE`;
      const checked = await verify(tx);
      if (checked.complete)
        return {
          status: "ALREADY_APPLIED" as const,
          products: plan.products.length,
          categories: plan.categories.length,
        };
      for (const item of plan.categories)
        await tx.productCategory.update({
          where: { id: item.before.id },
          data: {
            scope: "STORE",
            organizationId: plan.target.id,
            slug: item.slug,
            catalogKey: item.catalogKey,
          },
        });
      for (const item of plan.products)
        await tx.product.update({
          where: { id: item.before.id },
          data: {
            scope: "STORE",
            organizationId: plan.target.id,
            slug: item.slug,
            catalogKey: item.catalogKey,
            ...(item.imageStorageKey
              ? { imageStorageKey: item.imageStorageKey, imageUrl: null }
              : {}),
          },
        });
      const refreshed = await tx.kioskDeviceConfiguration.updateMany({
        where: { kioskDevice: { status: "ACTIVE" } },
        data: { version: { increment: 1 }, updatedByUserId: checked.actor },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: checked.actor,
          organizationId: plan.target.id,
          action,
          resourceType: "PLATFORM_CATALOG_TRANSFER",
          resourceId: plan.id,
          metadata: {
            planHash: hash,
            productCount: plan.products.length,
            categoryCount: plan.categories.length,
            refreshedConfigurations: refreshed.count,
            inverseManifest: JSON.parse(
              JSON.stringify(plan),
            ) as Prisma.InputJsonObject,
          },
        },
      });
      return {
        status: "APPLIED" as const,
        products: plan.products.length,
        categories: plan.categories.length,
      };
    },
    { timeout: 30_000 },
  );
}

async function requireActor(tx: Database, email: string): Promise<string> {
  const user = await tx.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, status: true },
  });
  if (!user || user.status !== "ACTIVE")
    fail("Actor must be an ACTIVE platform user.");
  const assignments = await tx.platformRoleAssignment.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { role: true },
  });
  const granted = new Set<string>(
    assignments.flatMap((row) => permissionsForPlatformRole(row.role)),
  );
  const required = [
    PLATFORM_PERMISSIONS.permissionsManage,
    PLATFORM_PERMISSIONS.storesUpdate,
  ];
  for (const permission of required) {
    if (granted.has(permission)) continue;
    const dynamic = await tx.platformUserAccessRole.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
        role: {
          isActive: true,
          permissions: { some: { permission: { code: permission } } },
        },
      },
      select: { id: true },
    });
    if (!dynamic)
      fail(
        "Actor requires platform access-control and Store update permissions.",
      );
  }
  return user.id;
}

function snapshot<T>(value: T): Snapshot<T> {
  return JSON.parse(JSON.stringify(value)) as Snapshot<T>;
}
function allocateSlug(
  raw: string,
  audience: string | null,
  id: string,
  used: Set<string>,
  limit: number,
): string {
  const base =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product";
  const suffix = audience?.toLowerCase().replace(/[^a-z0-9-]/g, "") || "all";
  const candidates = [
    base.slice(0, limit),
    `${base.slice(0, limit - suffix.length - 1)}-${suffix}`,
    `${base.slice(0, limit - id.length - 1)}-${id}`,
  ];
  const slug = candidates.find((candidate) => !used.has(candidate));
  if (!slug) fail(`Cannot allocate an unambiguous destination slug for ${id}.`);
  used.add(slug);
  return slug;
}
function fail(message: string): never {
  throw new CatalogTransferError(message);
}
