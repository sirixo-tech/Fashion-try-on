import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import { ApiErrorException } from "../common/api-error.exception.js";

const run = promisify(execFile);
export type ReleaseApp = "KIOSK" | "CUSTOMER";
export function releasePackage(app: ReleaseApp) {
  return app === "CUSTOMER"
    ? process.env.SELFX_CUSTOMER_APK_PACKAGE_NAME || "com.selfx.selfx_customer"
    : process.env.SELFX_APK_PACKAGE_NAME || "com.selfx.kiosk";
}
export function parseApkMetadata(
  badging: string,
  certificates: string,
  expectedPackage: string,
  trustedSigner: string,
) {
  const packageLine = /^package:.*$/m.exec(badging)?.[0] ?? "";
  const name = /\bname='([^']+)'/.exec(packageLine)?.[1];
  const versionName = /\bversionName='([^']+)'/.exec(packageLine)?.[1];
  const versionCode = Number(/\bversionCode='(\d+)'/.exec(packageLine)?.[1]);
  const minSdk = Number(/^sdkVersion:'(\d+)'/m.exec(badging)?.[1]);
  const abis = [
    ...(/^native-code: (.+)$/m.exec(badging)?.[1] ?? "").matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);
  const signerDigests = [
    ...certificates.matchAll(
      /^Signer #\d+ certificate SHA-256 digest: ([a-f0-9:]+)\s*$/gim,
    ),
  ].map((m) => m[1]!.replaceAll(":", "").toLowerCase());
  if (
    name !== expectedPackage ||
    !versionName ||
    versionName.length > 120 ||
    !Number.isSafeInteger(versionCode) ||
    versionCode <= 0 ||
    versionCode > 2147483647 ||
    !minSdk ||
    abis.length === 0 ||
    abis.some(
      (abi) => !["armeabi-v7a", "arm64-v8a", "x86_64"].includes(abi!),
    ) ||
    signerDigests.length !== 1 ||
    signerDigests[0] !== trustedSigner.toLowerCase() ||
    /^application-debuggable/m.test(badging) ||
    /\bsplit='/.test(packageLine)
  ) {
    throw new ApiErrorException(
      400,
      "APK_VALIDATION_FAILED",
      "Upload a standalone SelfX release APK signed by the configured certificate for this app.",
    );
  }
  const architecture =
    abis.length > 1
      ? "UNIVERSAL"
      : (
          {
            "armeabi-v7a": "ARM32",
            "arm64-v8a": "ARM64",
            x86_64: "X86_64",
          } as Record<string, string>
        )[abis[0]!]!;
  return {
    packageName: name,
    versionName,
    versionCode,
    architecture,
    minSdk,
    signerSha256: signerDigests[0]!,
  };
}

@Injectable()
export class ApkValidator {
  configuration(app: ReleaseApp = "KIOSK") {
    const aapt = process.env.SELFX_APK_AAPT_PATH;
    const jar = process.env.SELFX_APK_SIGNER_JAR_PATH;
    const signer = (
      app === "CUSTOMER"
        ? process.env.SELFX_CUSTOMER_APK_SIGNER_SHA256
        : process.env.SELFX_APK_SIGNER_SHA256
    )
      ?.replaceAll(":", "")
      .toLowerCase();
    if (!aapt || !jar || !signer || !/^[a-f0-9]{64}$/.test(signer))
      throw new ApiErrorException(
        503,
        "APK_VALIDATOR_NOT_CONFIGURED",
        "Configure the APK inspection tools and trusted release certificate before uploading.",
      );
    return {
      aapt,
      jar,
      signer,
      java: process.env.SELFX_APK_JAVA_PATH || "java",
      packageName: releasePackage(app),
    };
  }
  async inspect(path: string, app: ReleaseApp = "KIOSK") {
    const config = this.configuration(app);
    try {
      const options = {
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      };
      const badging = await run(
        config.aapt,
        ["dump", "badging", path],
        options,
      );
      const certificates = await run(
        config.java,
        ["-jar", config.jar, "verify", "--print-certs", path],
        options,
      );
      return parseApkMetadata(
        badging.stdout,
        certificates.stdout,
        config.packageName,
        config.signer,
      );
    } catch (error) {
      if (error instanceof ApiErrorException) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        throw new ApiErrorException(
          503,
          "APK_VALIDATOR_UNAVAILABLE",
          "APK validation tools are unavailable on this API instance.",
        );
      throw new ApiErrorException(
        400,
        "APK_VALIDATION_FAILED",
        "The APK is invalid, unsigned, corrupted or could not be verified.",
      );
    }
  }
}
