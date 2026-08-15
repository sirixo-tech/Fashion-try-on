import type { ReactNode } from "react";

import { Button } from "@selfx/ui/components/button";
import { cn } from "@selfx/ui/lib/utils";
import type { StateAction } from "./types";

export type PageWidth = "wide" | "medium" | "form";

const pageWidth: Record<PageWidth, string> = {
  wide: "max-w-[92rem]",
  medium: "max-w-[64rem]",
  form: "max-w-[46rem]",
};

function ActionButton({
  action,
  variant = "ghost",
}: {
  action: StateAction;
  variant?: "default" | "secondary" | "ghost" | "outline";
}) {
  const props = {
    onClick: action.onClick,
    className: "w-fit",
  };

  if (action.href) {
    return (
      <Button render={<a href={action.href} />} variant={variant} {...props}>
        {action.label}
      </Button>
    );
  }

  return (
    <Button onClick={action.onClick} variant={variant}>
      {action.label}
    </Button>
  );
}

export function PageContainer({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: PageWidth;
}) {
  return (
    <main className={cn("mx-auto w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8", pageWidth[width])}>
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  );
}

export function FormPageContainer({ children }: { children: ReactNode }) {
  return <PageContainer width="form">{children}</PageContainer>;
}

export function PageSection({
  children,
  gap = "md",
}: {
  children: ReactNode;
  gap?: "sm" | "md" | "lg";
}) {
  const gapClass = gap === "sm" ? "gap-3" : gap === "lg" ? "gap-6" : "gap-4";
  return <section className={cn("flex flex-col", gapClass)}>{children}</section>;
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  status,
  primaryAction,
  secondaryActions,
  backAction,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: ReactNode;
  status?: ReactNode;
  primaryAction?: StateAction | ReactNode;
  secondaryActions?: ReactNode;
  backAction?: StateAction;
  actions?: ReactNode;
}) {
  const renderedPrimaryAction =
    primaryAction &&
    typeof primaryAction === "object" &&
    "label" in primaryAction ? (
      <ActionButton action={primaryAction as StateAction} variant="default" />
    ) : (
      primaryAction
    );

  return (
    <header className="flex flex-col gap-3">
      {breadcrumbs ? <div>{breadcrumbs}</div> : null}
      {backAction ? (
        <ActionButton action={backAction} variant="ghost" />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {status}
          </div>
          {description ? (
            <p className="max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions || secondaryActions || renderedPrimaryAction ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {secondaryActions}
            {actions}
            {renderedPrimaryAction}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {title ? <SectionHeader title={title} description={description} /> : null}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function FormActions({
  children,
  align = "right",
}: {
  children: ReactNode;
  align?: "left" | "right" | "apart";
}) {
  const justify =
    align === "left"
      ? "justify-start"
      : align === "apart"
        ? "justify-between"
        : "justify-end";

  return <div className={cn("flex flex-wrap items-center gap-2", justify)}>{children}</div>;
}
