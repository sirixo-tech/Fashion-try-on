// Browser memory only. Never persist access context or share it across sessions.
const entries = new Map<
  string,
  { expires: number; promise: Promise<unknown> }
>();
let generation = 0;
let listening = false;
const contextTtl = 15_000;

export function clearApiReadCache() {
  generation++;
  entries.clear();
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  for (const event of [
    "selfx:permissions-changed",
    "selfx:impersonation-changed",
    "selfx:store-changed",
  ])
    window.addEventListener(event, clearApiReadCache);
  window.addEventListener("focus", clearApiReadCache);
}

function ttlFor(path: string): number | null {
  if (
    path === "/api/v1/admin/access/me" ||
    path === "/api/v1/organizations/current-store" ||
    /^\/api\/v1\/admin\/stores\/[^/?]+\/effective-permissions$/.test(path)
  )
    return contextTtl;
  // Only deduplicate these reads while in flight; metrics remain fresh.
  if (
    /^\/api\/v1\/admin\/(stores(?:[/?]|$)|usage\/summary\?|integrations\/(?:shopify|woocommerce)\/overview\?)/.test(
      path,
    )
  )
    return 0;
  return null;
}

export function cachedApiRead<T>(
  key: string,
  path: string,
  load: () => Promise<T>,
): Promise<T> {
  if (typeof window === "undefined") return load();
  listen();
  const ttl = ttlFor(path);
  if (ttl === null) return load();
  const existing = entries.get(key);
  if (existing && existing.expires > Date.now())
    return existing.promise as Promise<T>;
  const version = generation;
  const entry = {
    expires: Infinity,
    promise: Promise.resolve() as Promise<unknown>,
  };
  const promise = load().then(
    (value) => {
      if (version === generation && entries.get(key) === entry) {
        if (ttl) entry.expires = Date.now() + ttl;
        else entries.delete(key);
      }
      return value;
    },
    (error: unknown) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    },
  );
  entry.promise = promise;
  entries.set(key, entry);
  // Bound retained session/context keys, including abandoned expired tokens.
  if (entries.size > 100) entries.delete(entries.keys().next().value!);
  return promise;
}
