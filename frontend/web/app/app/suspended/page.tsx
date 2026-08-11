import { Center, PageHeader, SuspendedOrganizationState } from "@selfx/ui";

export default function SuspendedPage() {
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Suspended organization" />
      <Center mih="calc(100dvh - 9rem)" p="lg">
        <SuspendedOrganizationState />
      </Center>
    </>
  );
}
