import { MobilePlanEditor } from "@/components/mobile-plan-editor";

export default async function EditMobilePlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  return <MobilePlanEditor planId={planId} />;
}
