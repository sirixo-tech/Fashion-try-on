import { PrismaClient } from "@prisma/client";

import { createSelfxId } from "./uuid.js";

type Audience = "MEN" | "WOMEN" | "UNISEX";
type GarmentIntent = "TOP" | "BOTTOM" | "ONE_PIECE" | "FULL_OUTFIT";

type CategorySeed = {
  audience: Audience;
  name: string;
  slug: string;
  sortOrder: number;
};

type ProductSeed = {
  audience: Audience;
  categorySlug: string;
  name: string;
  slug: string;
  description: string;
  garmentIntent: GarmentIntent;
  garmentCategory: "TOP" | "BOTTOM" | "ONE_PIECE";
  sortOrder: number;
};

const prisma = new PrismaClient();

const imagePrefix =
  process.env.SELFX_SEED_CATALOG_IMAGE_PREFIX?.replace(/^\/+|\/+$/g, "") ??
  "catalog/defaults";

const categories: CategorySeed[] = [
  { audience: "MEN", name: "Shirts", slug: "shirts", sortOrder: 10 },
  { audience: "MEN", name: "T-Shirts", slug: "t-shirts", sortOrder: 20 },
  { audience: "MEN", name: "Jackets", slug: "jackets", sortOrder: 30 },
  { audience: "MEN", name: "Trousers", slug: "trousers", sortOrder: 40 },
  { audience: "WOMEN", name: "Tops", slug: "tops", sortOrder: 10 },
  { audience: "WOMEN", name: "T-Shirts", slug: "t-shirts", sortOrder: 20 },
  { audience: "WOMEN", name: "Jackets", slug: "jackets", sortOrder: 30 },
  { audience: "WOMEN", name: "Dresses", slug: "dresses", sortOrder: 40 },
  { audience: "WOMEN", name: "Trousers", slug: "trousers", sortOrder: 50 },
];

const products: ProductSeed[] = [
  product("MEN", "shirts", "White Oxford Shirt", "white-oxford-shirt", "Classic white button-down shirt.", "TOP", "TOP", 10),
  product("MEN", "shirts", "Blue Casual Shirt", "blue-casual-shirt", "Light blue casual long-sleeve shirt.", "TOP", "TOP", 20),
  product("MEN", "shirts", "Black Formal Shirt", "black-formal-shirt", "Black formal shirt for evening looks.", "TOP", "TOP", 30),
  product("MEN", "t-shirts", "White Crew Neck T-Shirt", "white-crew-neck-t-shirt", "Plain white crew neck cotton T-shirt.", "TOP", "TOP", 10),
  product("MEN", "t-shirts", "Black Crew Neck T-Shirt", "black-crew-neck-t-shirt", "Plain black crew neck cotton T-shirt.", "TOP", "TOP", 20),
  product("MEN", "t-shirts", "Navy T-Shirt", "navy-t-shirt", "Navy everyday short-sleeve T-shirt.", "TOP", "TOP", 30),
  product("MEN", "jackets", "Black Jacket", "black-jacket", "Black casual zip jacket.", "TOP", "TOP", 10),
  product("MEN", "jackets", "Denim Jacket", "denim-jacket", "Classic blue denim jacket.", "TOP", "TOP", 20),
  product("MEN", "trousers", "Black Trousers", "black-trousers", "Black straight-fit trousers.", "BOTTOM", "BOTTOM", 10),
  product("MEN", "trousers", "Beige Trousers", "beige-trousers", "Beige casual trousers.", "BOTTOM", "BOTTOM", 20),
  product("WOMEN", "tops", "White Top", "white-top", "Simple white everyday top.", "TOP", "TOP", 10),
  product("WOMEN", "tops", "Black Top", "black-top", "Simple black everyday top.", "TOP", "TOP", 20),
  product("WOMEN", "tops", "Casual Blouse", "casual-blouse", "Soft casual blouse.", "TOP", "TOP", 30),
  product("WOMEN", "t-shirts", "White T-Shirt", "white-t-shirt", "Plain white short-sleeve T-shirt.", "TOP", "TOP", 10),
  product("WOMEN", "t-shirts", "Black T-Shirt", "black-t-shirt", "Plain black short-sleeve T-shirt.", "TOP", "TOP", 20),
  product("WOMEN", "jackets", "Black Jacket", "black-jacket", "Black casual jacket.", "TOP", "TOP", 10),
  product("WOMEN", "jackets", "Denim Jacket", "denim-jacket", "Classic blue denim jacket.", "TOP", "TOP", 20),
  product("WOMEN", "dresses", "Black Dress", "black-dress", "Black one-piece dress.", "ONE_PIECE", "ONE_PIECE", 10),
  product("WOMEN", "dresses", "Casual Dress", "casual-dress", "Casual day dress.", "ONE_PIECE", "ONE_PIECE", 20),
  product("WOMEN", "trousers", "Black Trousers", "black-trousers", "Black straight-fit trousers.", "BOTTOM", "BOTTOM", 10),
  product("WOMEN", "trousers", "Beige Trousers", "beige-trousers", "Beige casual trousers.", "BOTTOM", "BOTTOM", 20),
];

async function main() {
  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const catalogKey = categoryKey(category.audience, category.slug);
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO product_categories (
        id,
        catalog_key,
        scope,
        organization_id,
        name,
        slug,
        audience,
        active,
        sort_order
      )
      VALUES (
        ${createSelfxId()}::uuid,
        ${catalogKey},
        'PLATFORM_DEFAULT'::"CatalogProductScope",
        NULL,
        ${category.name},
        ${category.slug},
        ${category.audience},
        true,
        ${category.sortOrder}
      )
      ON CONFLICT (catalog_key) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        audience = EXCLUDED.audience,
        active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `;
    categoryIds.set(catalogKey, row.id);
  }

  for (const item of products) {
    const categoryId = categoryIds.get(
      categoryKey(item.audience, item.categorySlug),
    );
    if (!categoryId) {
      throw new Error(`Missing category for ${item.audience}/${item.categorySlug}`);
    }
    const catalogKey = productKey(item.audience, item.slug);
    await prisma.$executeRaw`
      INSERT INTO products (
        id,
        catalog_key,
        scope,
        organization_id,
        category_id,
        name,
        slug,
        description,
        audience,
        active,
        vto_enabled,
        sort_order,
        garment_intent,
        garment_category,
        garment_photo_type,
        image_storage_key,
        image_content_type
      )
      VALUES (
        ${createSelfxId()}::uuid,
        ${catalogKey},
        'PLATFORM_DEFAULT'::"CatalogProductScope",
        NULL,
        ${categoryId}::uuid,
        ${item.name},
        ${item.slug},
        ${item.description},
        ${item.audience},
        true,
        true,
        ${item.sortOrder},
        ${item.garmentIntent},
        ${item.garmentCategory},
        'AUTO',
        ${imageKey(item)},
        'image/png'
      )
      ON CONFLICT (catalog_key) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        description = EXCLUDED.description,
        audience = EXCLUDED.audience,
        active = EXCLUDED.active,
        vto_enabled = EXCLUDED.vto_enabled,
        sort_order = EXCLUDED.sort_order,
        garment_intent = EXCLUDED.garment_intent,
        garment_category = EXCLUDED.garment_category,
        garment_photo_type = EXCLUDED.garment_photo_type,
        image_storage_key = EXCLUDED.image_storage_key,
        image_content_type = EXCLUDED.image_content_type,
        updated_at = CURRENT_TIMESTAMP
    `;
  }
}

function product(
  audience: Audience,
  categorySlug: string,
  name: string,
  slug: string,
  description: string,
  garmentIntent: GarmentIntent,
  garmentCategory: "TOP" | "BOTTOM" | "ONE_PIECE",
  sortOrder: number,
): ProductSeed {
  return {
    audience,
    categorySlug,
    name,
    slug,
    description,
    garmentIntent,
    garmentCategory,
    sortOrder,
  };
}

function categoryKey(audience: Audience, slug: string): string {
  return `platform:category:${audience.toLowerCase()}:${slug}`;
}

function productKey(audience: Audience, slug: string): string {
  return `platform:product:${audience.toLowerCase()}:${slug}`;
}

function imageKey(item: ProductSeed): string {
  return [
    imagePrefix,
    item.audience.toLowerCase(),
    item.categorySlug,
    `${item.slug}.png`,
  ].join("/");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
