import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreProductEditor } from "./store-product-editor";
import {
  getEffectiveStorePermissions,
  getStoreProduct,
  listStoreProducts,
  updateStoreProduct,
} from "@/lib/stores";
import { getProductStock, updateProductStock } from "@/lib/product-stock";
import { SafeApiError } from "@/lib/api";
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const auth = vi.hoisted(() => ({
  status: "authenticated",
  accessToken: "identity",
  user: { id: "staff" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/app/products/garments/test/edit",
}));
vi.mock("@/lib/session", () => ({
  useSession: () => auth,
}));
vi.mock("@/lib/stores", async (original) => ({
  ...(await original<typeof import("@/lib/stores")>()),
  getEffectiveStorePermissions: vi.fn(),
  getStoreProduct: vi.fn(),
  listStoreProducts: vi.fn(),
  updateStoreProduct: vi.fn(),
}));
vi.mock("@/lib/product-stock", async (original) => ({
  ...(await original<typeof import("@/lib/product-stock")>()),
  getProductStock: vi.fn(),
  updateProductStock: vi.fn(),
}));
const product = {
  id: "test",
  name: "Shirt",
  productVertical: "GARMENT",
  categoryName: "Tops",
  audience: "UNISEX",
  garmentIntent: "TOP",
  priceAmountCents: 10000,
  priceCurrency: "INR",
  active: true,
  vtoEnabled: true,
  image: { url: null, storageKey: null },
};
const stock = {
  productId: "test",
  configured: true,
  version: 4,
  optionMode: "SIZE_COLOR",
  pricingMode: "VARIANT",
  colorImages: [],
  variants: [
    {
      id: "m",
      size: "M",
      color: "Blue",
      stockQuantity: 2,
      priceOverrideAmountCents: 12000,
    },
    {
      id: "l",
      size: "L",
      color: "Blue",
      stockQuantity: 0,
      priceOverrideAmountCents: null,
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  auth.accessToken = "identity";
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: ["stores.view", "products.manage"],
  } as never);
  vi.mocked(getStoreProduct).mockResolvedValue(product as never);
  vi.mocked(listStoreProducts).mockResolvedValue({
    defaultCurrency: "INR",
  } as never);
  vi.mocked(getProductStock).mockResolvedValue(stock as never);
  vi.mocked(updateStoreProduct).mockResolvedValue(product as never);
  vi.mocked(updateProductStock).mockResolvedValue({
    ...stock,
    version: 5,
  } as never);
});
afterEach(cleanup);
it("edits product and option prices with one optional image per colour", async () => {
  render(<StoreProductEditor storeId="store" productId="test" />);
  await screen.findByRole("heading", { name: "Edit Shirt" });
  expect(screen.getAllByLabelText("Image for Blue")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Stock 1"), {
    target: { value: "7" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(updateProductStock).toHaveBeenCalledWith(
      "identity",
      "store",
      "test",
      expect.objectContaining({
        expectedVersion: 4,
        variants: [
          {
            size: "M",
            color: "Blue",
            stockQuantity: 7,
            priceOverrideAmountCents: 12000,
          },
          {
            size: "L",
            color: "Blue",
            stockQuantity: 0,
            priceOverrideAmountCents: null,
          },
        ],
        colorImages: [],
      }),
    ),
  );
  expect(navigation.push).toHaveBeenCalledWith("/app/stores/store/products");
});
it("validates stock before writing product details", async () => {
  render(<StoreProductEditor storeId="store" productId="test" />);
  await screen.findByRole("heading", { name: "Edit Shirt" });
  fireEvent.change(screen.getByLabelText("Stock 1"), {
    target: { value: "-1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(updateStoreProduct).not.toHaveBeenCalled();
});
it("keeps failed stock edits reviewable and retries without creating another product", async () => {
  vi.mocked(updateProductStock).mockRejectedValueOnce(
    new Error("Connection interrupted"),
  );
  render(<StoreProductEditor storeId="store" productId="test" />);
  await screen.findByRole("heading", { name: "Edit Shirt" });
  fireEvent.change(screen.getByLabelText("Stock 1"), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Product details were saved, but stock changes were not",
  );
  expect(navigation.push).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Stock 1") as HTMLInputElement).value).toBe(
    "3",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalled());
  expect(updateProductStock).toHaveBeenCalledTimes(2);
});
it("shows values without mutation controls after revocation", async () => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: ["stores.view"],
  } as never);
  render(<StoreProductEditor storeId="store" productId="test" />);
  await screen.findByRole("heading", { name: "Shirt" });
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
});
it("removes editing controls when the server rejects stale authority", async () => {
  vi.mocked(updateStoreProduct).mockRejectedValue(
    new SafeApiError("PERMISSION_DENIED", "Permission revoked", 403),
  );
  render(<StoreProductEditor storeId="store" productId="test" />);
  await screen.findByRole("heading", { name: "Edit Shirt" });
  fireEvent.change(screen.getByLabelText("Stock 1"), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(updateProductStock).not.toHaveBeenCalled();
});

it("preserves unsaved fields across routine session token refresh", async () => {
  const view = render(<StoreProductEditor storeId="store" productId="test" />);
  await screen.findByRole("heading", { name: "Edit Shirt" });
  fireEvent.change(screen.getByLabelText("Stock 1"), {
    target: { value: "7" },
  });
  auth.accessToken = "refreshed";
  view.rerender(<StoreProductEditor storeId="store" productId="test" />);
  expect((screen.getByLabelText("Stock 1") as HTMLInputElement).value).toBe(
    "7",
  );
  expect(getStoreProduct).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(updateProductStock).toHaveBeenCalledWith(
      "refreshed",
      "store",
      "test",
      expect.objectContaining({ expectedVersion: 4 }),
    ),
  );
});
