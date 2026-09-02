"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { buttonVariants } from "./button";
import { cn } from "@selfx/ui/lib/utils";

export type SelectMenuOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
};

export function SelectMenu<T extends string>({
  id,
  name,
  ariaLabel,
  value,
  options,
  disabled,
  required,
  placeholder,
  className,
  contentClassName,
  onChange,
}: {
  id?: string;
  name?: string;
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<SelectMenuOption<T>>;
  disabled?: boolean;
  required?: boolean;
  placeholder?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <SelectPrimitive.Root
      name={name}
      value={value}
      disabled={disabled}
      required={required}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") {
          onChange(nextValue as T);
        }
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between bg-background font-normal",
          className,
        )}
      >
        <span className="truncate text-left">
          {selected?.label ?? placeholder ?? value}
        </span>
        <SelectPrimitive.Icon>
          <ChevronDownIcon aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          alignItemWithTrigger={false}
          className="isolate z-50 outline-none"
        >
          <SelectPrimitive.Popup
            className={cn(
              "z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
              contentClassName,
            )}
          >
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-hidden data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:bg-accent data-[selected]:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    <SelectPrimitive.ItemIndicator>
                      <CheckIcon size={14} aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText className="truncate">
                    {option.label}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
