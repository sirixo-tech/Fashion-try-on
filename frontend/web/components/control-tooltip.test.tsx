import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  Button,
  ControlTooltip,
  SelfxUiProvider,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  SecretInput,
} from "@selfx/ui";
import { RefreshCwIcon } from "lucide-react";

beforeAll(() => {
  window.PointerEvent = class extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  } as typeof PointerEvent;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

it("shows a dark shared tooltip for icon buttons on keyboard focus without native titles", async () => {
  const click = vi.fn();
  render(
    <SelfxUiProvider>
      <Button
        size="icon"
        aria-label="Refresh dashboard"
        title="Refresh dashboard"
        onClick={click}
      >
        <RefreshCwIcon />
      </Button>
    </SelfxUiProvider>,
  );
  const button = screen.getByRole("button", { name: "Refresh dashboard" });
  expect(button.getAttribute("title")).toBeNull();
  act(() => {
    button.focus();
  });
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toBe("Refresh dashboard");
  expect(tooltip.className).toContain("selfx-tooltip-surface");
  expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
  fireEvent.click(button);
  expect(click).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(button, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
});

it("supports anchors and keeps a single underlying interactive element", async () => {
  render(
    <ControlTooltip content="Open Dashboard" side="right">
      <a href="/app/dashboard">Dashboard</a>
    </ControlTooltip>,
  );
  const link = screen.getByRole("link", { name: "Dashboard" });
  act(() => {
    link.focus();
  });
  expect((await screen.findByRole("tooltip")).textContent).toBe(
    "Open Dashboard",
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(link.getAttribute("href")).toBe("/app/dashboard");
});
it("retains an existing accessible description alongside the tooltip", async () => {
  render(
    <>
      <p id="existing-help">Existing help text</p>
      <Button
        size="icon"
        aria-label="Refresh data"
        aria-describedby="existing-help"
      >
        <RefreshCwIcon />
      </Button>
    </>,
  );
  const button = screen.getByRole("button", { name: "Refresh data" });
  act(() => {
    button.focus();
  });
  const tooltip = await screen.findByRole("tooltip");
  const descriptions = button.getAttribute("aria-describedby")!.split(" ");
  expect(descriptions).toContain("existing-help");
  expect(descriptions).toContain(tooltip.id);
});

it("does not add redundant tooltips to ordinary labelled buttons", () => {
  render(<Button>Save changes</Button>);
  expect(
    screen
      .getByRole("button", { name: "Save changes" })
      .getAttribute("data-slot"),
  ).toBe("button");
  expect(document.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
});
it("explains disabled actions on focus without allowing them to execute", async () => {
  const action = vi.fn();
  render(
    <Button disabled title="Manage permission is required" onClick={action}>
      Create API Key
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Create API Key" });
  act(() => {
    button.focus();
  });
  expect((await screen.findByRole("tooltip")).textContent).toBe(
    "Manage permission is required",
  );
  expect(button.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(button);
  fireEvent.keyDown(button, { key: "Enter" });
  expect(action).not.toHaveBeenCalled();
});
it("opens on mouse hover and keeps accessible labels independent from tooltip descriptions", async () => {
  render(
    <Button size="icon" aria-label="Archive Store">
      <RefreshCwIcon />
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Archive Store" });
  fireEvent.pointerEnter(button, { pointerType: "mouse" });
  fireEvent.pointerMove(button, { pointerType: "mouse" });
  fireEvent.mouseEnter(button);
  fireEvent.mouseMove(button, { clientX: 10, clientY: 10 });
  expect((await screen.findByRole("tooltip")).textContent).toBe(
    "Archive Store",
  );
  expect(button.getAttribute("aria-label")).toBe("Archive Store");
});

it("preserves dialog-trigger composition with an automatic action tooltip", async () => {
  render(
    <SelfxUiProvider>
      <Dialog>
        <DialogTrigger
          render={
            <Button size="icon" aria-label="Open preview">
              <RefreshCwIcon />
            </Button>
          }
        />
        <DialogContent>
          <DialogTitle>Image preview</DialogTitle>
        </DialogContent>
      </Dialog>
    </SelfxUiProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Image preview" })).toBeTruthy();
});

it("preserves the show/hide password control and its accessible action name", () => {
  render(
    <SelfxUiProvider>
      <SecretInput
        id="password-fixture"
        value="example-password"
        onChange={() => {}}
        visibilityLabel="password"
        revealable
      />
    </SelfxUiProvider>,
  );
  const input = document.getElementById("password-fixture") as HTMLInputElement;
  expect(input.type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(input.type).toBe("text");
  expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
});
