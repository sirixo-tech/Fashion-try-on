import Link from "next/link";

import { supportEmail, supportMailto } from "@/lib/public-contact";

export function PublicLegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="SelfX legal and support links"
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground ${className}`}
    >
      <Link className="hover:text-foreground" href="/privacy">
        Privacy Policy
      </Link>
      <Link className="hover:text-foreground" href="/support">
        Support
      </Link>
      <a className="hover:text-foreground" href={supportMailto}>
        {supportEmail}
      </a>
    </nav>
  );
}
