import {
  PageContainer,
  PageHeader,
  PageSection,
  PermissionDeniedState,
} from "@selfx/ui";

export default function ForbiddenPage() {
  return (
    <PageContainer width="medium">
      <PageHeader eyebrow="Access" title="Forbidden" />
      <PageSection>
        <PermissionDeniedState />
      </PageSection>
    </PageContainer>
  );
}
