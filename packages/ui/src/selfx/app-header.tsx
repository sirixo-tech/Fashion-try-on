"use client";

import { MenuIcon } from "lucide-react";

import { Button } from "@selfx/ui/components/button";

export function AppHeader({
  mobileOpened,
  onToggleMobile,
}: {
  mobileOpened: boolean;
  onToggleMobile: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleMobile}
        aria-label={mobileOpened ? "Close navigation" : "Open navigation"}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
    </header>
  );
}
