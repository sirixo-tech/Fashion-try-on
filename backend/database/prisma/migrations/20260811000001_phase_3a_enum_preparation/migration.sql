-- Phase 3A enum/type preparation.
-- PostgreSQL requires newly added enum values to commit before later statements use them.
-- Do not edit the already-applied Phase 1 migration.

ALTER TYPE "OrganizationStatus" ADD VALUE 'PENDING_ACTIVATION';
ALTER TYPE "MembershipStatus" ADD VALUE 'PENDING_ACTIVATION';

CREATE TYPE "MembershipStoreScopeMode" AS ENUM ('ALL_STORES', 'SELECTED_STORES');
CREATE TYPE "OrganizationApplicationStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_INFORMATION',
  'APPROVED',
  'REJECTED'
);
CREATE TYPE "ActivationRequirementStatus" AS ENUM ('PENDING', 'SATISFIED', 'WAIVED');
