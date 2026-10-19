import Image from "next/image";
import type { PaymentProvider } from "@/lib/payments";

const logos: Record<PaymentProvider, { file: string; name: string }> = {
  PHONEPE: { file: "phonepe.svg", name: "PhonePe" },
  RAZORPAY: { file: "razorpay.svg", name: "Razorpay" },
  STRIPE: { file: "stripe.svg", name: "Stripe" },
  PAYTM: { file: "paytm.svg", name: "Paytm" },
  PAYPAL: { file: "paypal.svg", name: "PayPal" },
};

export function PaymentProviderLogo({
  provider,
}: {
  provider: PaymentProvider;
}) {
  const logo = logos[provider];
  return (
    <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-xl border bg-white p-3 shadow-sm">
      <Image
        src={`/brand/payments/${logo.file}`}
        alt={`${logo.name} logo`}
        width={112}
        height={56}
        className="h-14 w-full object-contain"
        unoptimized
      />
    </div>
  );
}
