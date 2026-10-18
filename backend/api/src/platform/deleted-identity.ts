import { type Prisma } from "@prisma/client";
export function deletedIdentityEmail(
  snapshot: Prisma.JsonValue | undefined,
): string {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    typeof snapshot.email === "string"
  )
    return `${snapshot.email} (Deleted user)`;
  return "Deleted user";
}
