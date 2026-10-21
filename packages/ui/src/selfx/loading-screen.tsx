import type { ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";

import { Card, CardContent } from "../components/card";
import { cn } from "../lib/utils";
import { SelfxLogo } from "./selfx-logo";

export function LoadingScreen({
  title = "Loading workspace",
  description = "Preparing your SelfX workspace…",
  logo = <SelfxLogo />,
  fullScreen = true,
  className,
}: {
  title?: string;
  description?: string;
  logo?: ReactNode;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full place-items-center bg-background p-6",
        fullScreen ? "min-h-dvh" : "min-h-[calc(100dvh-5rem)]",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Card className="w-full max-w-sm shadow-soft motion-safe:transform-none">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-8 text-center">
          {logo}
          <LoaderCircleIcon
            className="size-7 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">{title}</p>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
