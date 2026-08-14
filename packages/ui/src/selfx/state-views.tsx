import type { ComponentType, ReactNode } from "react";
import {
  AlertCircleIcon,
  BanIcon,
  InboxIcon,
  LockKeyholeIcon,
  PauseCircleIcon,
} from "lucide-react";

import { Button } from "@selfx/ui/components/button";
import { Card, CardContent } from "@selfx/ui/components/card";
import { Skeleton } from "@selfx/ui/components/skeleton";
import type { StateAction } from "./types.js";

function StateCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  action?: StateAction;
  children?: ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex size-11 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {(action || children) && (
          <div className="flex flex-wrap items-center gap-2">
            {children}
            {action?.href ? (
              <Button render={<a href={action.href} />}>{action.label}</Button>
            ) : action ? (
              <Button onClick={action.onClick}>{action.label}</Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4 p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        {label}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}

export function EmptyState(props: {
  title?: string;
  description?: string;
  action?: StateAction;
}) {
  return (
    <StateCard
      icon={InboxIcon}
      title={props.title ?? "Nothing here yet"}
      description={props.description ?? "This area will show records when they exist."}
      action={props.action}
    />
  );
}

export function ErrorState(props: {
  title?: string;
  description?: string;
  action?: StateAction;
}) {
  return (
    <StateCard
      icon={AlertCircleIcon}
      title={props.title ?? "Something went wrong"}
      description={props.description ?? "The request could not be completed safely."}
      action={props.action}
    />
  );
}

export function PermissionDeniedState(props: {
  title?: string;
  description?: string;
  action?: StateAction;
}) {
  return (
    <StateCard
      icon={LockKeyholeIcon}
      title={props.title ?? "Permission required"}
      description={props.description ?? "Your account is not authorized for this area."}
      action={props.action}
    />
  );
}

export function NoOrganizationState(props: { action?: StateAction }) {
  return (
    <StateCard
      icon={BanIcon}
      title="No active organization"
      description="Active organization workspaces appear here after SelfX activation."
      action={props.action}
    />
  );
}

export function PendingActivationState(props: { action?: StateAction }) {
  return (
    <StateCard
      icon={PauseCircleIcon}
      title="Activation pending"
      description="This organization is not an operational workspace until SelfX explicitly activates it."
      action={props.action}
    />
  );
}

export function SuspendedOrganizationState(props: { action?: StateAction }) {
  return (
    <StateCard
      icon={PauseCircleIcon}
      title="Organization suspended"
      description="Operational access is restricted while this organization is suspended."
      action={props.action}
    />
  );
}
