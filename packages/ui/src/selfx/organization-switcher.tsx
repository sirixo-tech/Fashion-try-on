"use client";

import { Button, Group, Menu, Stack, Text } from "@mantine/core";
import { Building2Icon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { StatusBadge } from "@selfx/ui/selfx/status-badge";
import type { SelfxOrganizationOption } from "./types.js";

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  onSelect,
}: {
  organizations: SelfxOrganizationOption[];
  activeOrganizationId?: string | null;
  onSelect?: (organizationId: string) => void;
}) {
  const activeOrganization =
    organizations.find(
      (organization) => organization.id === activeOrganizationId,
    ) ?? organizations[0];

  return (
    <Menu width={320} shadow="md" position="bottom-start">
      <Menu.Target>
        <Button
          variant="default"
          justify="space-between"
          leftSection={<Building2Icon size={16} aria-hidden="true" />}
          rightSection={<ChevronsUpDownIcon size={16} aria-hidden="true" />}
          maw={320}
          miw={{ base: 0, sm: 260 }}
          px="sm"
          aria-label="Select organization"
        >
          <Text truncate size="sm" fw={500}>
            {activeOrganization?.name ?? "No active organization"}
          </Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Organization</Menu.Label>
        {organizations.length === 0 ? (
          <Menu.Item disabled>No active organizations</Menu.Item>
        ) : (
          organizations.map((organization) => (
            <Menu.Item
              key={organization.id}
              onClick={() => onSelect?.(organization.id)}
              leftSection={
                organization.id === activeOrganization?.id ? (
                  <CheckIcon size={16} aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" />
                )
              }
            >
              <Stack gap={2}>
                <Text truncate size="sm">
                  {organization.name}
                </Text>
                <Group>
                  <StatusBadge status={organization.status} />
                </Group>
              </Stack>
            </Menu.Item>
          ))
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
