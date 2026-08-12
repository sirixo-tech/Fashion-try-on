import type { ReactNode } from "react";
import {
  Box,
  Card,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

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
    <Card p={{ base: "md", sm: "lg" }}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2} size="h4">
              {title}
            </Title>
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
          {icon ? (
            <ThemeIcon color="selfx" variant="light" radius="md">
              {icon}
            </ThemeIcon>
          ) : null}
        </Group>
        {children}
      </Stack>
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
    <Card p={{ base: "md", sm: "lg" }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={6}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            {label}
          </Text>
          <Text size="xl" fw={750}>
            {value}
          </Text>
          {secondaryValue ? (
            <Text size="sm" c="dimmed">
              {secondaryValue}
            </Text>
          ) : null}
          {trend ? <Box>{trend}</Box> : null}
        </Stack>
        {icon ? (
          <ThemeIcon color="selfx" variant="light" radius="md" size={40}>
            {icon}
          </ThemeIcon>
        ) : null}
      </Group>
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
    <Card p={{ base: "md", sm: "lg" }}>
      <Stack gap="md">
        {title || description || actions ? (
          <>
            <Group
              justify="space-between"
              align="flex-start"
              gap="md"
              wrap="wrap"
            >
              <Stack gap={4}>
                {title ? (
                  <Title order={2} size="h4">
                    {title}
                  </Title>
                ) : null}
                {description ? (
                  <Text size="sm" c="dimmed">
                    {description}
                  </Text>
                ) : null}
              </Stack>
              {actions ? <Group gap="xs">{actions}</Group> : null}
            </Group>
            <Divider />
          </>
        ) : null}
        {children}
      </Stack>
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
    <Card p={{ base: "md", sm: "lg" }}>
      <Stack gap="md">
        {icon ? (
          <ThemeIcon color="selfx" variant="light" radius="md" size={42}>
            {icon}
          </ThemeIcon>
        ) : null}
        <Stack gap={4}>
          <Title order={3} size="h4">
            {title}
          </Title>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </Stack>
        {action ? <Box>{action}</Box> : null}
      </Stack>
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
    <Paper withBorder radius="md" bg="var(--mantine-color-body)">
      <Stack gap={0}>
        {title || description || actions ? (
          <Group
            justify="space-between"
            align="flex-start"
            gap="md"
            p="lg"
            wrap="wrap"
          >
            <Stack gap={4}>
              {title ? (
                <Title order={2} size="h4">
                  {title}
                </Title>
              ) : null}
              {description ? (
                <Text size="sm" c="dimmed">
                  {description}
                </Text>
              ) : null}
            </Stack>
            {actions ? <Group gap="xs">{actions}</Group> : null}
          </Group>
        ) : null}
        <Box
          p={{ base: "md", sm: "lg" }}
          pt={title || description ? 0 : undefined}
        >
          {children}
        </Box>
        {footer ? (
          <>
            <Divider />
            <Box p="md">{footer}</Box>
          </>
        ) : null}
      </Stack>
    </Paper>
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
    <Stack gap={2}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
      {helper ? (
        <Text size="sm" c="dimmed">
          {helper}
        </Text>
      ) : null}
    </Stack>
  );
}
