import * as React from "react";

import { cn } from "@selfx/ui/lib/utils";

function Progress({
  className,
  value = 0,
  animated = false,
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & {
  value?: number;
  animated?: boolean;
  tone?: "default" | "danger";
}) {
  const boundedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={boundedValue}
      data-slot="progress"
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          tone === "danger" ? "bg-destructive" : "bg-primary",
          animated && "animate-pulse",
        )}
        style={{ width: `${boundedValue}%` }}
      />
    </div>
  );
}

export { Progress };
