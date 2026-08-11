"use client";

import type { ReactNode } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
}) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <span onClick={open}>{trigger}</span>
      <Modal opened={opened} onClose={close} title={title}>
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            {description}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {cancelLabel}
            </Button>
            <Button
              color={destructive ? "danger" : "selfx"}
              onClick={() => {
                onConfirm?.();
                close();
              }}
            >
              {confirmLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
