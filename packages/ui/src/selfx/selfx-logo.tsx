import { SparklesIcon } from "lucide-react";
import { Group, Stack, Text, ThemeIcon } from "@mantine/core";

export function SelfxLogo() {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon radius="md" size="lg" color="selfx">
        <SparklesIcon size={16} aria-hidden="true" />
      </ThemeIcon>
      <Stack gap={0}>
        <Text size="sm" fw={700} lh={1.1}>
          SelfX
        </Text>
        <Text size="xs" fw={500} c="dimmed" lh={1.1}>
          Virtual Try-On
        </Text>
      </Stack>
    </Group>
  );
}
