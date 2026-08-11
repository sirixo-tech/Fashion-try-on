import type { ReactNode } from "react";
import { Box, Group, Stack, Text, Title } from "@mantine/core";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Box
      component="header"
      px="lg"
      py="md"
      bd="0 0 1px solid var(--mantine-color-gray-3)"
    >
      <Group align="flex-end" justify="space-between" gap="md" wrap="wrap">
        <Stack gap={4}>
          {eyebrow ? (
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              {eyebrow}
            </Text>
          ) : null}
          <Title order={1} size="h2">
            {title}
          </Title>
          {description ? (
            <Text size="sm" c="dimmed" maw={780}>
              {description}
            </Text>
          ) : null}
        </Stack>
        {actions ? <Group gap="sm">{actions}</Group> : null}
      </Group>
    </Box>
  );
}
