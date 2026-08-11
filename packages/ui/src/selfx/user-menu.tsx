"use client";

import { Avatar, Menu, Stack, Text, UnstyledButton } from "@mantine/core";
import { LogOutIcon, UserIcon } from "lucide-react";

import type { SelfxUserSummary } from "./types.js";

function initialsFor(user: SelfxUserSummary): string {
  const source = user.displayName || user.email;
  return source
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  user,
  onLogout,
}: {
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
}) {
  return (
    <Menu shadow="md" width={280} position="bottom-end">
      <Menu.Target>
        <UnstyledButton aria-label="Open user menu">
          <Avatar color="selfx" radius="xl">
            {user ? initialsFor(user) : "SX"}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Stack gap={2}>
            <Text fw={600} size="sm">
              {user?.displayName ?? "SelfX user"}
            </Text>
            {user?.email ? (
              <Text truncate size="xs" c="dimmed">
                {user.email}
              </Text>
            ) : null}
          </Stack>
        </Menu.Label>
        <Menu.Divider />
        <Menu.Item
          leftSection={<UserIcon size={16} aria-hidden="true" />}
          disabled
        >
          Profile
        </Menu.Item>
        <Menu.Item
          leftSection={<LogOutIcon size={16} aria-hidden="true" />}
          onClick={onLogout}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
