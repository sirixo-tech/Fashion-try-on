import {
  PageContainer,
  PageHeader,
  PageSection,
  PendingActivationState,
} from "@selfx/ui";

export default function OnboardingPage() {
  return (
    <PageContainer width="medium">
      <PageHeader
        eyebrow="Onboarding"
        title="Store status"
        description="Applicant and activation status routing is separate from normal tenant operation."
      />
      <PageSection>
        <PendingActivationState />
      </PageSection>
    </PageContainer>
  );
}
