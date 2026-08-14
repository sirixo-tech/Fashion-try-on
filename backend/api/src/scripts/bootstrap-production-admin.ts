import { PrismaClient } from "@prisma/client";

import { PasswordService } from "../auth/password.service.js";
import { loadSelfxEnv } from "../config/load-env.js";
import {
  bootstrapProductionAdmin,
  formatProductionAdminBootstrapResult,
  ProductionAdminBootstrapError,
} from "./production-admin-bootstrap.js";

loadSelfxEnv();

async function main() {
  const prisma = new PrismaClient();
  const passwords = new PasswordService();

  try {
    const result = await bootstrapProductionAdmin({
      env: process.env,
      db: prisma,
      passwords,
    });
    console.log(formatProductionAdminBootstrapResult(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ProductionAdminBootstrapError) {
    console.error(error.message);
  } else {
    console.error("Production admin bootstrap failed.");
  }
  process.exitCode = 1;
});
