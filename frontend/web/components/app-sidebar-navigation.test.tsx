import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { AppSidebar, SelfxUiProvider, type DashboardType } from "@selfx/ui";

const items = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/stores", label: "Stores" },
  { href: "/app/disabled", label: "Disabled", disabled: true },
];

beforeAll(() => {
  window.PointerEvent ??= MouseEvent as typeof PointerEvent;
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
  it("describes the toggle's next destination with styled tooltips", async () => {
    function Fixture() {
      const [type, setType] = useState<DashboardType>("business");
      return (
        <SelfxUiProvider>
          <AppSidebar
            items={items}
            dashboardSwitch={{ type, onChange: setType }}
          />
        </SelfxUiProvider>
      );
    }
    render(<Fixture />);
    const toggle = screen.getByRole("switch", { name: "Mobile dashboard" });
    expect(toggle.getAttribute("title")).toBeNull();
    act(() => {
      toggle.focus();
    });
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Switch to Mobile Dashboard",
    );
    fireEvent.click(toggle);
    act(() => {
      toggle.blur();
      toggle.focus();
    });
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Switch to Dashboard",
    );
  });
  it("keeps the toggle separate from the Business link and slides its current name", () => {
    const navigate = vi.fn();
    function Fixture() {
      const [type, setType] = useState<DashboardType>("business");
      return (
        <SelfxUiProvider>
          <AppSidebar
            items={items}
            activePath="/app/dashboard"
            dashboardSwitch={{ type, onChange: setType }}
            onNavigateTo={navigate}
          />
        </SelfxUiProvider>
      );
    }
    render(<Fixture />);
    const toggle = screen.getByRole("switch", { name: "Mobile dashboard" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByRole("link", { name: "Dashboard" }).getAttribute("href"),
    ).toBe("/app/dashboard");
    expect(toggle.closest("a")).toBeNull();
    fireEvent.click(toggle);
    expect(navigate).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    const mobileLink = screen.getByRole("link", { name: "Mobile Dashboard" });
    expect(mobileLink.querySelector('[data-mobile="true"]')).toBeTruthy();
    fireEvent.click(mobileLink);
    expect(navigate).toHaveBeenCalledWith("/app/dashboard");
    fireEvent.click(toggle);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });
  it("keeps the toggle available when navigation is collapsed", () => {
    const change = vi.fn();
    render(
      <SelfxUiProvider>
        <AppSidebar
          items={items}
          collapsed
          dashboardSwitch={{ type: "business", onChange: change }}
        />
      </SelfxUiProvider>,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Mobile dashboard" }));
    expect(change).toHaveBeenCalledWith("mobile");
  });
  it("does not show a dashboard toggle without explicit access from the shell", () => {
    renderSidebar({});
    expect(
      screen.queryByRole("switch", { name: "Mobile dashboard" }),
    ).toBeNull();
  });
  it("uses provider-neutral client navigation for normal clicks", () => {
    const onNavigate = vi.fn();
    const onNavigateTo = vi.fn();
    renderSidebar({ onNavigate, onNavigateTo });

    const event = fireEvent.click(
      screen.getByRole("link", { name: /stores/i }),
    );

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
