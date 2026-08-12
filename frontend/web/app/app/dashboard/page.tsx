import {
  ActionCard,
  Button,
  FilterBar,
  NoOrganizationState,
  PageContainer,
  PageHeader,
  PageSection,
  SectionCard,
  StatCard,
  StatGrid,
  StatusBadge,
  TableContainer,
  Text,
  TextInput,
} from "@selfx/ui";
import { LayoutTemplateIcon, ListFilterIcon } from "lucide-react";

export default function DashboardPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Operational summaries will appear after the later dashboard phase."
        status={<StatusBadge status="ACTIVE" label="phase 4 shell" />}
      />

      <PageSection>
        <StatGrid>
          <StatCard
            label="Page system"
            value="Ready"
            secondaryValue="Shared layout primitives"
          />
          <StatCard
            label="Width mode"
            value="Wide"
            secondaryValue="Admin workspace layout"
          />
          <StatCard
            label="Card pattern"
            value="Standard"
            secondaryValue="No arbitrary fixed heights"
          />
          <StatCard
            label="Business data"
            value="Deferred"
            secondaryValue="Later dashboard phase"
          />
        </StatGrid>
      </PageSection>

      <PageSection>
        <SectionCard
          title="Organization workspace"
          description="Active organization context is UI state only."
        >
          <NoOrganizationState
            action={{ label: "View onboarding", href: "/app/onboarding" }}
          />
        </SectionCard>
      </PageSection>

      <PageSection>
        <FilterBar
          search={
            <TextInput
              label="Search"
              placeholder="Future list search"
              disabled
              w={{ base: "100%", sm: 280 }}
            />
          }
          filters={
            <Button
              variant="light"
              color="gray"
              leftSection={<ListFilterIcon size={16} aria-hidden="true" />}
              disabled
            >
              Filters
            </Button>
          }
          actions={<Button disabled>Secondary action</Button>}
        />
        <TableContainer
          title="Table surface"
          description="Future bounded list pages should use this surface with explicit pagination."
          footer={
            <Text size="sm" c="dimmed">
              Pagination controls will live here.
            </Text>
          }
        >
          <Text size="sm" c="dimmed">
            No operational table data is implemented in Phase 4.
          </Text>
        </TableContainer>
      </PageSection>

      <PageSection>
        <ActionCard
          icon={<LayoutTemplateIcon size={20} aria-hidden="true" />}
          title="Layout standards"
          description="Future pages should compose PageContainer, PageHeader, PageSection and approved card patterns from @selfx/ui."
        />
      </PageSection>
    </PageContainer>
  );
}
