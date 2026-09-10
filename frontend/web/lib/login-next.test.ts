import { describe, expect, it } from "vitest";

import { safeLoginNextPath } from "@/lib/login-next";

describe("safeLoginNextPath", () => {
  it("preserves a local Shopify approval path and query", () => {
    expect(
      safeLoginNextPath(
        "/app/integrations/shopify/link?token=abcdefghijklmnopqrstuvwxyzABCDEFG1234567890_",
      ),
    ).toContain("/app/integrations/shopify/link?token=");
  });

  it("rejects protocol-relative and absolute redirects", () => {
    expect(safeLoginNextPath("//example.com/steal")).toBe("/app/dashboard");
    expect(safeLoginNextPath("https://example.com/steal")).toBe(
      "/app/dashboard",
    );
  });
});
