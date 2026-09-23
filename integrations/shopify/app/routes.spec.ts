import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Shopify app routes", () => {
  it("registers the storefront app proxy launch route", async () => {
    globalThis.__reactRouterAppDirectory = path.resolve("app");
    const { default: routes } = await import("./routes");
    const resolvedRoutes = await routes;
    const launchRoutes = resolvedRoutes.filter(
      (entry) => entry.path === "apps/selfx-tryon/launch",
    );

    expect(launchRoutes).toHaveLength(1);
    expect(launchRoutes[0]).toMatchObject({
      file: "routes/apps.selfx-tryon.launch.tsx",
      id: "routes/apps.selfx-tryon.launch",
    });
  });
});
