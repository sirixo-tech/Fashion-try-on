import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductStockDialog } from "./product-stock-dialog";
import { SafeApiError } from "@/lib/api";
import {
  getProductStock,
  updateProductStock,
  type ProductStock,
} from "@/lib/product-stock";

vi.mock("@/lib/product-stock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/product-stock")>()),
  getProductStock: vi.fn(),
  updateProductStock: vi.fn(),
}));

const stock: ProductStock = {
  productId: "product-a",
  configured: true,
  version: 3,
  optionMode: "SIZE_COLOR",
  pricingMode: "VARIANT",
  basePriceAmountCents: 10000,
  priceCurrency: "INR",
  totalStockQuantity: 3,
  variants: [
    {
      id: "m-black",
      size: "M",
      color: "Black",
      stockQuantity: 3,
      priceOverrideAmountCents: 12500,
      effectivePriceAmountCents: 12500,
    },
    {
      id: "l-black",
      size: "L",
      color: "Black",
      stockQuantity: 0,
      priceOverrideAmountCents: null,
      effectivePriceAmountCents: 10000,
    },
  ],
};
function open(canEdit = true) {
  return render(
    <ProductStockDialog
      accessToken="identity"
      storeId="store-a"
      product={{ id: "product-a", name: "Shirt" }}
      canEdit={canEdit}
      onClose={vi.fn()}
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProductStock).mockResolvedValue(structuredClone(stock));
  vi.mocked(updateProductStock).mockResolvedValue({ ...stock, version: 4 });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Store stock panel", () => {
  it("shows zero-stock options without disabling Try-On and saves precise variant quantities/prices", async () => {
    open();
    await screen.findByLabelText("Stock quantity 1");
    expect(screen.getByText("Out of stock")).toBeTruthy();
    expect(
      screen.getByText(/Zero-stock products remain available for Try-On/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Stock quantity 1"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Variant price 1"), {
      target: { value: "149.95" },
    });
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "New delivery" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save stock & pricing" }),
    );
    await waitFor(() =>
      expect(updateProductStock).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "product-a",
        {
          expectedVersion: 3,
          taxRateBasisPoints: null,
          optionMode: "SIZE_COLOR",
          pricingMode: "VARIANT",
          reason: "New delivery",
          variants: [
            {
              size: "M",
              color: "Black",
              stockQuantity: 7,
              priceOverrideAmountCents: 14995,
            },
            {
              size: "L",
              color: "Black",
              stockQuantity: 0,
              priceOverrideAmountCents: null,
            },
          ],
        },
      ),
    );
    expect(await screen.findByText(/Stock and pricing saved/)).toBeTruthy();
  });
  it("supports no-option products as one quantity and permits initial zero stock", async () => {
    vi.mocked(getProductStock).mockResolvedValue({
      ...stock,
      configured: false,
      version: 0,
      optionMode: "SINGLE",
      pricingMode: "CONSTANT",
      variants: [],
    });
    open();
    await screen.findByLabelText("Stock quantity 1");
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.queryByLabelText("Size 1")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Save stock & pricing" }),
    );
    await waitFor(() =>
      expect(updateProductStock).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "product-a",
        expect.objectContaining({
          expectedVersion: 0,
          variants: [
            {
              size: null,
              color: null,
              stockQuantity: 0,
              priceOverrideAmountCents: null,
            },
          ],
        }),
      ),
    );
  });
  it("blocks stale saves until staff explicitly reload and retains their attempted edits", async () => {
    vi.mocked(updateProductStock).mockRejectedValue(
      new SafeApiError(
        "PRODUCT_STOCK_VERSION_CONFLICT",
        "Stock was changed by another user.",
        409,
      ),
    );
    open();
    await screen.findByLabelText("Stock quantity 1");
    fireEvent.change(screen.getByLabelText("Stock quantity 1"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Recount" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save stock & pricing" }),
    );
    await screen.findByText("Stock was changed by another user.");
    expect(
      (screen.getByLabelText("Stock quantity 1") as HTMLInputElement).value,
    ).toBe("9");
    expect(
      (
        screen.getByRole("button", {
          name: "Save stock & pricing",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Discard edits and reload latest stock",
      }),
    );
    await waitFor(() => expect(getProductStock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Stock quantity 1") as HTMLInputElement).value,
      ).toBe("3"),
    );
  });
  it("allows read-only inspection without exposing a Save action", async () => {
    open(false);
    await screen.findByLabelText("Stock quantity 1");
    expect(
      screen.queryByRole("button", { name: "Save stock & pricing" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Stock quantity 1") as HTMLInputElement).closest(
        "fieldset",
      )?.disabled,
    ).toBe(true);
  });
  it("shows an imported-product explanation without editing controls", async () => {
    vi.mocked(getProductStock).mockRejectedValue(
      new SafeApiError(
        "PRODUCT_STOCK_EXTERNALLY_MANAGED",
        "Stock and pricing remain managed by the external shop.",
      ),
    );
    open();
    await screen.findByText(/remain managed by the external shop/);
    expect(
      screen.queryByRole("button", { name: "Save stock & pricing" }),
    ).toBeNull();
  });
  it("enforces constant pricing when switching from variant prices", async () => {
    open();
    await screen.findByLabelText("Stock quantity 1");
    fireEvent.click(screen.getByRole("combobox", { name: "Pricing" }));
    const constantOption = await screen.findByRole("option", {
      name: "Same product price for every option",
    });
    fireEvent.pointerDown(constantOption, { pointerType: "mouse" });
    fireEvent.click(constantOption);
    await waitFor(() =>
      expect(screen.queryByLabelText("Variant price 1")).toBeNull(),
    );
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Uniform pricing" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save stock & pricing" }),
    );
    await waitFor(() =>
      expect(updateProductStock).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "product-a",
        expect.objectContaining({
          pricingMode: "CONSTANT",
          variants: [
            {
              size: "M",
              color: "Black",
              stockQuantity: 3,
              priceOverrideAmountCents: null,
            },
            {
              size: "L",
              color: "Black",
              stockQuantity: 0,
              priceOverrideAmountCents: null,
            },
          ],
        }),
      ),
    );
  });
  it("rejects fractional stock before sending a mutation", async () => {
    open();
    await screen.findByLabelText("Stock quantity 1");
    fireEvent.change(screen.getByLabelText("Stock quantity 1"), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Recount" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save stock & pricing" }),
    );
    await screen.findByText(/whole numbers/);
    expect(updateProductStock).not.toHaveBeenCalled();
  });
});
