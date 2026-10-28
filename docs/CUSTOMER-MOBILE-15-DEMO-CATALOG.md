# CUSTOMER-MOBILE-15 — Shared demo outfits and models

Approved 28 October 2026. The signed-in customer app shows a small SelfX Demo collection in Home. It contains two women's garments, one men's garment, and two full-body demo models. Item cards open a product detail page with My Avatar selected by default and an optional demo model choice. Demo items are sample Try-On inputs, not merchant inventory or products for sale. Interests do not hide the other category.

The authenticated SelfX API returns the packaged allowlisted catalog. A selected garment or model is copied server-side into the customer's own consented, temporary Try-On session through the existing validated upload path. The client never supplies the chosen demo image bytes as trusted catalog data. Server item lookup rejects unknown IDs and Store sessions. This remains a personal Try-On using personal credits and ordinary seven-day input/30-day result retention; Store QR sessions continue to use Store products and allowances. One-off person and garment replacements do not edit the saved avatar or shared demo assets.

The three flat garment images and two neutral full-body model images were generated for this SelfX starter collection with the built-in imagegen tool. Bundled images are under `backend/api/assets/demo` and matching mobile display assets are in `mobile/assets/editorial`. Product IDs and image mappings are fixed in the API and app; adding/removing demo items requires a coordinated release. This slice adds no database table, merchant catalog rows, price, purchase action, jewellery Try-On or unlimited free generations.

## Rollout and verification

Deploy the API assets with the API build and release the rebuilt app together. The app shows a retry state if the catalog endpoint is unavailable. Verify the real provider accepts each garment/model pairing on a staging device before publishing. No production deployment or APK packaging is part of this source change.

Focused API tests cover the catalog assets, provider-input validation, Store isolation and authenticated HTTP routes (11 passed). Flutter tests cover selection, personal-credit request payloads, one-off replacement and product-detail navigation (12 focused; 62 related regression tests passed). The API build, Flutter analysis, affected-file lint and diff whitespace check passed. Provider pairing on a real staging device remains a release check.
