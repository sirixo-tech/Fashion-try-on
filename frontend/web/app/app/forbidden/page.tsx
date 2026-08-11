import { Center, PageHeader, PermissionDeniedState } from "@selfx/ui";

export default function ForbiddenPage() {
  return (
    <>
      <PageHeader eyebrow="Access" title="Forbidden" />
      <Center mih="calc(100dvh - 9rem)" p="lg">
        <PermissionDeniedState />
      </Center>
    </>
  );
}
