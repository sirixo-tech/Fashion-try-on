import { Center, NoOrganizationState, PageHeader } from "@selfx/ui";

export default function NoOrganizationPage() {
  return (
    <>
      <PageHeader eyebrow="Workspace" title="No active organization" />
      <Center mih="calc(100dvh - 9rem)" p="lg">
        <NoOrganizationState
          action={{ label: "View onboarding", href: "/app/onboarding" }}
        />
      </Center>
    </>
  );
}
