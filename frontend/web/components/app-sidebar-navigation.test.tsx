import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AppSidebar, SelfxUiProvider } from "@selfx/ui";

const items = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/stores", label: "Stores" },
  { href: "/app/disabled", label: "Disabled", disabled: true },
];

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderSidebar(props: {
  onNavigate?: () => void;
  onNavigateTo?: (href: string) => void;
}) {
  return render(
    <SelfxUiProvider>
      <AppSidebar items={items} {...props} />
    </SelfxUiProvider>,
  );
}

describe("AppSidebar navigation", () => {
  it("uses provider-neutral client navigation for normal clicks", () => {
    const onNavigate = vi.fn();
    const onNavigateTo = vi.fn();
    renderSidebar({ onNavigate, onNavigateTo });

    const event = fireEvent.click(screen.getByRole("link", { name: /stores/i }));

    expect(event).toBe(false);
    expect(onNavigateTo).toHaveBeenCalledWith("/app/stores");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("keeps anchor hrefs available for browser new-tab behavior", () => {
    const onNavigate = vi.fn();
    const onNavigateTo = vi.fn();
    renderSidebar({ onNavigate, onNavigateTo });

    const link = screen.getByRole("link", { name: /stores/i });

    expect(link.getAttribute("href")).toBe("/app/stores");
    expect(onNavigateTo).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate disabled links", () => {
    const onNavigate = vi.fn();
    const onNavigateTo = vi.fn();
    renderSidebar({ onNavigate, onNavigateTo });

    fireEvent.click(screen.getByText("Disabled"));

    expect(onNavigateTo).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
