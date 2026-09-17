import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type {
  SelfxProductControl,
  SelfxProductControlsResponse,
} from "./selfx-product-controls.server";

type ClassificationActionData = {
  productActionError: string | null;
  productActionSuccess: string | null;
  classificationProducts?: SelfxProductControlsResponse;
  classificationProduct?: SelfxProductControl;
};

export function ProductClassificationModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const browse = useFetcher<ClassificationActionData>();
  const { submit } = browse;
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const loading = browse.state !== "idle";

  useEffect(() => {
    dialog.current?.showModal();
    submit({ intent: "listProductTypes", offset: "0" }, { method: "post" });
  }, [submit]);

  function loadPage(nextOffset: number, query = appliedSearch) {
    setOffset(nextOffset);
    setAppliedSearch(query);
    submit(
      { intent: "listProductTypes", offset: String(nextOffset), search: query },
      { method: "post" },
    );
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Product types"
      className="selfx-shopify-picker-modal selfx-shopify-classification-modal"
      onCancel={onClose}
    >
      <div className="selfx-shopify-picker-header">
        <s-heading>Product types</s-heading>
        <button
          className="selfx-shopify-header-refresh"
          aria-label="Close"
          title="Close"
          type="button"
          onClick={onClose}
        >
          <s-icon type="x" />
        </button>
      </div>
      <div className="selfx-shopify-picker-body">
        <form
          className="selfx-shopify-classification-search"
          onSubmit={(event) => {
            event.preventDefault();
            loadPage(0, search);
          }}
        >
          <input
            aria-label="Search products"
            placeholder="Search products"
            className="selfx-shopify-picker-input"
            maxLength={180}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            aria-label="Search"
            title="Search"
            className="selfx-shopify-header-refresh"
            disabled={loading}
            type="submit"
          >
            <s-icon type="search" />
          </button>
        </form>
        <div className="selfx-shopify-picker-list" aria-busy={loading}>
          {browse.data?.productActionError ? (
            <s-banner tone="critical">
              {browse.data.productActionError}
            </s-banner>
          ) : loading ? (
            <s-text>Loading products...</s-text>
          ) : browse.data?.classificationProducts?.data.length ? (
            browse.data.classificationProducts.data.map((product) => (
              <ProductClassificationRow key={product.id} product={product} />
            ))
          ) : (
            <s-text>No products found.</s-text>
          )}
        </div>
      </div>
      <div className="selfx-shopify-picker-footer">
        <s-text>Page {offset / 25 + 1}</s-text>
        <s-stack direction="inline" gap="small">
          <s-button
            accessibilityLabel="Previous page"
            icon="chevron-left"
            disabled={loading || offset === 0}
            onClick={() => loadPage(offset - 25)}
          />
          <s-button
            accessibilityLabel="Next page"
            icon="chevron-right"
            disabled={loading || !browse.data?.classificationProducts?.hasMore}
            onClick={() => loadPage(offset + 25)}
          />
        </s-stack>
      </div>
    </dialog>
  );
}

function ProductClassificationRow({
  product,
}: {
  product: SelfxProductControl;
}) {
  const save = useFetcher<ClassificationActionData>();
  const current = save.data?.classificationProduct ?? product;
  const [vertical, setVertical] = useState(product.productVertical);
  const [jewelleryType, setJewelleryType] = useState(
    product.jewelleryType ?? "",
  );
  const saving = save.state !== "idle";
  const dirty =
    vertical !== current.productVertical ||
    (vertical === "JEWELLERY" ? jewelleryType : null) !==
      (current.jewelleryType ?? null);

  return (
    <save.Form method="post" className="selfx-shopify-classification-row">
      <input type="hidden" name="intent" value="setProductKind" />
      <input
        type="hidden"
        name="externalProductId"
        value={product.externalProductId}
      />
      <div className="selfx-shopify-classification-product">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" />
        ) : (
          <s-icon type="product" />
        )}
        <strong>{product.name}</strong>
      </div>
      <div className="selfx-shopify-classification-controls">
        <select
          aria-label={`Product type for ${product.name}`}
          className="selfx-shopify-picker-select"
          name="productVertical"
          value={vertical}
          disabled={saving}
          onChange={(event) => setVertical(event.target.value)}
        >
          <option value="GARMENT">Garment</option>
          <option value="JEWELLERY">Jewellery</option>
        </select>
        {vertical === "JEWELLERY" ? (
          <select
            aria-label={`Jewellery type for ${product.name}`}
            className="selfx-shopify-picker-select"
            name="jewelleryType"
            value={jewelleryType}
            required
            disabled={saving}
            onChange={(event) => setJewelleryType(event.target.value)}
          >
            <option value="">Select type</option>
            <option value="RING">Ring</option>
            <option value="EARRING">Earrings</option>
            <option value="NECKLACE">Necklace</option>
            <option value="BRACELET">Bracelet</option>
          </select>
        ) : (
          <input type="hidden" name="jewelleryType" value="" />
        )}
        <s-button
          type="submit"
          variant="primary"
          disabled={
            saving || !dirty || (vertical === "JEWELLERY" && !jewelleryType)
          }
        >
          {saving ? "Saving" : "Save"}
        </s-button>
      </div>
      {save.data?.productActionError ? (
        <s-text tone="critical">{save.data.productActionError}</s-text>
      ) : null}
      {save.data?.productActionSuccess ? (
        <s-text tone="success">{save.data.productActionSuccess}</s-text>
      ) : null}
    </save.Form>
  );
}
