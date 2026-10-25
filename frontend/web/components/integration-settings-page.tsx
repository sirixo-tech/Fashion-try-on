"use client";
import { type IntegrationType } from "@/lib/integrations";
import { ShopifySettingsPage } from "./shopify-settings-page";
import { WooCommerceSettingsPage } from "./woocommerce-settings-page";
export function IntegrationSettingsPage({
  type,
}: {
  type: IntegrationType;
  title: string;
}) {
  return type === "SHOPIFY" ? (
    <ShopifySettingsPage />
  ) : (
    <WooCommerceSettingsPage />
  );
}
