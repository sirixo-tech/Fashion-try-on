# SelfX Default Catalog Assets

This directory is the local source path for the seeded `PLATFORM_DEFAULT`
catalog garment images.

The seeded database rows already point at object storage keys under
`catalog/defaults/...`. Place real garment-only PNG files at the paths listed in
`default-catalog-assets.json`, then sync them to object storage with:

```bash
npm run catalog:assets:sync
```

Rules for supplied files:

- use real garment/product imagery, not icons, logos, color blocks, or layout placeholders;
- keep one clear garment centered with good lighting and minimal obstruction;
- use PNG files because the current seed stores `image_content_type = image/png`;
- keep the local path and storage key unchanged unless the seed is changed in the same release.

The sync script uploads bytes only. It does not create products, duplicate
catalog rows, or store image data in PostgreSQL.
