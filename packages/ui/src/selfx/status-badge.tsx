import { Badge, type BadgeProps } from "@mantine/core";

const statusTone: Record<string, BadgeProps["color"]> = {
  ACTIVE: "success",
  APPROVED: "success",
  COMPLETED: "success",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  PENDING_ACTIVATION: "warning",
  NEEDS_INFORMATION: "warning",
  SUSPENDED: "danger",
  REJECTED: "danger",
  ARCHIVED: "gray",
  DRAFT: "gray",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <Badge variant="light" color={statusTone[status] ?? statusTone.DRAFT}>
      {label ?? status.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
