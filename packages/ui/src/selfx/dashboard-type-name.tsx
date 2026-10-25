import { cn } from "../lib/utils";

export type DashboardType = "business" | "mobile";
export type DashboardSwitch = {
  type: DashboardType;
  onChange: (type: DashboardType) => void;
};

export function DashboardTypeName({
  type,
  className,
}: {
  type: DashboardType;
  className?: string;
}) {
  return (
    <span className={cn("selfx-dashboard-name", className)}>
      <span className="sr-only">
        {type === "mobile" ? "Mobile Dashboard" : "Dashboard"}
      </span>
      <span
        aria-hidden="true"
        className="selfx-dashboard-name-track"
        data-mobile={type === "mobile"}
      >
        <span>Dashboard</span>
        <span>Mobile Dashboard</span>
      </span>
    </span>
  );
}
