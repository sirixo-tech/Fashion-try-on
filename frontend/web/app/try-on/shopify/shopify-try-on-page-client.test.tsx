import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createShopifyTryOnRun,
  getShopifyTryOnRun,
  getShopifyTryOnSession,
  uploadShopifyTryOnPersonImage,
} from "@/lib/shopify-storefront-try-on-api";
import { SafeApiError } from "@/lib/api";

import { ShopifyTryOnPageClient } from "./shopify-try-on-page-client";

vi.mock("@/lib/shopify-storefront-try-on-api", () => ({
  createShopifyTryOnRun: vi.fn(),
  getShopifyTryOnRun: vi.fn(),
  getShopifyTryOnSession: vi.fn(),
  uploadShopifyTryOnPersonImage: vi.fn(),
}));

const sessionToken = "a".repeat(43);
const session = {
  session: sessionToken,
  garmentAssetId: "garment-1",
  expiresAt: "2026-09-11T00:15:00.000Z",
  product: {
    id: "product-1",
    name: "Floral Shirt",
    handle: "floral-shirt",
  },
};

const staleCompletedRun = {
  id: "run-1",
  status: "COMPLETED" as const,
  session: sessionToken,
  product: session.product,
  result: {
    assetId: "asset-1",
    readUrl: "https://storage.example/stale-result.png",
    contentType: "image/png",
    expiresAt: "2026-09-11T00:15:00.000Z",
  },
};

const freshCompletedRun = {
  ...staleCompletedRun,
  result: {
    ...staleCompletedRun.result,
    readUrl: "https://storage.example/fresh-result.png",
    downloadUrl: "https://storage.example/fresh-download.png",
  },
};

describe("ShopifyTryOnPageClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes the generated result URL before downloading", async () => {
    vi.useFakeTimers();
    vi.mocked(getShopifyTryOnSession).mockResolvedValue(session);
    vi.mocked(uploadShopifyTryOnPersonImage).mockResolvedValue({
      session: sessionToken,
      personAssetId: "person-1",
      expiresAt: "2026-09-11T00:15:00.000Z",
    });
    vi.mocked(createShopifyTryOnRun).mockResolvedValue({
      id: "run-1",
      status: "QUEUED",
      session: sessionToken,
      product: session.product,
    });
    vi.mocked(getShopifyTryOnRun)
      .mockResolvedValueOnce(staleCompletedRun)
      .mockResolvedValueOnce(freshCompletedRun);
    let clickedAnchor: HTMLAnchorElement | null = null;
    const click = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = createElement(tagName);
      if (tagName === "a") {
        const anchor = element as HTMLAnchorElement;
        vi.spyOn(anchor, "click").mockImplementation(() => {
          clickedAnchor = anchor;
          click();
        });
      }
      return element;
    });

    render(<ShopifyTryOnPageClient sessionToken={sessionToken} />);
    await act(async () => {});
    expect(screen.getAllByText("floral-shirt")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox"));
    const file = new File(["person"], "person.png", { type: "image/png" });
    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    );
    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { files: [file] } });
    });
    expect(screen.getByRole("button", { name: "Start Try-On" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Try-On" }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download" }));
    });

    expect(getShopifyTryOnRun).toHaveBeenCalledTimes(2);
    expect(clickedAnchor?.href).toBe("https://storage.example/fresh-download.png");
    expect(clickedAnchor?.download).toBe("selfx-try-on-run-1.png");
    expect(click).toHaveBeenCalledOnce();
  });

  it("shows a shopper-safe message when store credits are exhausted", async () => {
    vi.mocked(getShopifyTryOnSession).mockResolvedValue(session);
    vi.mocked(uploadShopifyTryOnPersonImage).mockResolvedValue({
      session: sessionToken,
      personAssetId: "person-1",
      expiresAt: "2026-09-11T00:15:00.000Z",
    });
    vi.mocked(createShopifyTryOnRun).mockRejectedValue(
      new SafeApiError(
        "SELFX_CREDITS_EXHAUSTED",
        "SelfX Try-On credits are exhausted.",
        402,
      ),
    );

    render(<ShopifyTryOnPageClient sessionToken={sessionToken} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("checkbox"));
    const file = new File(["person"], "person.png", { type: "image/png" });
    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    );
    await act(async () => {
      fireEvent.change(inputs[1]!, { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Try-On" }));
    });

    expect(
      screen.getByText(
        "Try-On is temporarily unavailable for this store. Please try again later.",
      ),
    ).toBeTruthy();
  });
});
