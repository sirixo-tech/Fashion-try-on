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
    id: "ivory-blouse",
    name: "Ivory Blouse",
    category: "WOMEN",
    type: "TOP",
    image: "ivory-blouse.webp",
  },
  {
    id: "black-wide-leg-trousers",
    name: "Black Wide-Leg Trousers",
    category: "WOMEN",
    type: "BOTTOM",
    image: "black-wide-leg-trousers.webp",
  },
  {
    id: "emerald-wrap-dress",
    name: "Emerald Wrap Dress",
    category: "WOMEN",
    type: "ONE_PIECE",
    image: "emerald-wrap-dress.webp",
  },
  {
    id: "blue-denim-jacket",
    name: "Blue Denim Jacket",
    category: "WOMEN",
    type: "TOP",
    image: "blue-denim-jacket.webp",
  },
  {
    id: "cream-cardigan",
    name: "Cream Cardigan",
    category: "WOMEN",
    type: "TOP",
    image: "cream-cardigan.webp",
  },
  {
    id: "cobalt-tunic",
    name: "Cobalt Tunic",
    category: "WOMEN",
    type: "TOP",
    image: "cobalt-tunic.webp",
  },
  {
    id: "floral-midi-skirt",
    name: "Floral Midi Skirt",
    category: "WOMEN",
    type: "BOTTOM",
    image: "floral-midi-skirt.webp",
  },
  {
    id: "white-linen-shirt",
    name: "White Linen Shirt",
    category: "WOMEN",
    type: "TOP",
    image: "white-linen-shirt.webp",
  },
  {
    id: "navy-overshirt",
    name: "Navy Overshirt",
    category: "MEN",
    type: "TOP",
    image: "navy-overshirt.webp",
  },
  {
    id: "charcoal-blazer",
    name: "Charcoal Blazer",
    category: "MEN",
    type: "TOP",
    image: "charcoal-blazer.webp",
  },
  {
    id: "mens-white-linen-shirt",
    name: "White Linen Shirt",
    category: "MEN",
    type: "TOP",
    image: "mens-white-linen-shirt.webp",
  },
  {
    id: "olive-bomber-jacket",
    name: "Olive Bomber Jacket",
    category: "MEN",
    type: "TOP",
    image: "olive-bomber-jacket.webp",
  },
  {
    id: "black-straight-jeans",
    name: "Black Straight Jeans",
    category: "MEN",
    type: "BOTTOM",
    image: "black-straight-jeans.webp",
  },
  {
    id: "beige-chinos",
    name: "Beige Chinos",
    category: "MEN",
    type: "BOTTOM",
    image: "beige-chinos.webp",
  },
  {
    id: "mens-denim-jacket",
    name: "Denim Jacket",
    category: "MEN",
    type: "TOP",
    image: "mens-denim-jacket.webp",
  },
  {
    id: "burgundy-polo",
    name: "Burgundy Polo",
    category: "MEN",
    type: "TOP",
    image: "burgundy-polo.webp",
  },
  {
    id: "heather-grey-hoodie",
    name: "Heather Grey Hoodie",
    category: "MEN",
    type: "TOP",
    image: "heather-grey-hoodie.webp",
  },
  {
    id: "sand-kurta",
    name: "Sand Kurta",
    category: "MEN",
    type: "TOP",
    image: "sand-kurta.webp",
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
  {
    id: "aisha",
    name: "Aisha",
    category: "WOMEN",
    image: "demo-model-aisha.webp",
  },
  {
    id: "zara",
    name: "Zara",
    category: "WOMEN",
    image: "demo-model-zara.webp",
  },
  {
    id: "kavya",
    name: "Kavya",
    category: "WOMEN",
    image: "demo-model-kavya.webp",
  },
  {
    id: "rhea",
    name: "Rhea",
    category: "WOMEN",
    image: "demo-model-rhea.webp",
  },
  {
    id: "nisha",
    name: "Nisha",
    category: "WOMEN",
    image: "demo-model-nisha.webp",
  },
  {
    id: "meera",
    name: "Meera",
    category: "WOMEN",
    image: "demo-model-meera.webp",
  },
  {
    id: "ananya",
    name: "Ananya",
    category: "WOMEN",
    image: "demo-model-ananya.webp",
  },
  {
    id: "priya",
    name: "Priya",
    category: "WOMEN",
    image: "demo-model-priya.webp",
  },
  {
    id: "tara",
    name: "Tara",
    category: "WOMEN",
    image: "demo-model-tara.webp",
  },
  {
    id: "kabir",
    name: "Kabir",
    category: "MEN",
    image: "demo-model-kabir.webp",
  },
  { id: "dev", name: "Dev", category: "MEN", image: "demo-model-dev.webp" },
  {
    id: "rohan",
    name: "Rohan",
    category: "MEN",
    image: "demo-model-rohan.webp",
  },
  {
    id: "vihaan",
    name: "Vihaan",
    category: "MEN",
    image: "demo-model-vihaan.webp",
  },
  {
    id: "imran",
    name: "Imran",
    category: "MEN",
    image: "demo-model-imran.webp",
  },
  {
    id: "ayaan",
    name: "Ayaan",
    category: "MEN",
    image: "demo-model-ayaan.webp",
  },
  { id: "neil", name: "Neil", category: "MEN", image: "demo-model-neil.webp" },
  {
    id: "sameer",
    name: "Sameer",
    category: "MEN",
    image: "demo-model-sameer.webp",
  },
  {
    id: "kiran",
    name: "Kiran",
    category: "MEN",
    image: "demo-model-kiran.webp",
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
