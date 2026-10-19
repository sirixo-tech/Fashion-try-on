"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { cn } from "../lib/utils";

type SecretInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value"
> & {
  value: string;
  saved?: boolean;
  revealable?: boolean;
  visibilityLabel?: string;
};

// Dots indicate presence only: they are never a value or the saved secret's length.
export function SecretInput({
  value,
  saved = false,
  revealable = false,
  visibilityLabel = "password",
  placeholder,
  className,
  disabled,
  ...props
}: SecretInputProps) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);
  const showing = revealable && visible && value.length > 0;
  return (
    <div className="relative min-w-0 w-full">
      <Input
        {...props}
        type={showing ? "text" : "password"}
        value={value}
        placeholder={saved ? "••••••••" : placeholder}
        disabled={disabled}
        className={cn(revealable && "pr-10", className)}
      />
      {revealable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-0.5 top-1/2 -translate-y-1/2"
          aria-label={`${showing ? "Hide" : "Show"} ${visibilityLabel}`}
          aria-pressed={showing}
          aria-controls={props.id}
          disabled={disabled || !value}
          onClick={() => setVisible((current) => !current)}
        >
          {showing ? (
            <EyeOffIcon aria-hidden="true" />
          ) : (
            <EyeIcon aria-hidden="true" />
          )}
        </Button>
      )}
    </div>
  );
}
