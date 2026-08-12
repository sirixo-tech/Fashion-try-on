import { render, screen, waitFor } from "@testing-library/react";
import { LayoutDashboardIcon } from "lucide-react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppShell,
  Button,
  FilterBar,
  FormActions,
  FormPageContainer,
  FormSection,
  NoOrganizationState,
  OrganizationSwitcher,
  PageContainer,
  PageHeader,
  PendingActivationState,
  PermissionDeniedState,
  SectionCard,
  SelfxLogo,
  SelfxUiProvider,
  StatCard,
  StatGrid,
  StatusBadge,
  SuspendedOrganizationState,
  TableContainer,
  TextInput,
  PasswordInput,
} from "@selfx/ui";

import { SessionProvider, useSession } from "@/lib/session";

function renderWithUi(element: ReactElement) {
  return render(<SelfxUiProvider>{element}</SelfxUiProvider>);
}

describe("SelfX shared shell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    class ResizeObserverStub {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders shared brand and status components", () => {
    renderWithUi(
      <>
        <SelfxLogo />
        <StatusBadge status="PENDING_ACTIVATION" />
      </>,
    );

    expect(screen.getByText("SelfX")).toBeTruthy();
    expect(screen.getByText("pending activation")).toBeTruthy();
  });

  it("renders Mantine provider and common control primitives", () => {
    renderWithUi(
      <>
        <TextInput label="Email" />
        <PasswordInput label="Password" />
        <Button>Continue</Button>
      </>,
    );

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("renders responsive navigation with accessible mobile trigger", () => {
    renderWithUi(
      <AppShell
        navItems={[
          {
            href: "/app/dashboard",
            label: "Dashboard",
            icon: LayoutDashboardIcon,
          },
        ]}
        activePath="/app/dashboard"
        organizations={[{ id: "org-1", name: "Retail Co", status: "ACTIVE" }]}
        activeOrganizationId="org-1"
        user={{ email: "owner@example.test", displayName: "Owner" }}
      >
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Collapse navigation" }),
    ).toBeTruthy();
    expect(screen.getByText("Dashboard content")).toBeTruthy();
  });

  it("handles organization switcher available and empty states", () => {
    const { rerender } = renderWithUi(
      <OrganizationSwitcher
        organizations={[{ id: "org-1", name: "Retail Co", status: "ACTIVE" }]}
        activeOrganizationId="org-1"
      />,
    );

    expect(screen.getByText("Retail Co")).toBeTruthy();

    rerender(
      <SelfxUiProvider>
        <OrganizationSwitcher organizations={[]} />
      </SelfxUiProvider>,
    );

    expect(screen.getByText("No active organization")).toBeTruthy();
  });

  it("renders tenant and permission states without raw internal errors", () => {
    renderWithUi(
      <>
        <PermissionDeniedState />
        <NoOrganizationState />
        <PendingActivationState />
        <SuspendedOrganizationState />
      </>,
    );

    expect(screen.getByText("Permission required")).toBeTruthy();
    expect(screen.getByText("No active organization")).toBeTruthy();
    expect(screen.getByText("Activation pending")).toBeTruthy();
    expect(screen.getByText("Organization suspended")).toBeTruthy();
    expect(screen.queryByText(/Prisma|DATABASE_URL|stack/i)).toBeNull();
  });

  it("renders page layout primitives and header actions", () => {
    renderWithUi(
      <PageContainer width="form">
        <PageHeader
          eyebrow="Standards"
          title="Layout test"
          description="Shared page anatomy"
          primaryAction={{ label: "Create", href: "/app/dashboard" }}
          secondaryActions={<Button variant="light">Export</Button>}
        />
        <StatGrid>
          <StatCard label="Mode" value="Form" secondaryValue="Constrained" />
        </StatGrid>
        <SectionCard title="Section card">Reusable section content</SectionCard>
        <FilterBar search={<TextInput label="Search" />} />
        <TableContainer title="Table container" footer="Pagination">
          Rows belong here
        </TableContainer>
        <FormPageContainer>
          <FormSection title="Form section">
            <TextInput label="Field" />
          </FormSection>
          <FormActions>
            <Button>Save</Button>
          </FormActions>
        </FormPageContainer>
      </PageContainer>,
    );

    expect(screen.getByRole("heading", { name: "Layout test" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.getByText("Reusable section content")).toBeTruthy();
    expect(screen.getByText("Rows belong here")).toBeTruthy();
    expect(screen.getByLabelText("Field")).toBeTruthy();
  });

  it("keeps staff access tokens in memory and never writes browser storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized." },
        }),
      }),
    );

    function Probe() {
      const session = useSession();
      return <p>{session.status}</p>;
    }

    render(
      <SelfxUiProvider>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </SelfxUiProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("unauthenticated")).toBeTruthy(),
    );
    expect(window.localStorage.length).toBe(0);
  });
});
