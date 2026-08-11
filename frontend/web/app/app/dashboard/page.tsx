import {
  NoOrganizationState,
  PageHeader,
  SimpleGrid,
  Stack,
  StatusBadge,
  SummaryCard,
} from "@selfx/ui";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Operational summaries will appear after the later dashboard phase."
      />
      <Stack p="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
          <SummaryCard title="Shell status" description="Phase 4 foundation">
            <StatusBadge status="ACTIVE" label="ready" />
          </SummaryCard>
          <SummaryCard
            title="Organization workspace"
            description="Active organization context is UI state only."
          >
            <NoOrganizationState
              action={{ label: "View onboarding", href: "/app/onboarding" }}
            />
          </SummaryCard>
        </SimpleGrid>
      </Stack>
    </>
  );
}
