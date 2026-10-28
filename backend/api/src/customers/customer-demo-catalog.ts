import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ApiErrorException } from "../common/api-error.exception.js";

export const DEMO_PRODUCTS = [
  {
    id: "terracotta-blazer",
    name: "Terracotta Blazer",
    category: "WOMEN",
    type: "TOP",
    image: "terracotta-blazer.webp",
  },
  {
    id: "burgundy-dress",
    name: "Burgundy Midi Dress",
    category: "WOMEN",
    type: "ONE_PIECE",
    image: "burgundy-dress.webp",
  },
  {
    id: "navy-overshirt",
    name: "Navy Overshirt",
    category: "MEN",
    type: "TOP",
    image: "navy-overshirt.webp",
  },
] as const;

export const DEMO_MODELS = [
  {
    id: "muse",
    name: "Maya",
    category: "WOMEN",
    image: "demo-model-maya.webp",
  },
  {
    id: "tailored",
    name: "Arjun",
    category: "MEN",
    image: "demo-model-arjun.webp",
  },
] as const;

export function demoCatalog() {
  return {
    products: DEMO_PRODUCTS.map(({ id, name, category, type }) => ({
      id,
      name,
      category,
      type,
    })),
    models: DEMO_MODELS.map(({ id, name, category }) => ({
      id,
      name,
      category,
    })),
  };
}

export async function demoImage(kind: "PERSON" | "GARMENT", id: string) {
  const entry =
    kind === "PERSON"
      ? DEMO_MODELS.find((model) => model.id === id)
      : DEMO_PRODUCTS.find((product) => product.id === id);
  if (!entry)
    throw new ApiErrorException(
      404,
      "DEMO_ITEM_NOT_FOUND",
      "This demo item is unavailable.",
    );
  // The identifier is resolved through the allowlist above, never used as a path.
  return readFile(resolve(__dirname, "../../assets/demo", entry.image));
}
