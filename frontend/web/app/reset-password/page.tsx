import { PasswordRecoveryForm } from "@/components/password-recovery-form";
export const metadata = {
  title: "Reset password | SelfX",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <PasswordRecoveryForm reset />;
}
