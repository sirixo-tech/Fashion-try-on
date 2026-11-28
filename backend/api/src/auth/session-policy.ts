export function loadSessionPolicy(env: NodeJS.ProcessEnv = process.env) {
  function seconds(key: string, fallback: number) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483)
      throw new Error(`${key} must be a positive integer <= 2147483`);
    return value;
  }
  const policy = {
    reauthAfterSeconds: seconds("AUTH_SESSION_REAUTH_AFTER_SECONDS", 86400),
    idleTimeoutSeconds: seconds("AUTH_SESSION_IDLE_TIMEOUT_SECONDS", 900),
    hardMaxSeconds: seconds("AUTH_SESSION_HARD_MAX_SECONDS", 108000),
  };
  if (policy.hardMaxSeconds < policy.reauthAfterSeconds)
    throw new Error(
      "AUTH_SESSION_HARD_MAX_SECONDS must be >= AUTH_SESSION_REAUTH_AFTER_SECONDS",
    );
  return policy;
}

export type SessionPolicy = ReturnType<typeof loadSessionPolicy>;

export function sessionTiming(
  policy: SessionPolicy,
  startedAt: Date,
  lastUserActivityAt: Date | null | undefined,
  credentialExpiresAt: Date,
  now = new Date(),
) {
  const reauthDue = startedAt.getTime() + policy.reauthAfterSeconds * 1000;
  const hardExpiry = Math.min(
    startedAt.getTime() + policy.hardMaxSeconds * 1000,
    credentialExpiresAt.getTime(),
  );
  const expiry = lastUserActivityAt
    ? Math.min(
        hardExpiry,
        Math.max(
          reauthDue,
          lastUserActivityAt.getTime() + policy.idleTimeoutSeconds * 1000,
        ),
      )
    : 0; // Sessions from before this policy require a fresh login.
  return {
    serverTime: now.toISOString(),
    reauthDueAt: new Date(reauthDue).toISOString(),
    hardExpiresAt: new Date(hardExpiry).toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    idleTimeoutSeconds: policy.idleTimeoutSeconds,
  };
}
