import { type Prisma } from "@prisma/client";
export const STORE_ROLE_CODES = ["store-admin", "staff"];
export const PLATFORM_ROLE_CODES = [
  "platform-staff-admin",
  "platform-support-admin",
];
export const adminMembershipWhere = {
  OR: [
    {
      role: { in: ["ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "STORE_OWNER"] },
    },
    {
      roleAssignments: {
        some: { role: { systemCode: "store-admin", isActive: true } },
      },
    },
  ],
} satisfies Prisma.OrganizationMembershipWhereInput;
export function isStoreAdmin(membership: {
  role: string;
  roleAssignments?: {
    role: { systemCode?: string | null; isActive?: boolean };
  }[];
}) {
  return (
    ["ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "STORE_OWNER"].includes(
      membership.role,
    ) ||
    Boolean(
      membership.roleAssignments?.some(
        (a) => a.role.systemCode === "store-admin" && a.role.isActive !== false,
      ),
    )
  );
}
