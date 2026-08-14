import type { ReactNode } from "react";

import { SessionProvider } from "@/lib/session";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
