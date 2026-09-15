import { PricingPlanEditor } from "@/components/pricing-plan-editor";

export default async function EditPricingPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  return <PricingPlanEditor mode="edit" planId={planId} />;
}
