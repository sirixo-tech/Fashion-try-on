import { getCurrentPlatformAccess } from "./access-control";
import { getCurrentMerchantStoreAccess } from "./current-store";
import { canReturnToAppPath, navigationAccess } from "./navigation-access";
import type { AuthTokenResponse } from "./session";

export function safeLoginNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/app/dashboard";
  }
  try {
    const url = new URL(value, "https://selfx.local");
    return url.origin === "https://selfx.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/app/dashboard";
  } catch {
    return "/app/dashboard";
  }
}

export async function resolveLoginNextPath(
  value: string | null | undefined,
  session: AuthTokenResponse,
): Promise<string> {
  const next = safeLoginNextPath(value);
  const { pathname } = new URL(next, "https://selfx.local");
  if (pathname === "/app/dashboard" || pathname === "/app/activity")
    return next;

  // Installation approval is an authenticated continuation with its own
  // server-side Store/permission checks, including new-Store onboarding.
  if (pathname === "/app/integrations/shopify/link") return next;

  try {
    const [platform, merchant] = await Promise.all([
      getCurrentPlatformAccess(session.accessToken),
      getCurrentMerchantStoreAccess(session.accessToken),
    ]);
    const access = navigationAccess({
      sessionHasPlatformAccess: merchant.impersonation
        ? false
        : session.user.hasPlatformAccess,
      platformAccess: merchant.impersonation ? null : platform,
      storeAccess: merchant.permissions,
      hasActiveStore: merchant.store !== null,
    });
    return canReturnToAppPath(pathname, access) ? next : "/app/dashboard";
  } catch {
    // Authentication already succeeded. An unavailable access lookup must not
    // turn it into a failed login or follow a destination with unverified access.
    return "/app/dashboard";
  }
}
