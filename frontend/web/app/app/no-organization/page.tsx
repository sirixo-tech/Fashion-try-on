import {
  NoOrganizationState,
  PageContainer,
  PageHeader,
  PageSection,
} from "@selfx/ui";

export default function NoOrganizationPage() {
  return (
    <PageContainer width="medium">
      <PageHeader eyebrow="Workspace" title="No active Store" />
      <PageSection>
        <NoOrganizationState
          action={{ label: "View onboarding", href: "/app/onboarding" }}
        />
      </PageSection>
    </PageContainer>
  );
}
