import type { ComponentType, ReactNode } from "react";

export type SelfxNavItem = {
  href?: string;
  label: string;
  icon?: ComponentType<{
    className?: string;
    size?: number;
    strokeWidth?: number;
  }>;
  disabled?: boolean;
  children?: SelfxNavItem[];
};

export type SelfxOrganizationOption = {
  id: string;
  name: string;
  slug?: string;
  status: "ACTIVE" | "PENDING_ACTIVATION" | "SUSPENDED" | "ARCHIVED" | string;
};

export type SelfxUserSummary = {
  email: string;
  displayName?: string | null;
};

export type StateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type ShellAction = {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
};
