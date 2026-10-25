"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, useId, useState } from "react";

import { cn } from "@selfx/ui/lib/utils";

function TooltipProvider({
  delay = 250,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
        className="isolate z-[100]"
      >
        <TooltipPrimitive.Popup
          role="tooltip"
          data-slot="tooltip-content"
          className={cn(
            "selfx-tooltip-surface z-[100] w-fit max-w-[min(20rem,calc(100vw-1rem))] origin-(--transform-origin) rounded-lg px-3 py-2 text-xs font-medium leading-relaxed break-words motion-reduce:animate-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="selfx-tooltip-arrow" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/** Adds a tooltip to the existing element without nesting buttons or changing layout. */
function ControlTooltip({
  content,
  children,
  side = "top",
}: {
  content?: ReactNode;
  children: ReactElement;
  side?: TooltipPrimitive.Positioner.Props["side"];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const existingDescription = (
    children.props as { "aria-describedby"?: string }
  )["aria-describedby"];
  const describedBy =
    [existingDescription, open ? id : undefined].filter(Boolean).join(" ") ||
    undefined;
  if (!content) return children;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={cloneElement(
          children as ReactElement<{ "aria-describedby"?: string }>,
          { "aria-describedby": describedBy },
        )}
        delay={250}
        aria-describedby={describedBy}
      />
      <TooltipContent id={id} side={side}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ControlTooltip,
};
