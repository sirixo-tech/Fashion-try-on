import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";

const url = process.env.WOOCOMMERCE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/woocommerce_catalog_test")
)
  throw new Error("Dedicated local test database required");
describe.skipIf(!url)(
  "safe historical Shopify uninstall recovery migration",
  () => {
    const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    beforeAll(() => db.$connect());
    afterAll(() => db.$disconnect());
    it("repairs only the last approved uninstalled Store, remains idempotent, and never grants access", async () => {
      const rollback = new Error("ROLLBACK_FIXTURES");
      await expect(
        db.$transaction(
          async (tx) => {
            const cases: { id: string; account: string; recover: boolean }[] =
              [];
            for (const [index, kind] of [
              "valid",
              "redacted",
              "suspended",
              "reassigned",
            ].entries()) {
              const store = createSelfxId(),
                id = createSelfxId(),
                account = `gid://shopify/Shop/${Date.now()}${index}`;
              const shop = `recover-${store}.myshopify.com`,
                now = new Date();
              await tx.organization.create({
                data: {
                  id: store,
                  name: "Recovery fixture",
                  slug: store,
                  status: kind === "suspended" ? "SUSPENDED" : "ACTIVE",
                },
              });
              await tx.integration.create({
                data: {
                  id,
                  organizationId: store,
                  type: "SHOPIFY",
                  status: "DISCONNECTED",
                  externalAccountId: null,
                  disconnectedAt: new Date(now.getTime() - 1000),
                  metadata:
                    kind === "redacted" ? { privacyStatus: "REDACTED" } : {},
                },
              });
              await tx.auditLog.createMany({
                data: [
                  {
                    id: createSelfxId(),
                    organizationId: store,
                    action: "SHOPIFY_LINK_SESSION_APPROVED",
                    resourceType: "integration",
                    resourceId: id,
                    createdAt: new Date(now.getTime() - 60000),
                    metadata: {
                      external_account_id: account,
                      shop_domain: shop,
                    },
                  },
                  {
                    id: createSelfxId(),
                    organizationId: store,
                    action: "SHOPIFY_APP_UNINSTALLED",
                    resourceType: "integration",
                    resourceId: id,
                    createdAt: now,
                  },
                  ...(kind === "reassigned"
                    ? [
                        {
                          id: createSelfxId(),
                          action: "SHOPIFY_LINK_SESSION_APPROVED",
                          resourceType: "integration",
                          createdAt: new Date(now.getTime() + 1000),
                          metadata: {
                            external_account_id: account,
                            shop_domain: shop,
                          },
                        },
                      ]
                    : []),
                ],
              });
              cases.push({ id, account, recover: kind === "valid" });
            }
            const migrationPath =
              "prisma/migrations/20261126020000_shopify_reinstall_recovery/migration.sql";
            const sql = readFileSync(
              [
                resolve("backend/database", migrationPath),
                resolve("../database", migrationPath),
              ].find(existsSync)!,
              "utf8",
            );
            const statements = sql
              .replace(/--[^\n]*/g, "")
              .split(";")
              .map((s) => s.trim())
              .filter((s) => s && !["BEGIN", "COMMIT"].includes(s));
            for (let attempt = 0; attempt < 2; attempt++)
              for (const statement of statements)
                await tx.$executeRawUnsafe(statement);
            for (const fixture of cases) {
              const record = await tx.integration.findUniqueOrThrow({
                where: { id: fixture.id },
              });
              expect(record.externalAccountId).toBe(
                fixture.recover ? fixture.account : null,
              );
              expect(record.status).toBe("DISCONNECTED");
              expect(
                await tx.integrationCredential.count({
                  where: { integrationId: fixture.id },
                }),
              ).toBe(0);
              expect(
                await tx.storeSubscription.count({
                  where: { organizationId: record.organizationId },
                }),
              ).toBe(0);
            }
            throw rollback;
          },
          { timeout: 20000 },
        ),
      ).rejects.toBe(rollback);
    });
  },
);
