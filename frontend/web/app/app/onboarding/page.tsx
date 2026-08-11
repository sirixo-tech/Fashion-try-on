import { Center, PageHeader, PendingActivationState } from "@selfx/ui";

export default function OnboardingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Onboarding"
        title="Organization status"
        description="Applicant and activation status routing is separate from normal tenant operation."
      />
      <Center mih="calc(100dvh - 11rem)" p="lg">
        <PendingActivationState />
      </Center>
    </>
  );
}
