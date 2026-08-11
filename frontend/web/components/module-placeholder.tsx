import { Center, EmptyState, PageHeader } from "@selfx/ui";

const phaseLabels: Record<string, string> = {
  Stores: "Phase 15",
  Staff: "Phase 15",
  Products: "Phase 5",
  Kiosks: "Phase 11",
  "Try-On Activity": "Phase 15",
  Analytics: "Phase 15",
  Integrations: "Phase 18+",
  "Developer / API": "Phase 17",
  "Usage & Billing": "Phase 16",
  Settings: "Phase 15",
  Platform: "Phase 21",
};

export function ModulePlaceholder({ title }: { title: string }) {
  const phase = phaseLabels[title] ?? "later phase";

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={title}
        description={`${title} screens are reserved for ${phase}.`}
      />
      <Center mih="calc(100dvh - 11rem)" p="lg">
        <EmptyState
          title={`${title} module not implemented`}
          description="The Phase 4 shell reserves this route without creating business workflows or fake operational data."
        />
      </Center>
    </>
  );
}
