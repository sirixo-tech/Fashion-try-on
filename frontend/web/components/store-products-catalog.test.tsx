import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProductsPage from "../app/app/products/page";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import {
  getStore,
  getEffectiveStorePermissions,
  requestStoreCatalogSync,
  listStoreProducts,
  updateStoreProduct,
  type StoreProduct,
} from "@/lib/stores";
import { getPlatformVirtualTryOnSettings } from "@/lib/platform-settings";
import { SafeApiError } from "@/lib/api";

const state = vi.hoisted(() => ({ pathname: "/app/products/garments" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "identity" }),
}));
vi.mock("@/lib/current-store", async (original) => ({
  ...(await original<typeof import("@/lib/current-store")>()),
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformVirtualTryOnSettings: vi.fn(),
}));
vi.mock("@/lib/stores", async (original) => ({
  ...(await original<typeof import("@/lib/stores")>()),
  getStore: vi.fn(),
  getEffectiveStorePermissions: vi.fn(),
  listStoreProducts: vi.fn(),
  requestStoreCatalogSync: vi.fn(),
  updateStoreProduct: vi.fn(),
}));
const permissions = {
  storeId: "store-a",
  platformBypass: false,
  permissions: ["stores.view", "products.manage"],
  featureKeys: [],
  membershipId: "membership",
};
const product: StoreProduct = {
  id: "migrated",
  name: "Migrated shirt",
  slug: "shirt",
  description: null,
  audience: "UNISEX",
  categoryId: "category",
  categoryName: "Tops",
  categorySlug: "tops",
  active: true,
  vtoEnabled: true,
  priceAmountCents: 10000,
  priceCurrency: "INR",
  productUrl: null,
  productVertical: "GARMENT",
  jewelleryType: null,
  garmentIntent: "TOP",
  garmentCategory: "TOP",
  garmentPhotoType: "PRODUCT",
  image: {
    url: null,
    storageKey: null,
    contentType: null,
    width: null,
    height: null,
  },
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.pathname = "/app/products/garments";
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: { id: "store-a", name: "Avinash stores", status: "ACTIVE" },
    permissions,
    impersonation: null,
    hasMultipleStores: false,
  });
  vi.mocked(getStore).mockResolvedValue({
    id: "store-a",
    name: "Avinash stores",
  } as never);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue(permissions);
  vi.mocked(listStoreProducts).mockResolvedValue({
    data: [product],
    defaultCurrency: "INR",
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      hasMore: false,
    },
  });
});
afterEach(cleanup);

it("debounces search and reuses Store details and permissions while ignoring older results", async () => {
  render(<ProductsPage />);
  await screen.findByText("Migrated shirt");
  const original = vi.mocked(listStoreProducts).mock.results[0]!;
  const response = await original.value;
  let finishOld!: (value: typeof response) => void;
  vi.mocked(listStoreProducts).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  const input = screen.getByPlaceholderText("Search garments...");
  fireEvent.change(input, { target: { value: "o" } });
  fireEvent.change(input, { target: { value: "old" } });
  expect(listStoreProducts).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(listStoreProducts).toHaveBeenCalledTimes(2));
  expect(getStore).toHaveBeenCalledTimes(1);
  expect(getEffectiveStorePermissions).toHaveBeenCalledTimes(1);
  vi.mocked(listStoreProducts).mockResolvedValue({
    ...response,
    data: [{ ...product, name: "New search result" }],
  });
  fireEvent.change(input, { target: { value: "new" } });
  await screen.findByText("New search result");
  await act(async () => finishOld(response));
  expect(screen.queryByText("Migrated shirt")).toBeNull();
  expect(screen.getByText("New search result")).toBeTruthy();
  expect(getStore).toHaveBeenCalledTimes(1);
  expect(getEffectiveStorePermissions).toHaveBeenCalledTimes(1);
});

it("shows migrated Store products and editing controls without platform settings access", async () => {
  render(<ProductsPage />);
  expect(await screen.findByText("Migrated shirt")).toBeTruthy();
  expect(listStoreProducts).toHaveBeenCalledWith(
    "identity",
    "store-a",
    expect.objectContaining({ productVertical: "GARMENT" }),
  );
  expect(
    (screen.getByRole("link", { name: "Add Garment" }) as HTMLButtonElement)
      .disabled,
  ).toBe(undefined);
  expect(
    screen.getByRole("link", { name: "Dashboard" }).getAttribute("href"),
  ).toBe("/app/dashboard");
  expect(getPlatformVirtualTryOnSettings).not.toHaveBeenCalled();
});
it("keeps an empty catalog usable so the Store can add its first product", async () => {
  vi.mocked(listStoreProducts).mockResolvedValue({
    data: [],
    defaultCurrency: "INR",
    pagination: {
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
      hasMore: false,
    },
  });
  render(<ProductsPage />);
  expect(await screen.findByText("No garments match this view.")).toBeTruthy();
  expect(
    (screen.getByRole("link", { name: "Add Garment" }) as HTMLButtonElement)
      .disabled,
  ).toBe(undefined);
});
it("opens the jewellery sidebar destination with the jewellery filter", async () => {
  state.pathname = "/app/products/jewellery";
  render(<ProductsPage />);
  await waitFor(() =>
    expect(listStoreProducts).toHaveBeenCalledWith(
      "identity",
      "store-a",
      expect.objectContaining({ productVertical: "JEWELLERY" }),
    ),
  );
  expect(screen.getByRole("link", { name: "Add Jewellery" })).toBeTruthy();
});
it("hides mutation controls while retaining product viewing when management is revoked", async () => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    ...permissions,
    permissions: ["stores.view"],
  });
  render(<ProductsPage />);
  expect(await screen.findByText("Migrated shirt")).toBeTruthy();
  expect(
    screen.queryByRole("button", {
      name: /Add Garment|^Edit$|Delete|Sync to Kiosks|Enable Imported|Disable Imported/,
    }),
  ).toBeNull();
  expect(
    screen.queryByRole("combobox", { name: /Change garment type/ }),
  ).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(
    screen.getByRole("button", { name: "View Stock & Pricing" }),
  ).toBeTruthy();
  expect(screen.getByText("Tops")).toBeTruthy();
});

it("hides jewellery type editing with the same permission rule", async () => {
  state.pathname = "/app/products/jewellery";
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    ...permissions,
    permissions: ["stores.view"],
  });
  vi.mocked(listStoreProducts).mockResolvedValue({
    data: [{ ...product, productVertical: "JEWELLERY", jewelleryType: "RING" }],
    defaultCurrency: "INR",
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      hasMore: false,
    },
  });
  render(<ProductsPage />);
  await screen.findByText("Migrated shirt");
  expect(screen.getByText("Rings")).toBeTruthy();
  expect(
    screen.queryByRole("combobox", { name: /Change jewellery type/ }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Add Jewellery|^Edit$|Delete/ }),
  ).toBeNull();
});

it("removes editing controls after a permission refresh and restores them only after a grant", async () => {
  render(<ProductsPage />);
  await screen.findByText("Migrated shirt");
  expect(screen.getByRole("link", { name: "Edit" })).toBeTruthy();
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    ...permissions,
    permissions: ["stores.view"],
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull(),
  );
  expect(
    screen.getByRole("button", { name: "View Stock & Pricing" }),
  ).toBeTruthy();
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue(permissions);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("link", { name: "Edit" });
});

it("hides stale mutation actions when the server denies a write after revocation", async () => {
  vi.mocked(requestStoreCatalogSync).mockRejectedValue(
    new SafeApiError("STORE_PERMISSION_DENIED", "Denied", 403),
  );
  render(<ProductsPage />);
  await screen.findByText("Migrated shirt");
  fireEvent.click(screen.getByRole("button", { name: "Sync to Kiosks" }));
  await screen.findByText(/Product editing is no longer permitted/);
  expect(
    screen.queryByRole("button", {
      name: /Add Garment|^Edit$|Delete|Sync to Kiosks/,
    }),
  ).toBeNull();
});
it("does not restore editing from a late permission read after the product endpoint denies access", async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof getEffectiveStorePermissions>>,
  ) => void;
  vi.mocked(getEffectiveStorePermissions).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(listStoreProducts).mockRejectedValueOnce(
    new SafeApiError("STORE_PERMISSION_DENIED", "Catalog access denied", 403),
  );
  render(<ProductsPage />);
  await screen.findByText("Catalog access denied");
  await act(async () => finish(permissions));
  expect(screen.queryByRole("link", { name: "Add Garment" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
});
it("does not load any catalog when no Store is selected", async () => {
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: null,
    permissions: null,
    hasMultipleStores: false,
    impersonation: null,
  });
  render(<ProductsPage />);
  expect(await screen.findByText("Store access required")).toBeTruthy();
  expect(listStoreProducts).not.toHaveBeenCalled();
});
it("reloads the target Store on impersonation changes", async () => {
  render(<ProductsPage />);
  await screen.findByText("Migrated shirt");
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: { id: "store-b", name: "Second Store", status: "ACTIVE" },
    permissions: { ...permissions, storeId: "store-b" },
    impersonation: null,
    hasMultipleStores: false,
  });
  fireEvent(window, new Event("selfx:impersonation-changed"));
  await waitFor(() =>
    expect(listStoreProducts).toHaveBeenCalledWith(
      "identity",
      "store-b",
      expect.anything(),
    ),
  );
});
it("shows imported source and Try-On controls without native stock, edit or delete", async () => {
  const imported = {
    ...product,
    catalogSource: "WOOCOMMERCE" as const,
    productUrl: "https://website.example/product/10",
  };
  const initial = await vi.mocked(listStoreProducts).getMockImplementation()!(
    "",
    "",
    {},
  );
  vi.mocked(listStoreProducts).mockResolvedValue({
    ...initial,
    data: [imported],
  });
  vi.mocked(updateStoreProduct).mockResolvedValue({
    ...imported,
    vtoEnabled: false,
  });
  render(<ProductsPage />);
  await screen.findByText("WooCommerce");
  expect(screen.queryByRole("link", { name: "Stock & Pricing" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Delete Migrated shirt" }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Original product" }).getAttribute("href"),
  ).toBe(imported.productUrl);
  fireEvent.click(screen.getByRole("button", { name: "Disable Try-On" }));
  await waitFor(() =>
    expect(updateStoreProduct).toHaveBeenCalledWith(
      "identity",
      "store-a",
      "migrated",
      { vtoEnabled: false },
    ),
  );
});
