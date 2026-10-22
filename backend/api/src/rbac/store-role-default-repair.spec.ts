import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const url = process.env.STORE_ROLE_REPAIR_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/store_role_repair_test")
)
  throw new Error(
    "Dedicated localhost Store role repair test database required.",
  );

describe.skipIf(!url)("Store role default repair migration", () => {
  const migration = readFileSync(
    resolve(
      "../database/prisma/migrations/20261022000000_repair_store_role_defaults/migration.sql",
    ),
    "utf8",
  )
    .replace(/^BEGIN;$/m, "")
    .replace(/^COMMIT;$/m, "");
  const setup = `
    DELETE FROM audit_logs WHERE action IN ('GLOBAL_STORE_ROLE_PERMISSIONS_UPDATED',
      'GLOBAL_STORE_ROLE_DEFAULTS_REPAIRED','GLOBAL_STORE_ROLES_INITIALIZED');
    DELETE FROM global_store_role_permissions;
    UPDATE global_store_roles SET created_at='2000-01-01',updated_at='2000-01-01';
    INSERT INTO audit_logs(id,action,resource_type,metadata_json)
      VALUES(gen_random_uuid(),'GLOBAL_STORE_ROLES_INITIALIZED','global_store_role',
      '{"initialization":"intersection_of_existing_role_maps"}');
  `;
  const snapshot = `SELECT json_build_object(
    'roles',(SELECT json_object_agg(g.system_code,COALESCE((SELECT json_agg(p.code ORDER BY p.code)
      FROM global_store_role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=g.id),'[]'::json)) FROM global_store_roles g),
    'audits',(SELECT count(*) FROM audit_logs WHERE action='GLOBAL_STORE_ROLE_DEFAULTS_REPAIRED')
  );`;
  function run(before = "", after = "") {
    const psqlUrl = new URL(url!);
    psqlUrl.searchParams.delete("schema");
    const output = execFileSync(
      process.env.PSQL_BIN ?? "psql",
      [psqlUrl.toString(), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-tA"],
      {
        input: `BEGIN; ${setup} ${before} ${migration} ${after} ${snapshot} ROLLBACK;`,
        encoding: "utf8",
        windowsHide: true,
      },
    );
    return JSON.parse(
      output.split(/\r?\n/).find((line) => line.startsWith("{"))!,
    ) as {
      roles: Record<string, string[]>;
      audits: number;
    };
  }

  it("repairs empty/partial untouched maps with Store defaults and excludes Platform access", () => {
    const result =
      run(`INSERT INTO global_store_role_permissions(id,role_id,permission_id)
      SELECT gen_random_uuid(),g.id,p.id FROM global_store_roles g CROSS JOIN permissions p
      WHERE g.system_code='store-admin' AND p.code='stores.view';`);
    expect(result.roles["store-admin"]).toHaveLength(19);
    expect(result.roles.staff).toEqual([
      "analytics.view",
      "kiosks.configure",
      "kiosks.update",
      "kiosks.view",
      "products.manage",
      "stores.view",
      "tryon.garment_preview",
    ]);
    expect(result.roles["store-admin"]).toContain("products.manage");
    expect(result.roles["store-admin"]).toContain("integrations.manage");
    for (const codes of Object.values(result.roles)) {
      expect(codes).not.toContain("developer_api.view");
      expect(codes).not.toContain("PERMISSIONS_MANAGE");
      expect(codes).not.toContain("STORE_ROLES_MANAGE");
    }
    expect(result.audits).toBe(2);
  });

  it("preserves deliberately empty or partial saved maps using audit history", () => {
    const result =
      run(`INSERT INTO audit_logs(id,action,resource_type,resource_id)
      SELECT gen_random_uuid(),'GLOBAL_STORE_ROLE_PERMISSIONS_UPDATED','global_store_role',id
      FROM global_store_roles;
      INSERT INTO global_store_role_permissions(id,role_id,permission_id)
      SELECT gen_random_uuid(),g.id,p.id FROM global_store_roles g CROSS JOIN permissions p
      WHERE g.system_code='store-admin' AND p.code='stores.view';`);
    expect(result.roles).toEqual({ "store-admin": ["stores.view"], staff: [] });
    expect(result.audits).toBe(0);
  });

  it("preserves maps with modified timestamps even if their audit history is unavailable", () => {
    const result = run(
      "UPDATE global_store_roles SET updated_at='2000-01-02';",
    );
    expect(result.roles).toEqual({ "store-admin": [], staff: [] });
    expect(result.audits).toBe(0);
  });

  it("does not refill a later revocation when the repair SQL is replayed", () => {
    const result = run(
      "",
      `DELETE FROM global_store_role_permissions;
      DROP TABLE selfx_roles_to_repair; ${migration}`,
    );
    expect(result.roles).toEqual({ "store-admin": [], staff: [] });
    expect(result.audits).toBe(2);
  });
});
