"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, PageContainer, PageHeader } from "@selfx/ui";
import { useSession } from "@/lib/session";
import { resolveLoginNextPath } from "@/lib/login-next";
import { WorkspaceLoading } from "@/components/workspace-loading";

export default function GoogleCompletePage() {
  const session = useSession();
  const router = useRouter();
  const resolving = useRef(false);
  useEffect(() => {
    if (session.status !== "authenticated" || resolving.current) return;
    resolving.current = true;
    void resolveLoginNextPath(
      new URLSearchParams(window.location.search).get("next"),
      {
        accessToken: session.accessToken,
        user: session.user,
        accessTokenExpiresAt: "",
      },
    ).then((next) => router.replace(next));
  }, [session, router]);
  if (session.status !== "unauthenticated") {
    return (
      <WorkspaceLoading description="Signing you in and opening your workspace…" />
    );
  }
  return (
    <PageContainer width="form">
      <PageHeader
        title="Signing in to SelfX"
        description={
          session.status === "unauthenticated"
            ? "Your session could not be restored. Return to sign in and try again."
            : "Opening your workspace…"
        }
      />
      {session.status === "unauthenticated" && (
        <Button render={<Link href="/login" />}>Return to sign in</Button>
      )}
    </PageContainer>
  );
}
