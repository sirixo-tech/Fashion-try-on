import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelfxLogo,
} from "@selfx/ui";

interface Signup2Props {
  heading?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const Signup2 = ({
  heading = "Sign in",
  description,
  children,
  footer,
}: Signup2Props) => {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--selfx-primary),white_88%),transparent_34%),linear-gradient(180deg,#fff,#f8fafc)] px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[26rem] flex-col items-center justify-center gap-6">
        <SelfxLogo />
        <Card className="w-full">
          <CardHeader className="items-center text-center">
            {heading ? <CardTitle className="text-2xl">{heading}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer ? (
          <p className="max-w-sm text-center text-sm leading-6 text-muted-foreground">{footer}</p>
        ) : null}
      </section>
    </main>
  );
};

export { Signup2 };
