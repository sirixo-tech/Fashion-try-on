import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelfxLogo,
} from "@selfx/ui";

import { PublicLegalLinks } from "@/components/public-legal-links";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        <Card>
          <CardHeader>
            <SelfxLogo />
            <CardTitle className="pt-4 text-3xl">SelfX Admin</CardTitle>
            <CardDescription>
              Premium SaaS workspace for SelfX staff, stores, kiosks and
              virtual try-on operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button render={<a href="/login" />}>Sign in</Button>
            <Button variant="outline" render={<a href="/app/dashboard" />}>
              Open shell
            </Button>
          </CardContent>
        </Card>
        <PublicLegalLinks className="mt-5" />
      </div>
    </main>
  );
}
