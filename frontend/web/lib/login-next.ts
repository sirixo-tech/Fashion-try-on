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
