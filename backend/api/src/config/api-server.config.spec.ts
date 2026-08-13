import { describe, expect, it } from "vitest";

import { loadApiServerConfig } from "./api-server.config.js";

describe("loadApiServerConfig", () => {
  it("uses Railway PORT before API_PORT", () => {
    expect(loadApiServerConfig({ PORT: "8080", API_PORT: "3001" }).port).toBe(
      8080,
    );
  });

  it("uses API_PORT when PORT is not provided", () => {
    expect(loadApiServerConfig({ API_PORT: "3002" }).port).toBe(3002);
  });

  it("falls back to local development port", () => {
    expect(loadApiServerConfig({}).port).toBe(3001);
  });

  it("rejects invalid port values", () => {
    expect(() => loadApiServerConfig({ PORT: "not-a-port" })).toThrow(
      "PORT must be an integer between 1 and 65535",
    );
  });
});
