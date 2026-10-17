import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadSelfxEnv } from "../config/load-env.js";
import {
  applyStoreOnlyAccount,
  previewStoreOnlyAccount,
  StoreOnlyAccountError,
  validateAccountPlan,
  type StoreOnlyPlan,
} from "./store-only-account.js";

const help = `Remove platform authority while preserving an existing Store Owner membership.
This explicit maintenance command is never run on startup or through normal role APIs.

Preview (default; database READ ONLY):
  npm run account:store-only --workspace @selfx/api -- --dry-run --target-email avinashnaidu9989@gmail.com --remaining-admin-email super-admin@selfx.local --store-slug avinash-stores --out /tmp/avinash-account-plan.json

Apply the reviewed preview:
  npm run account:store-only --workspace @selfx/api -- --apply --plan /tmp/avinash-account-plan.json --confirm-plan HASH_FROM_PREVIEW --user-id TARGET_UUID --store-id STORE_UUID --backup /tmp/avinash-account-before.json

Use the selected Railway API shell with its existing DATABASE_URL. Never paste credentials.
The remaining admin email validates existing authority and audit attribution; it is not CLI authentication.
Database access is the authority to execute this maintenance operation. Verify the other admin can sign in first.
Keep private artifacts outside source control and copy them off the container before redeploying.
`;

export function parseAccountOptions(args: string[]) {
  const values: Record<string, string> = {};
  const names = new Set([
    "--target-email",
    "--remaining-admin-email",
    "--store-slug",
    "--out",
    "--plan",
    "--confirm-plan",
    "--user-id",
    "--store-id",
    "--backup",
  ]);
  let mode: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run" || arg === "--apply") {
      if (mode) throw new StoreOnlyAccountError("Choose exactly one mode.");
      mode = arg;
    } else {
      if (
        !names.has(arg) ||
        values[arg] !== undefined ||
        !args[i + 1] ||
        args[i + 1]!.startsWith("--")
      )
        throw new StoreOnlyAccountError(
          "Unknown, duplicate or incomplete option. Run --help.",
        );
      values[arg] = args[++i]!;
    }
  }
  const apply = mode === "--apply";
  const required = apply
    ? ["--plan", "--confirm-plan", "--user-id", "--store-id", "--backup"]
    : ["--target-email", "--remaining-admin-email", "--store-slug", "--out"];
  if (
    required.some((key) => !values[key]?.trim()) ||
    Object.keys(values).some((key) => !required.includes(key))
  )
    throw new StoreOnlyAccountError(
      "Missing or incompatible options. Run --help.",
    );
  if (
    apply &&
    (resolve(values["--plan"]!) === resolve(values["--backup"]!) ||
      !/^[a-f0-9]{64}$/.test(values["--confirm-plan"]!) ||
      ["--user-id", "--store-id"].some(
        (key) =>
          !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(values[key]!),
      ))
  )
    throw new StoreOnlyAccountError(
      "Use distinct plan/backup paths and the exact hash/user/Store UUIDs from preview.",
    );
  return { apply, values };
}

async function writePrivate(file: string, plan: StoreOnlyPlan, reuse = false) {
  const content = `${JSON.stringify(plan, null, 2)}\n`;
  try {
    await writeFile(file, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (
      reuse &&
      (error as NodeJS.ErrnoException).code === "EEXIST" &&
      (await readFile(file, "utf8")) === content
    )
      return;
    throw new StoreOnlyAccountError(
      "Cannot save private artifact. Check access and use a new filename.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
    console.log(help);
    return;
  }
  const { apply, values: v } = parseAccountOptions(args);
  loadSelfxEnv();
  if (!process.env.DATABASE_URL)
    throw new StoreOnlyAccountError(
      "DATABASE_URL must exist in the selected API environment.",
    );
  const db = new PrismaClient();
  try {
    if (!apply) {
      const plan = await previewStoreOnlyAccount(db, {
        targetEmail: v["--target-email"]!,
        remainingAdminEmail: v["--remaining-admin-email"]!,
        storeSlug: v["--store-slug"]!,
      });
      await writePrivate(v["--out"]!, plan);
      console.log(
        JSON.stringify(
          {
            operationId: plan.id,
            planHash: plan.hash,
            target: plan.target,
            remainingAdmin: plan.remainingAdmin,
            store: plan.store,
            preservedMembership: {
              id: plan.membership.id,
              role: plan.membership.role,
              status: plan.membership.status,
            },
            preservedStorePermissions: plan.storePermissions,
            staticRolesToRevoke: plan.staticRoles.map((r) => r.role),
            customRoleIdsToRevoke: plan.customRoles.map((r) => r.roleId),
          },
          null,
          2,
        ),
      );
      console.log(
        "READ ONLY: preview saved. No production account has been changed. Review before applying.",
      );
      return;
    }
    const plan = JSON.parse(
      await readFile(v["--plan"]!, "utf8"),
    ) as StoreOnlyPlan;
    validateAccountPlan(plan, v["--confirm-plan"]!);
    const result = await applyStoreOnlyAccount({
      db,
      plan,
      expectedHash: v["--confirm-plan"]!,
      expectedUserId: v["--user-id"]!,
      expectedStoreId: v["--store-id"]!,
      writeBackup: (value) => writePrivate(v["--backup"]!, value, true),
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(
      "Sign out, then sign in again without an old ?next= platform URL. Verify Store dashboard/products and the other Superadmin login.",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof StoreOnlyAccountError
      ? error.message
      : "Account command failed. Check database/file access and the maintenance audit record before retrying. Secrets are not printed.",
  );
  process.exitCode = 1;
});
