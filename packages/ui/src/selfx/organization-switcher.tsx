"use client";

import { Building2Icon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { Button } from "@selfx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@selfx/ui/components/dropdown-menu";
import { StatusBadge } from "./status-badge";
import type { SelfxOrganizationOption } from "./types";

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="max-w-[18rem] justify-between gap-2"
            aria-label="Select Store"
          />
        }
      >
        <Building2Icon aria-hidden="true" />
        <span className="truncate">
          {activeOrganization?.name ?? "No active Store"}
        </span>
        <ChevronsUpDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>Store</DropdownMenuLabel>
        {organizations.length === 0 ? (
          <DropdownMenuItem disabled>No active Stores</DropdownMenuItem>
        ) : (
          organizations.map((organization) => (
            <DropdownMenuItem
              key={organization.id}
              onClick={() => onSelect?.(organization.id)}
              className="items-start gap-3 py-2"
            >
              <span className="mt-0.5 flex size-4 items-center justify-center">
                {organization.id === activeOrganization?.id ? (
                  <CheckIcon size={16} aria-hidden="true" />
                ) : null}
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block truncate">{organization.name}</span>
                <StatusBadge status={organization.status} />
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
