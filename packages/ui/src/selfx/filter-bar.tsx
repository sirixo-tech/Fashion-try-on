import type { ReactNode } from "react";
import { Button, Group, Paper, Stack } from "@mantine/core";

export function FilterBar({
  search,
  filters,
  sort,
  actions,
  onClear,
  clearLabel = "Clear",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  sort?: ReactNode;
  actions?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <Paper withBorder radius="md" p={{ base: "md", sm: "lg" }}>
      <Stack gap="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          {search}
          {filters}
          {sort}
          {onClear ? (
            <Button variant="subtle" color="gray" onClick={onClear}>
              {clearLabel}
            </Button>
          ) : null}
          {actions ? (
            <Group ml="auto" gap="sm" wrap="wrap">
              {actions}
            </Group>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  );
}
