import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:http", () => ({ request: mocks.request }));
import { fetchPublicCatalogImage } from "./catalog-url-policy.js";

function response(
  statusCode: number,
  headers: Record<string, string>,
  chunks: Buffer[] = [],
) {
  mocks.request.mockImplementationOnce((_url, options, callback) => {
    const req = new EventEmitter() as EventEmitter & {
      end(): void;
      destroy(error?: Error): void;
    };
    req.destroy = (error) => {
      if (error) req.emit("error", error);
      req.emit("close");
    };
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
          resume(): void;
          destroy(error?: Error): void;
        };
        res.statusCode = statusCode;
        res.headers = headers;
        res.resume = () => req.emit("close");
        let destroyed = false;
        res.destroy = (error) => {
          destroyed = true;
          if (error) res.emit("error", error);
          req.emit("close");
        };
        callback(res);
        for (const chunk of chunks) if (!destroyed) res.emit("data", chunk);
        if (!destroyed) res.emit("end");
        req.emit("close");
      });
    // Both Node lookup call signatures must use the vetted address, never re-resolve.
    options.lookup(
      "shop.example",
      { all: true },
      (_error: unknown, addresses: unknown) =>
        expect(addresses).toEqual([{ address: "8.8.8.8", family: 4 }]),
    );
    options.lookup("shop.example", {}, (_error: unknown, address: unknown) =>
      expect(address).toBe("8.8.8.8"),
    );
    return req;
  });
}
afterEach(() => vi.resetAllMocks());
describe("bounded public catalog image fetching", () => {
  it("pins DNS and returns bounded image bytes", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    response(200, { "content-type": "image/png" }, [Buffer.from("image")]);
    expect(
      await fetchPublicCatalogImage("https://shop.example/image", 10),
    ).toEqual({ buffer: Buffer.from("image"), contentType: "image/png" });
  });
  it("rejects mixed public/private DNS without making an HTTP request", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      fetchPublicCatalogImage("https://shop.example/image", 10),
    ).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("revalidates redirects and blocks internal targets", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    response(302, { location: "http://169.254.169.254/latest" });
    await expect(
      fetchPublicCatalogImage("https://shop.example/image", 10),
    ).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("rejects streaming bytes above the bound even without Content-Length", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    response(200, {}, [Buffer.from("123456"), Buffer.from("78901")]);
    await expect(
      fetchPublicCatalogImage("https://shop.example/image", 10),
    ).rejects.toThrow("too large");
  });
});
