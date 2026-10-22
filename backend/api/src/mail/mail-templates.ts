export const MAIL_TEMPLATE_DEFAULTS = [
  {
    code: "STORE_CREATED",
    group: "Stores",
    name: "Store created",
    subject: "Welcome to SelfX, {{storeName}}",
    body: "Your Store {{storeName}} has been created.\nStatus: {{status}}\n\nSign in to manage your Store.\n\nSelfX",
    variables: ["storeName", "status"],
  },
  {
    code: "STORE_APPROVED",
    group: "Stores",
    name: "Application approved",
    subject: "{{storeName}} application approved",
    body: "Your application for {{storeName}} has been approved. Approval does not replace any remaining activation requirements.\n\nSelfX",
    variables: ["storeName"],
  },
  {
    code: "STORE_REJECTED",
    group: "Stores",
    name: "Application rejected",
    subject: "Update on {{storeName}}",
    body: "Your application for {{storeName}} has not been approved. Please contact SelfX support for assistance.\n\nSelfX",
    variables: ["storeName"],
  },
  {
    code: "STORE_SUSPENDED",
    group: "Stores",
    name: "Store suspended",
    subject: "{{storeName}} suspended",
    body: "Access to {{storeName}} has been suspended. Please contact SelfX support for assistance.\n\nSelfX",
    variables: ["storeName"],
  },
  {
    code: "STORE_REACTIVATED",
    group: "Stores",
    name: "Store activated",
    subject: "{{storeName}} is active",
    body: "{{storeName}} is now active. Sign in to your SelfX workspace.\n\nSelfX",
    variables: ["storeName"],
  },
  {
    code: "STORE_ARCHIVED",
    group: "Stores",
    name: "Store archived",
    subject: "{{storeName}} archived",
    body: "{{storeName}} has been archived. Please contact SelfX support if you need assistance.\n\nSelfX",
    variables: ["storeName"],
  },
  {
    code: "STORE_DELETED",
    group: "Stores",
    name: "Store deleted",
    subject: "{{storeName}} deleted",
    body: "{{storeName}} has been permanently deleted from SelfX. This message confirms the completed deletion.\n\nSelfX",
    variables: ["storeName"],
  },
  {
    code: "PURCHASE_RECEIPT",
    group: "Purchases",
    name: "Verified purchase receipt",
    subject: "Payment confirmed: {{orderReference}} — {{storeName}}",
    body: "Payment has been verified for order {{orderReference}} at {{storeName}}.\n\n{{items}}\n\nSubtotal: {{subtotal}}\nTax: {{tax}}\nTotal paid: {{total}}\n\nPlease contact {{storeName}} for collection.\n\nSelfX",
    variables: [
      "storeName",
      "orderReference",
      "items",
      "subtotal",
      "tax",
      "total",
    ],
  },
  {
    code: "PURCHASE_REVIEW",
    group: "Purchases",
    name: "Paid order requires review",
    subject: "Paid order needs attention: {{orderReference}}",
    body: "Payment has been verified for {{orderReference}} at {{storeName}}.\nTotal paid: {{total}}\n\nThis order requires staff review. Do not assume stock is allocated or collection is ready. Please contact {{storeName}} with the order reference.\n\nSelfX",
    variables: ["storeName", "orderReference", "total"],
  },
  {
    code: "CUSTOM_MESSAGE",
    group: "Custom mails",
    name: "Custom message draft",
    subject: "A message from SelfX",
    body: "Hello,\n\nWrite your message here.\n\nSelfX",
    variables: [],
  },
] as const;
export type MailTemplateCode = (typeof MAIL_TEMPLATE_DEFAULTS)[number]["code"];
export const MAIL_PREVIEW_VALUES: Record<string, string> = {
  storeName: "Example Store",
  status: "ACTIVE",
  orderReference: "SX-EXAMPLE",
  items: "1 × Example product (M / Blue) — INR 500.00",
  subtotal: "INR 500.00",
  tax: "INR 25.00",
  total: "INR 525.00",
};
export function renderMail(
  subject: string,
  body: string,
  values: Record<string, string>,
) {
  const replace = (input: string, header: boolean) =>
    input.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) =>
      header
        ? (values[name] ?? "").replace(/[\r\n\0]/g, " ")
        : (values[name] ?? ""),
    );
  return {
    subject: replace(subject, true).slice(0, 240),
    text: replace(body, false).slice(0, 30000),
  };
}
