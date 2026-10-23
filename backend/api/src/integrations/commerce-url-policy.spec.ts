import { describe, expect, it } from "vitest";
import {
  publicAddress,
  publicCommerceUrl,
} from "../catalog/catalog-url-policy.js";
describe("Commerce URL boundary", () => {
  it("rejects private, metadata, mapped IPv6 and alternative loopback URL forms", () => {
    for (const url of [
      "http://localhost:8881/a",
      "http://127.0.0.1/a",
      "https://2130706433/a",
      "http://169.254.169.254/latest",
      "http://10.0.0.1/a",
      "http://172.16.1.1/a",
      "http://192.168.1.2/a",
      "http://[::ffff:127.0.0.1]/a",
      "https://user:pass@website.example/a",
      "file:///etc/passwd",
      "https://website.example:8881/a",
    ])
      expect(() => publicCommerceUrl(url)).toThrow();
  });
  it("accepts public website/image URLs without changing their source path", () => {
    expect(
      publicCommerceUrl("https://website.example/shop/product/10").href,
    ).toBe("https://website.example/shop/product/10");
  });
  it("rejects internal addresses returned by DNS and allows public unicast", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.2",
      "169.254.169.254",
      "100.64.0.1",
      "172.31.0.1",
      "192.168.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "2001:db8::1",
    ])
      expect(publicAddress(ip)).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
});
