# CUSTOMER-MOBILE-15 — Shared demo outfits and models

Approved 28 October 2026. The signed-in customer app shows a SelfX Demo collection in Home. The current collection has ten women's garments, ten men's garments, and ten full-body demo models for each category. Item cards open a product detail page with a saved full-body reference used implicitly when available, an explicit one-off photo upload action, and category-matched demo model choices. Demo items are sample Try-On inputs, not merchant inventory or products for sale. Interests do not hide the other category.

The authenticated SelfX API returns the packaged allowlisted catalog. A selected garment or model is copied server-side into the customer's own consented, temporary Try-On session through the existing validated upload path. The client never supplies the chosen demo image bytes as trusted catalog data. Server item lookup rejects unknown IDs and Store sessions. This remains a personal Try-On using personal credits and ordinary seven-day input/30-day result retention; Store QR sessions continue to use Store products and allowances. One-off person and garment replacements do not edit the saved avatar or shared demo assets.

The flat garment images and neutral full-body model images were generated for this SelfX collection with the built-in imagegen tool. Bundled images are under `backend/api/assets/demo` and matching mobile display assets are in `mobile/assets/editorial`. Product IDs and image mappings are fixed in the API and app; adding/removing demo items requires a coordinated release. This slice adds no database table, merchant catalog rows, price, purchase action, jewellery Try-On or unlimited free generations.

## Rollout and verification

Deploy the API assets with the API build and release the rebuilt app together. The app shows a retry state if the catalog endpoint is unavailable. Verify the real provider accepts each garment/model pairing on a staging device before publishing. No production deployment or APK packaging is part of this source change.

The initial slice passed focused API and Flutter tests for catalog selection, Store isolation, credits and product-detail navigation. This expansion passed the focused catalog asset/count tests, Flutter analysis and a diff whitespace check. Provider pairing on a real staging device remains a release check.
