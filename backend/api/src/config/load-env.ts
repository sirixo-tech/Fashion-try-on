import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

export function loadSelfxEnv(): void {
  const rootEnv = resolve(process.cwd(), "../../.env");
  if (existsSync(rootEnv)) {
    config({ path: rootEnv });
  }

  const workspaceEnv = resolve(process.cwd(), ".env");
  if (existsSync(workspaceEnv)) {
    config({ path: workspaceEnv, override: false });
  }
}
