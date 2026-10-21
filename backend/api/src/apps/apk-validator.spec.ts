import { afterEach, describe, expect, it, vi } from "vitest";
import { ApkValidator, parseApkMetadata } from "./apk-validator.js";
const signer = "a".repeat(64);
const badging =
  "package: name='com.selfx.kiosk' versionCode='42' versionName='2.1.0'\nsdkVersion:'24'\nnative-code: 'arm64-v8a'\n";
const cert = `Signer #1 certificate SHA-256 digest: ${signer}\n`;
afterEach(() => vi.unstubAllEnvs());
it.skipIf(!process.env.SELFX_APK_TEST_FILE)(
  "verifies a real local APK using Android build tools",
  async () => {
    const metadata = await new ApkValidator().inspect(
      process.env.SELFX_APK_TEST_FILE!,
    );
    expect(metadata.packageName).toBe("com.selfx.kiosk");
    expect(metadata.versionCode).toBeGreaterThan(0);
    expect(metadata.signerSha256).toHaveLength(64);
  },
  90000,
);
describe("APK validation", () => {
  it("derives package/version/ABI from inspected metadata", () =>
    expect(
      parseApkMetadata(badging, cert, "com.selfx.kiosk", signer),
    ).toMatchObject({ versionCode: 42, architecture: "ARM64", minSdk: 24 }));
  it("recognizes a multi-architecture universal build", () =>
    expect(
      parseApkMetadata(
        badging.replace("'arm64-v8a'", "'armeabi-v7a' 'arm64-v8a' 'x86_64'"),
        cert,
        "com.selfx.kiosk",
        signer,
      ).architecture,
    ).toBe("UNIVERSAL"));
  it.each([
    [badging.replace("com.selfx.kiosk", "com.other.app"), cert],
    [badging, cert.replace(signer, "b".repeat(64))],
    [badging, cert + `Signer #2 certificate SHA-256 digest: ${signer}\n`],
    [badging + "application-debuggable\n", cert],
    [badging.replace("versionCode='42'", "versionCode='0'"), cert],
    [badging.replace("arm64-v8a", "unknown"), cert],
    [badging.replace("package:", "package: split='feature'"), cert],
  ])("rejects incompatible or untrusted metadata", (metadata, certificates) =>
    expect(() =>
      parseApkMetadata(metadata, certificates, "com.selfx.kiosk", signer),
    ).toThrow(),
  );
  it("fails closed without a configured trusted certificate/tools", () => {
    vi.stubEnv("SELFX_APK_AAPT_PATH", "");
    expect(() => new ApkValidator().configuration()).toThrow();
  });
});
