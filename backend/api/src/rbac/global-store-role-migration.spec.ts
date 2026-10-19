import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const url = process.env.GLOBAL_ROLES_MIGRATION_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/global_roles_migration_test")
)
  throw new Error("Dedicated localhost migration test database required.");
describe.skipIf(!url)("Global Store role migration", () => {
  const sql = (input: string) =>
    execFileSync(
      process.env.PSQL_BIN ?? "psql",
      [url!, "-X", "-v", "ON_ERROR_STOP=1", "-tA"],
      { input, encoding: "utf8", windowsHide: true },
    );
  const migration = () =>
    readFileSync(
      resolve(
        "../database/prisma/migrations/20261019030000_global_store_role_permissions/migration.sql",
      ),
      "utf8",
    );
  const reset = () =>
    sql(
      "DROP TABLE global_store_role_permissions; DROP TABLE global_store_roles; DELETE FROM audit_logs WHERE action='GLOBAL_STORE_ROLES_INITIALIZED';",
    );
  it("uses common effective permissions across existing Stores, preserves empty maps and excludes Platform permissions", () => {
    sql("TRUNCATE organizations CASCADE;");
    reset();
    sql(`
      INSERT INTO organizations(id,name,slug,status,updated_at) VALUES
        ('019a0000-0000-7000-8000-000000000001','Migration A','global-role-migration-a','ACTIVE',NOW()),
        ('019a0000-0000-7000-8000-000000000002','Migration B','global-role-migration-b','ACTIVE',NOW());
      INSERT INTO store_roles(id,organization_id,system_code,name,is_system,is_active,updated_at)
      SELECT ('019a0000-0000-7000-8000-00000000000'||n)::uuid, o.id, code, code,true,true,NOW()
      FROM (VALUES (3, 'global-role-migration-a', 'staff'),(4,'global-role-migration-b','staff'),(5,'global-role-migration-a','store-admin'),(6,'global-role-migration-b','store-admin')) f(n,slug,code)
      JOIN organizations o ON o.slug=f.slug;
      INSERT INTO store_role_permissions(id,role_id,permission_id)
      SELECT gen_random_uuid(),r.id,p.id FROM store_roles r CROSS JOIN permissions p
      WHERE r.organization_id IN ('019a0000-0000-7000-8000-000000000001','019a0000-0000-7000-8000-000000000002')
      AND p.code IN ('stores.view','products.manage','PERMISSIONS_MANAGE');
      INSERT INTO store_permission_grants(id,store_tenant_id,permission_id)
      SELECT gen_random_uuid(),o.id,p.id FROM organizations o CROSS JOIN permissions p
      WHERE o.slug IN ('global-role-migration-a','global-role-migration-b') AND p.code IN ('stores.view','products.manage');
      DELETE FROM store_permission_grants WHERE store_tenant_id='019a0000-0000-7000-8000-000000000002'
      AND permission_id=(SELECT id FROM permissions WHERE code='products.manage');
    `);
    sql(migration());
    const query =
      "SELECT g.system_code||':'||p.code FROM global_store_role_permissions rp JOIN global_store_roles g ON g.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id ORDER BY 1;";
    expect(sql(query).trim().split(/\r?\n/)).toEqual([
      "staff:stores.view",
      "store-admin:stores.view",
    ]);
    expect(sql("SELECT count(*) FROM store_roles;").trim()).toBe("4");
    expect(sql("SELECT count(*) FROM store_role_permissions;").trim()).toBe(
      "12",
    );

    reset();
    sql(
      "DELETE FROM store_role_permissions WHERE role_id='019a0000-0000-7000-8000-000000000004';",
    );
    sql(migration());
    expect(sql(query).trim()).toBe("store-admin:stores.view");
    expect(sql("SELECT count(*) FROM global_store_roles;").trim()).toBe("2");
  });
});
