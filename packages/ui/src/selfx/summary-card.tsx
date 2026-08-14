import type { ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@selfx/ui/components/card";
import { Separator } from "@selfx/ui/components/separator";

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-10 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--selfx-primary),white_72%)] bg-[color-mix(in_srgb,var(--selfx-primary),white_92%)] text-primary">
      {children}
    </div>
  );
}

export function SummaryCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {icon ? <CardAction><IconFrame>{icon}</IconFrame></CardAction> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  secondaryValue,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  trend?: ReactNode;
  secondaryValue?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {secondaryValue ? (
            <p className="text-sm text-muted-foreground">{secondaryValue}</p>
          ) : null}
          {trend ? <div>{trend}</div> : null}
        </div>
        {icon ? <IconFrame>{icon}</IconFrame> : null}
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      {title || description || actions ? (
        <>
          <CardHeader>
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
            {actions ? <CardAction className="flex gap-2">{actions}</CardAction> : null}
          </CardHeader>
          <Separator />
        </>
      ) : null}
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

export function ActionCard({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        {icon ? <IconFrame>{icon}</IconFrame> : null}
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div>{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function TableContainer({
  title,
  description,
  actions,
  children,
  footer,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      {title || description || actions ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
          {actions ? <CardAction className="flex gap-2">{actions}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className="overflow-x-auto p-5 pt-0">{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}

export function MetricDisplay({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      {helper ? <p className="text-sm text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
