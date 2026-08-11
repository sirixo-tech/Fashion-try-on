import type { ReactNode } from "react";
import { Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";

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
    <Card shadow="sm" p="lg">
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

export const StatCard = SummaryCard;
