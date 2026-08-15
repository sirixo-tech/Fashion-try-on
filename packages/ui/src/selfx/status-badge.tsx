import { Badge } from "@selfx/ui/components/badge";
import { cn } from "@selfx/ui/lib/utils";

const statusTone: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  INACTIVE: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SUBMITTED: "border-blue-200 bg-blue-50 text-blue-700",
  UNDER_REVIEW: "border-blue-200 bg-blue-50 text-blue-700",
  PENDING_ACTIVATION: "border-amber-200 bg-amber-50 text-amber-700",
  NEEDS_INFORMATION: "border-amber-200 bg-amber-50 text-amber-700",
  SUSPENDED: "border-red-200 bg-red-50 text-red-700",
  REVOKED: "border-slate-200 bg-slate-100 text-slate-700",
  DELETED: "border-red-200 bg-red-50 text-red-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  ARCHIVED: "border-border bg-muted text-muted-foreground",
  DRAFT: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusTone[status] ?? statusTone.DRAFT)}>
      {label ?? status.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
