import { SparklesIcon } from "lucide-react";

export function SelfxLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <SparklesIcon size={17} aria-hidden="true" />
      </div>
      <div className="leading-none">
        <p className="text-sm font-bold text-foreground">SelfX</p>
        <p className="text-xs font-medium text-muted-foreground">Virtual Try-On</p>
      </div>
    </div>
  );
}
