import {
  PageContainer,
  PageHeader,
  PageSection,
  SuspendedOrganizationState,
} from "@selfx/ui";

export default function SuspendedPage() {
  return (
    <PageContainer width="medium">
      <PageHeader eyebrow="Workspace" title="Suspended organization" />
      <PageSection>
        <SuspendedOrganizationState />
      </PageSection>
    </PageContainer>
  );
}
