import type { ReactNode } from "react";
import {
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ChevronLeftIcon } from "lucide-react";

import type { StateAction } from "./types.js";

export type PageWidth = "wide" | "medium" | "form";

const pageWidth: Record<PageWidth, string> = {
  wide: "92rem",
  medium: "64rem",
  form: "46rem",
};

function ActionButton({
  action,
  variant = "subtle",
}: {
  action: StateAction;
  variant?: "filled" | "light" | "subtle" | "outline";
}) {
  if (action.href) {
    return (
      <Button component="a" href={action.href} variant={variant}>
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
    <Box
      w="100%"
      maw={pageWidth[width]}
      mx="auto"
      px={{ base: "md", sm: "lg", lg: "xl" }}
      py={{ base: "md", sm: "lg", lg: "xl" }}
    >
      <Stack gap="lg">{children}</Stack>
    </Box>
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
  return (
    <Stack component="section" gap={gap}>
      {children}
    </Stack>
  );
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
    <Group justify="space-between" align="flex-end" gap="md" wrap="wrap">
      <Stack gap={3}>
        <Title order={2} size="h3">
          {title}
        </Title>
        {description ? (
          <Text size="sm" c="dimmed" maw={760}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
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
      <ActionButton action={primaryAction as StateAction} variant="filled" />
    ) : (
      primaryAction
    );

  return (
    <Stack component="header" gap="sm">
      {breadcrumbs ? <Box>{breadcrumbs}</Box> : null}
      {backAction ? (
        <Box>
          <Button
            component={backAction.href ? "a" : "button"}
            href={backAction.href}
            onClick={backAction.onClick}
            leftSection={<ChevronLeftIcon size={16} aria-hidden="true" />}
            variant="subtle"
            size="compact-sm"
          >
            {backAction.label}
          </Button>
        </Box>
      ) : null}
      <Group align="flex-end" justify="space-between" gap="md" wrap="wrap">
        <Stack gap={5} style={{ flex: "1 1 28rem" }}>
          {eyebrow ? (
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              {eyebrow}
            </Text>
          ) : null}
          <Group gap="sm" align="center" wrap="wrap">
            <Title order={1} size="h2">
              {title}
            </Title>
            {status}
          </Group>
          {description ? (
            <Text size="sm" c="dimmed" maw={820}>
              {description}
            </Text>
          ) : null}
        </Stack>
        {actions || secondaryActions || renderedPrimaryAction ? (
          <Group gap="sm" justify="flex-end" wrap="wrap">
            {secondaryActions}
            {actions}
            {renderedPrimaryAction}
          </Group>
        ) : null}
      </Group>
    </Stack>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid
      cols={{ base: 1, sm: 2, xl: 4 }}
      spacing={{ base: "md", lg: "lg" }}
    >
      {children}
    </SimpleGrid>
  );
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
    <Stack gap="md">
      {title ? <SectionHeader title={title} description={description} /> : null}
      <Stack gap="md">{children}</Stack>
    </Stack>
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
      ? "flex-start"
      : align === "apart"
        ? "space-between"
        : "flex-end";

  return (
    <Group justify={justify} gap="sm" wrap="wrap">
      {children}
    </Group>
  );
}
