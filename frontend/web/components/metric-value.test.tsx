import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MetricValue } from "@selfx/ui";

let callbacks: Map<number, FrameRequestCallback>;
let motion: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
const tick = (time: number) =>
  act(() => {
    const frame = [...callbacks.values()];
    callbacks.clear();
    frame.forEach((callback) => callback(time));
  });
beforeEach(() => {
  callbacks = new Map();
  let id = 0;
  motion = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => motion),
  );
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((frame: number) => {
      callbacks.delete(frame);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("counts up to the exact formatted percentage while exposing the final value accessibly", () => {
  const { container } = render(<MetricValue value="94.9%" duration={1000} />);
  tick(0);
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
    "0.0%",
  );
  expect(screen.getByText("94.9%").className).toBe("sr-only");
  tick(500);
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
    "83.0%",
  );
  tick(1000);
  expect(container.textContent).toBe("94.9%");
  expect(callbacks.size).toBe(0);
});

it("preserves currency, grouping and decimals and never restarts on unrelated renders", () => {
  const { container, rerender } = render(
    <MetricValue value="₹1,250.00" duration={1000} />,
  );
  tick(0);
  tick(500);
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
    "₹1,093.75",
  );
  tick(1000);
  rerender(<MetricValue value="₹1,250.00" duration={1000} />);
  expect(callbacks.size).toBe(0);
  expect(container.textContent).toBe("₹1,250.00");
});

it("keeps zero, unavailable values and status text literal and respects reduced motion", () => {
  for (const value of ["0", "—", "ACTIVE", "37 / 39", "2026-10-25"]) {
    const view = render(<MetricValue value={value} />);
    expect(view.container.textContent).toBe(value);
    expect(callbacks.size).toBe(0);
    view.unmount();
  }
  motion.matches = true;
  const view = render(<MetricValue value="5,000" />);
  expect(view.container.textContent).toBe("5,000");
  expect(callbacks.size).toBe(0);
});

it("discards the old animation on value changes and cancels frames on unmount", () => {
  const { container, rerender, unmount } = render(
    <MetricValue value="900" duration={1000} />,
  );
  tick(0);
  tick(500);
  rerender(<MetricValue value="12" duration={1000} />);
  tick(600);
  tick(1600);
  expect(container.textContent).toBe("12");
  rerender(<MetricValue value="500" />);
  tick(1700);
  unmount();
  expect(callbacks.size).toBe(0);
});

it("finishes immediately when reduced motion is enabled during an animation", () => {
  const { container } = render(<MetricValue value="94.9%" />);
  tick(0);
  motion.matches = true;
  act(() => motion.addEventListener.mock.calls[0]![1]());
  expect(container.textContent).toBe("94.9%");
  expect(callbacks.size).toBe(0);
});

it("waits until the metric enters view before starting", () => {
  let observe!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observe = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const { container } = render(<MetricValue value="500" />);
  expect(callbacks.size).toBe(0);
  act(() =>
    observe(
      [{ isIntersecting: false }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(callbacks.size).toBe(0);
  act(() =>
    observe(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  tick(0);
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
    "0",
  );
  tick(1000);
  expect(container.textContent).toBe("500");
  expect(disconnect).toHaveBeenCalled();
});
