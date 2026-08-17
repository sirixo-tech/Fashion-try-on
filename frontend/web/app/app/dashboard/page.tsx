import {
  ActionCard,
  Button,
  FilterBar,
  Input,
  Label,
  NoOrganizationState,
  PageContainer,
  PageHeader,
  PageSection,
  SectionCard,
  StatCard,
  StatGrid,
  StatusBadge,
  TableContainer,
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
          title="Store workspace"
          description="Active Store context is UI state only."
        >
          <NoOrganizationState
            action={{ label: "View onboarding", href: "/app/onboarding" }}
          />
        </SectionCard>
      </PageSection>

      <PageSection>
        <FilterBar
          search={
            <div className="w-full space-y-2 sm:w-72">
              <Label htmlFor="dashboard-search">Search</Label>
              <Input
                id="dashboard-search"
                placeholder="Future list search"
                disabled
              />
            </div>
          }
          filters={
            <Button variant="outline" disabled>
              <ListFilterIcon aria-hidden="true" />
              Filters
            </Button>
          }
          actions={
            <Button variant="outline" disabled>
              Secondary action
            </Button>
          }
        />
        <TableContainer
          title="Table surface"
          description="Future bounded list pages should use this surface with explicit pagination."
          footer={
            <p className="text-sm text-muted-foreground">
              Pagination controls will live here.
            </p>
          }
        >
          <p className="text-sm text-muted-foreground">
            No operational table data is implemented in Phase 4.
          </p>
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
