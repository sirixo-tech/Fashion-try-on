import type { ComponentType, ReactNode } from "react";
import {
  AlertCircleIcon,
  BanIcon,
  InboxIcon,
  LockKeyholeIcon,
  PauseCircleIcon,
} from "lucide-react";
import {
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import type { StateAction } from "./types.js";

function StateCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  action?: StateAction;
  children?: ReactNode;
}) {
  return (
    <Card maw={640} mx="auto" shadow="sm" p="lg">
      <Stack gap="md">
        <ThemeIcon color="gray" variant="light" size={44} radius="md">
          <Icon size={22} />
        </ThemeIcon>
        <Stack gap={4}>
          <Title order={2} size="h3">
            {title}
          </Title>
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        </Stack>
        {(action || children) && (
          <Group gap="sm">
            {children}
            {action?.href ? (
              <Button component="a" href={action.href}>
                {action.label}
              </Button>
            ) : action ? (
              <Button onClick={action.onClick}>{action.label}</Button>
            ) : null}
          </Group>
        )}
      </Stack>
    </Card>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <Stack p="lg" gap="md" role="status" aria-live="polite">
      <Group gap="xs">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          {label}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Skeleton height={112} radius="md" />
        <Skeleton height={112} radius="md" />
        <Skeleton height={112} radius="md" />
      </SimpleGrid>
    </Stack>
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
      description={
        props.description ?? "This area will show records when they exist."
      }
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
      description={
        props.description ?? "The request could not be completed safely."
      }
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
      description={
        props.description ?? "Your account is not authorized for this area."
      }
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
