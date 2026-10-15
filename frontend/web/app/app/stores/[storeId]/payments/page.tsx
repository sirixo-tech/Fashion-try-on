"use client";
import { useParams } from "next/navigation";
import { PaymentSettingsPage } from "@/components/payment-settings-page";
export default function StorePaymentsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  return <PaymentSettingsPage key={storeId} storeId={storeId} />;
}
