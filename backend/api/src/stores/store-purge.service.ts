import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
  HttpStatus,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  deletionError,
  hardDeleteAccount,
  hasPlatformIdentity,
  identitySnapshot,
  lockStore,
  requireSuperadmin,
} from "../platform/user-deletion.service.js";
import { IsISO8601, IsString, Length } from "class-validator";

export class PurgeStoreDto {
  @IsString() @Length(1, 200) confirmName!: string;
  @IsISO8601() updatedAt!: string;
}

// Only these application-owned resources participate. Schema FK metadata supplies
// dependency order, never arbitrary table/column names from an HTTP request.
const tables = [
  "organizations",
  "organization_memberships",
  "organization_applications",
  "organization_activation_requirements",
  "stores",
  "membership_store_scopes",
  "store_roles",
  "store_role_permissions",
  "store_membership_roles",
  "store_permission_grants",
  "product_categories",
  "products",
  "product_stock_settings",
  "product_variants",
  "store_tax_settings",
  "store_payment_settings",
  "store_payment_connections",
  "shopping_carts",
  "shopping_cart_items",
  "shopping_orders",
  "shopping_payment_attempts",
  "shopping_payment_events",
  "shopping_order_items",
  "shopping_checkout_requests",
  "impersonation_sessions",
  "kiosk_try_on_runs",
  "kiosk_customer_upload_sessions",
  "try_on_sessions",
  "try_on_assets",
  "try_on_looks",
  "integrations",
  "integration_provider_credentials",
  "integration_oauth_states",
  "shopify_link_sessions",
  "shopify_storefront_try_on_sessions",
  "integration_credentials",
  "integration_events",
  "external_product_mappings",
  "try_on_share_capabilities",
  "usage_events",
  "store_subscriptions",
  "store_billing_cycles",
  "billable_generations",
  "credit_ledger_entries",
  "api_keys",
  "api_rate_limit_buckets",
  "webhook_endpoints",
  "webhook_deliveries",
];
type ForeignKey = {
  child: string;
  parent: string;
  columns: string[];
  referenced: string[];
  nullable: boolean[];
};
type Column = { table_name: string; column_name: string };
const rowKey = (table: string) =>
  table === "shopping_checkout_requests"
    ? "order_id"
    : table === "shopping_cart_items"
      ? "cart_id"
      : table === "product_stock_settings"
        ? "product_id"
        : ["store_tax_settings", "store_payment_settings"].includes(table)
          ? "organization_id"
          : "id";
const quote = (value: string) => {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Unexpected schema identifier");
  return `"${value}"`;
};

@Injectable()
export class StorePurgeService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  private readonly log = new Logger(StorePurgeService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.cleanObjects(), 30000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async purge(actorId: string, storeId: string, input: PurgeStoreDto) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await requireSuperadmin(tx, actorId);
          // Prevent new links while selecting user identities and Store resources.
          await lockStore(tx, storeId);
          await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
          const store = await tx.organization.findUnique({
            where: { id: storeId },
            select: { id: true, name: true, slug: true, updatedAt: true },
          });
          if (!store)
            deletionError(
              "STORE_NOT_FOUND",
              "Store was not found.",
              HttpStatus.NOT_FOUND,
            );
          if (input.confirmName !== store!.name)
            deletionError(
              "STORE_DELETE_CONFIRMATION_REQUIRED",
              "Type the exact Store name to confirm.",
              HttpStatus.BAD_REQUEST,
            );
          if (input.updatedAt !== store!.updatedAt.toISOString())
            deletionError(
              "STORE_EDIT_CONFLICT",
              "Store changed. Refresh before deleting.",
            );
          const members = await tx.organizationMembership.findMany({
            where: { orgId: storeId },
            select: {
              userId: true,
              user: { select: { id: true, email: true, displayName: true } },
            },
          });
          // Physical devices remain platform fleet resources; immediately revoke
          // their credentials and clear tenant-derived configuration/assets.
          const devices = await tx.kioskDevice.findMany({
            where: { organizationId: storeId },
            select: { id: true },
          });
          const deviceIds = devices.map((d) => d.id);
          await tx.kioskDeviceSession.updateMany({
            where: { kioskDeviceId: { in: deviceIds }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          const configuredAssets =
            await tx.kioskDeviceConfigurationAsset.findMany({
              where: { configuration: { kioskDeviceId: { in: deviceIds } } },
              select: { objectKey: true },
            });
          await tx.deletedStoreObject.createMany({
            data: configuredAssets
              .filter((a) => a.objectKey)
              .map((a) => ({ storageKey: a.objectKey! })),
            skipDuplicates: true,
          });
          await tx.kioskDeviceConfigurationAsset.deleteMany({
            where: { configuration: { kioskDeviceId: { in: deviceIds } } },
          });
          await tx.kioskDeviceConfiguration.deleteMany({
            where: { kioskDeviceId: { in: deviceIds } },
          });
          await tx.kioskDevice.updateMany({
            where: { id: { in: deviceIds } },
            data: {
              assignmentScope: "PLATFORM",
              organizationId: null,
              storeId: null,
              status: "REVOKED",
            },
          });
          const counts = await this.deleteResources(tx, storeId, deviceIds);
          let deletedUsers = 0;
          const associatedUsers = [];
          for (const member of members) {
            const otherStores = await tx.organizationMembership.count({
              where: { userId: member.userId },
            });
            if (
              !otherStores &&
              !(await hasPlatformIdentity(tx, member.userId))
            ) {
              await hardDeleteAccount(tx, member.userId);
              deletedUsers++;
              associatedUsers.push(identitySnapshot(member.user));
            } else {
              associatedUsers.push({
                ...identitySnapshot(member.user),
                label: `${member.user.displayName || member.user.email} (Store link removed)`,
              });
            }
          }
          const snapshot = {
            id: store!.id,
            name: store!.name,
            slug: store!.slug,
          };
          // Retain old event details and attach Store context before SET NULL.
          await tx.$executeRaw`UPDATE audit_logs SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('deleted_store', ${JSON.stringify(snapshot)}::jsonb) WHERE organization_id = ${storeId}::uuid`;
          await tx.auditLog.create({
            data: {
              id: createSelfxId(),
              actorUserId: actorId,
              action: "STORE_PERMANENTLY_DELETED",
              resourceType: "store",
              resourceId: storeId,
              metadata: {
                deleted_store: snapshot,
                deleted_resources: counts,
                associated_users: associatedUsers,
                users_permanently_removed: deletedUsers,
                fleet_devices_unassigned: deviceIds.length,
              },
            },
          });
          // Root is deleted last; audit organization references become null.
          await tx.organization.delete({ where: { id: storeId } });
          return {
            id: storeId,
            deletedUsers,
            preservedUsers: members.length - deletedUsers,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 120000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2003"].includes(error.code)
      )
        deletionError(
          "STORE_DELETE_CONFLICT",
          "Store data changed or remains referenced. Refresh and retry; nothing was deleted.",
        );
      throw error;
    }
  }

  private async deleteResources(
    tx: Prisma.TransactionClient,
    storeId: string,
    deviceIds: string[],
  ) {
    const columns = await tx.$queryRaw<
      Column[]
    >`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY(${tables}::text[])`;
    const edges = await tx.$queryRaw<ForeignKey[]>`
      SELECT child.relname AS child, parent.relname AS parent,
        ARRAY_AGG(ca.attname ORDER BY ck.ordinality) AS columns,
        ARRAY_AGG(pa.attname ORDER BY ck.ordinality) AS referenced,
        ARRAY_AGG(NOT ca.attnotnull ORDER BY ck.ordinality) AS nullable
      FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
      JOIN pg_class parent ON parent.oid=fk.confrelid
      JOIN LATERAL unnest(fk.conkey) WITH ORDINALITY ck(attnum, ordinality) ON true
      JOIN LATERAL unnest(fk.confkey) WITH ORDINALITY pk(attnum, ordinality) ON pk.ordinality=ck.ordinality
      JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=ck.attnum JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=pk.attnum
      WHERE fk.contype='f' AND ns.nspname='public' AND child.relname = ANY(${tables}::text[]) AND parent.relname = ANY(${tables}::text[])
      GROUP BY fk.oid, child.relname, parent.relname`;
    await tx.$executeRawUnsafe(
      "CREATE TEMP TABLE selfx_store_purge (table_name TEXT, id UUID, PRIMARY KEY(table_name,id)) ON COMMIT DROP",
    );
    await tx.$executeRaw`INSERT INTO selfx_store_purge VALUES ('organizations', ${storeId}::uuid)`;
    for (const col of columns.filter(
      (c) => c.column_name === "organization_id",
    )) {
      await tx.$executeRawUnsafe(
        `INSERT INTO selfx_store_purge SELECT $1, ${quote(rowKey(col.table_name))} FROM ${quote(col.table_name)} WHERE organization_id=$2::uuid ON CONFLICT DO NOTHING`,
        col.table_name,
        storeId,
      );
    }
    // Upload sessions have no tenant column but belong to the Store's devices.
    if (deviceIds.length)
      await tx.$executeRaw`INSERT INTO selfx_store_purge SELECT 'kiosk_customer_upload_sessions', id FROM kiosk_customer_upload_sessions WHERE kiosk_device_id = ANY(${deviceIds}::uuid[]) ON CONFLICT DO NOTHING`;
    for (let pass = 0; pass <= tables.length; pass++) {
      let added = 0;
      for (const edge of edges) {
        const join = edge.columns
          .map((c, i) => `c.${quote(c)}=p.${quote(edge.referenced[i]!)}`)
          .join(" AND ");
        added += await tx.$executeRawUnsafe(
          `INSERT INTO selfx_store_purge SELECT $1,c.${quote(rowKey(edge.child))} FROM ${quote(edge.child)} c JOIN ${quote(edge.parent)} p ON ${join} JOIN selfx_store_purge s ON s.table_name=$2 AND s.id=p.${quote(rowKey(edge.parent))} ON CONFLICT DO NOTHING`,
          edge.child,
          edge.parent,
        );
      }
      if (!added) break;
      if (pass === tables.length)
        throw new Error("Store purge closure did not converge");
    }
    // Refuse unexpected cross-tenant references instead of deleting another Store.
    for (const col of columns.filter(
      (c) => c.column_name === "organization_id",
    )) {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT c.${quote(rowKey(col.table_name))} AS id FROM ${quote(col.table_name)} c JOIN selfx_store_purge s ON s.table_name=$1 AND s.id=c.${quote(rowKey(col.table_name))} WHERE c.organization_id IS NOT NULL AND c.organization_id<>$2::uuid LIMIT 1`,
        col.table_name,
        storeId,
      );
      if (rows.length)
        deletionError(
          "STORE_DELETE_CROSS_TENANT_REFERENCE",
          "Store data has a cross-Store reference. Deletion was cancelled.",
        );
    }
    const counts = await tx.$queryRaw<
      { table_name: string; total: number }[]
    >`SELECT table_name, COUNT(*)::int total FROM selfx_store_purge GROUP BY table_name`;
    // Queue files in the same transaction so cleanup survives API restarts.
    for (const col of columns.filter((c) =>
      ["storage_key", "image_storage_key", "object_key", "asset_key"].includes(
        c.column_name,
      ),
    )) {
      await tx.$executeRawUnsafe(
        `INSERT INTO deleted_store_objects(storage_key) SELECT DISTINCT c.${quote(col.column_name)} FROM ${quote(col.table_name)} c JOIN selfx_store_purge s ON s.table_name=$1 AND s.id=c.${quote(rowKey(col.table_name))} WHERE c.${quote(col.column_name)} IS NOT NULL ON CONFLICT DO NOTHING`,
        col.table_name,
      );
    }
    // Break only actual dependency cycles. Other nullable links can be required
    // by semantic checks (for example POSTPAID generation -> billing cycle).
    const reaches = (
      start: string,
      target: string,
      visited = new Set<string>(),
    ): boolean => {
      if (start === target) return true;
      if (visited.has(start)) return false;
      visited.add(start);
      return edges.some(
        (edge) => edge.child === start && reaches(edge.parent, target, visited),
      );
    };
    for (const edge of edges) {
      if (!reaches(edge.parent, edge.child)) continue;
      const nullable = edge.columns.filter(
        (c, i) =>
          edge.nullable[i] && !["organization_id", "store_id"].includes(c),
      );
      if (!nullable.length) continue;
      await tx.$executeRawUnsafe(
        `UPDATE ${quote(edge.child)} c SET ${nullable.map((c) => `${quote(c)}=NULL`).join(",")} WHERE c.${quote(rowKey(edge.child))} IN (SELECT id FROM selfx_store_purge WHERE table_name=$1)`,
        edge.child,
      );
    }
    // Delete dependency leaves first. Savepoints allow RESTRICT edges to decide
    // actual row order without disabling constraints or broad cascades.
    let pending = counts
      .filter((c) => c.table_name !== "organizations" && c.total)
      .map((c) => c.table_name);
    for (let pass = 0; pending.length && pass < tables.length; pass++) {
      let progress = false;
      const retry: string[] = [];
      for (const table of pending) {
        await tx.$executeRawUnsafe("SAVEPOINT store_delete_resource");
        try {
          await tx.$executeRawUnsafe(
            `DELETE FROM ${quote(table)} WHERE ${quote(rowKey(table))} IN (SELECT id FROM selfx_store_purge WHERE table_name=$1)`,
            table,
          );
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT store_delete_resource");
          progress = true;
        } catch (error) {
          await tx.$executeRawUnsafe(
            "ROLLBACK TO SAVEPOINT store_delete_resource",
          );
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT store_delete_resource");
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2010" ||
            !["23503", "23001"].includes(String(error.meta?.code))
          )
            throw error;
          retry.push(table);
        }
      }
      if (!progress)
        deletionError(
          "STORE_DELETE_REFERENCE_CONFLICT",
          "Store data still has dependent records. Nothing was deleted.",
        );
      pending = retry;
    }
    if (pending.length)
      deletionError(
        "STORE_DELETE_REFERENCE_CONFLICT",
        "Store data could not be deleted safely.",
      );
    return Object.fromEntries(counts.map((c) => [c.table_name, c.total]));
  }
  async cleanObjects() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const rows = await this.db.deletedStoreObject.findMany({
        where: { availableAt: { lte: new Date() } },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      for (const row of rows) {
        try {
          // Shared catalog objects must never be removed while referenced.
          const shared =
            (await this.db.product.count({
              where: { imageStorageKey: row.storageKey },
            })) ||
            (await this.db.tryOnAsset.count({
              where: { storageKey: row.storageKey },
            })) ||
            (await this.db.kioskDeviceConfigurationAsset.count({
              where: { objectKey: row.storageKey },
            })) ||
            (await this.db.kioskCustomerUploadSession.count({
              where: { assetKey: row.storageKey },
            }));
          if (!shared) await this.storage.deleteObject(row.storageKey);
          await this.db.deletedStoreObject.deleteMany({
            where: { storageKey: row.storageKey },
          });
        } catch {
          await this.db.deletedStoreObject.updateMany({
            where: { storageKey: row.storageKey },
            data: {
              attempts: { increment: 1 },
              availableAt: new Date(Date.now() + 300000),
            },
          });
        }
      }
    } catch {
      this.log.warn("Store object cleanup will be retried.");
    } finally {
      this.cleaning = false;
    }
  }
}
