import assert from "node:assert/strict";
import test from "node:test";
import {
  PRICE_RANGES,
  SORT_OPTIONS,
  activeChips,
  clearChip,
  countPriceRanges,
  filterProducts,
  formatPrice,
  priceBucket,
  sortProducts,
  viewCatalog,
} from "./catalogView.js";

const seed = [
  {
    id: "prod-mouse",
    name: "Wireless Mouse",
    price: 24.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    categoryName: "Electronics",
  },
  {
    id: "prod-guide",
    name: "Field Guide",
    price: 18,
    createdAt: "2026-01-01T00:00:00.000Z",
    categoryName: "Books",
  },
  {
    id: "prod-lamp",
    name: "Desk Lamp",
    price: 39,
    createdAt: "2026-01-01T00:00:00.000Z",
    categoryName: "Home",
  },
];

function state(overrides = {}) {
  return {
    sort: "newest",
    inStockOnly: false,
    priceRangeIds: [],
    categoryIds: [],
    ...overrides,
  };
}

test("option catalogs match the screenshot order", () => {
  assert.deepEqual(SORT_OPTIONS.map((option) => option.label), [
    "Best Sellers",
    "Newest",
    "Price:High-Low",
    "Price:Low-High",
  ]);
  assert.equal(SORT_OPTIONS.length, 4);
  assert.deepEqual(PRICE_RANGES.map((range) => range.label), [
    "below $100",
    "$100 to $199",
    "$200 to $299",
    "$300 to $399",
    "$400 and up",
  ]);
});

test("price boundaries are half-open except the top bucket", () => {
  const cases = [
    [0, "below-100"],
    [99.99, "below-100"],
    [100, "100-199"],
    [199.99, "100-199"],
    [200, "200-299"],
    [299.99, "200-299"],
    [300, "300-399"],
    [399.99, "300-399"],
    [400, "400-up"],
    [1000, "400-up"],
  ];
  for (const [price, bucket] of cases) {
    assert.equal(priceBucket(price), bucket, String(price));
  }
  assert.equal(priceBucket(-1), null);
  assert.equal(priceBucket(Number.NaN), null);
  assert.equal(priceBucket("not-a-price"), null);
});

test("seed prices all fall below $100", () => {
  assert.equal(priceBucket(24.5), "below-100");
  assert.equal(priceBucket(18), "below-100");
  assert.equal(priceBucket(39), "below-100");
  assert.deepEqual(countPriceRanges(seed), {
    "below-100": 3,
    "100-199": 0,
    "200-299": 0,
    "300-399": 0,
    "400-up": 0,
  });
});

test("price ranges combine with OR", () => {
  const products = [
    { id: "cheap", price: 40 },
    { id: "mid", price: 150 },
    { id: "high", price: 450 },
  ];
  const matched = filterProducts(products, state({
    priceRangeIds: ["below-100", "400-up"],
  }));
  assert.deepEqual(matched.map((product) => product.id), ["cheap", "high"]);
});

test("price counts ignore availability, category, and the selected ranges", () => {
  const products = [
    { id: "a", price: 10, categoryId: "cat-a" },
    { id: "b", price: 20, categoryId: "cat-a" },
    { id: "c", price: 30, categoryId: "cat-a" },
    { id: "d", price: 150, categoryId: "cat-b" },
  ];
  const filters = state({
    inStockOnly: true,
    priceRangeIds: ["below-100"],
    categoryIds: ["cat-a"],
  });
  const view = viewCatalog(products, filters);
  assert.equal(view.priceCounts["100-199"], 1);
  assert.equal(view.priceCounts["below-100"], 3);
  assert.equal(view.count, 3);
});

test("in stock only keeps products that are not explicitly out of stock", () => {
  const products = [
    ...seed,
    { id: "gone", price: 12, inStock: false },
  ];
  const matched = filterProducts(products, state({ inStockOnly: true }));
  assert.deepEqual(matched.map((product) => product.id), seed.map((product) => product.id));
});

test("selecting categories keeps only those products", () => {
  const products = [
    { id: "tv", price: 10, categoryId: "cat-tv" },
    { id: "fridge", price: 20, categoryId: "cat-fridge" },
    { id: "lamp", price: 30, categoryId: "cat-home" },
  ];
  const matched = filterProducts(products, state({
    categoryIds: ["cat-tv", "cat-home"],
  }));
  assert.deepEqual(matched.map((product) => product.id), ["tv", "lamp"]);
});

test("newest orders by createdAt descending and breaks ties by id", () => {
  const products = [
    { id: "b", createdAt: "2020-01-01T00:00:00.000Z", price: 1 },
    { id: "c", createdAt: "2024-06-01T00:00:00.000Z", price: 1 },
    { id: "a", createdAt: "2024-06-01T00:00:00.000Z", price: 1 },
    { id: "d", createdAt: "not-a-date", price: 1 },
    { id: "e", price: 1 },
  ];
  const ordered = sortProducts(products, "newest");
  assert.deepEqual(ordered.map((product) => product.id), ["a", "c", "b", "d", "e"]);
  assert.deepEqual(products.map((product) => product.id), ["b", "c", "a", "d", "e"]);
});

test("price sorts are numeric, tie-break by id, and put non-finite prices last", () => {
  const products = [
    { id: "b", price: 10 },
    { id: "a", price: 10 },
    { id: "c", price: 5 },
    { id: "e", price: "nope" },
    { id: "d", price: Number.NaN },
  ];
  assert.deepEqual(
    sortProducts(products, "price-asc").map((product) => product.id),
    ["c", "a", "b", "d", "e"],
  );
  assert.deepEqual(
    sortProducts(products, "price-desc").map((product) => product.id),
    ["a", "b", "c", "d", "e"],
  );
  assert.deepEqual(products.map((product) => product.id), ["b", "a", "c", "e", "d"]);
});

test("best sellers keeps the fetched order", () => {
  const input = [
    { id: "z", price: 1 },
    { id: "a", price: 9 },
    { id: "m", price: 3 },
  ];
  const byPrice = sortProducts(input, "price-asc");
  assert.deepEqual(byPrice.map((product) => product.id), ["z", "m", "a"]);
  assert.notEqual(byPrice, input);

  const ordered = sortProducts(input, "best-sellers");
  assert.deepEqual(ordered.map((product) => product.id), ["z", "a", "m"]);
  assert.notEqual(ordered, input);
  assert.deepEqual(input.map((product) => product.id), ["z", "a", "m"]);
});

test("chips follow availability, price, then category, and clearing one removes only that chip", () => {
  const filters = state({
    sort: "price-desc",
    inStockOnly: true,
    priceRangeIds: ["400-up", "below-100"],
    categoryIds: ["cat-home", "cat-tv"],
  });
  const categories = [
    { id: "cat-tv", name: "Tivi" },
    { id: "cat-home", name: "Home" },
  ];
  const chips = activeChips(filters, categories);
  assert.deepEqual(chips.map((chip) => chip.label), [
    "In Stock Only",
    "below $100",
    "$400 and up",
    "Tivi",
    "Home",
  ]);
  assert.equal(chips.length, 5);

  const withoutPrice = activeChips(clearChip(filters, chips[1]), categories);
  assert.deepEqual(withoutPrice.map((chip) => chip.label), [
    "In Stock Only",
    "$400 and up",
    "Tivi",
    "Home",
  ]);
  assert.deepEqual(filters.priceRangeIds, ["400-up", "below-100"]);
});

test("viewCatalog splits the featured product from the remaining cards", () => {
  const view = viewCatalog(seed, state());
  assert.equal(view.featured, view.items[0]);
  assert.deepEqual(view.cards, view.items.slice(1));
  assert.equal(view.count, view.items.length);
  assert.equal(view.count, view.cards.length + 1);

  const empty = viewCatalog([], state());
  assert.equal(empty.featured, null);
  assert.equal(empty.cards.length, 0);
  assert.equal(empty.count, 0);
});

test("formatPrice uses two decimals", () => {
  assert.equal(formatPrice(24.5), "$24.50");
  assert.equal(formatPrice(18), "$18.00");
});

test("unpublished products drop out of the featured tile, cards, count, and price counts", () => {
  const products = [
    { id: "hidden", price: 10, published: false, createdAt: "2026-03-01T00:00:00.000Z" },
    { id: "shown", price: 20, published: true, createdAt: "2026-02-01T00:00:00.000Z" },
    { id: "legacy", price: 150, createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  const view = viewCatalog(products, state());
  assert.equal(view.catalogCount, 2);
  assert.equal(view.count, 2);
  assert.equal(view.featured.id, "shown");
  assert.deepEqual(view.cards.map((product) => product.id), ["legacy"]);
  assert.equal(view.priceCounts["below-100"], 1);
  assert.equal(view.priceCounts["100-199"], 1);
  assert.equal(view.items.some((product) => product.id === "hidden"), false);
  assert.equal(view.items.some((product) => product.id === "legacy"), true);
});

test("price counts still ignore stock, category, and selected ranges after publish filtering", () => {
  const products = [
    { id: "draft-cheap", price: 10, published: false },
    { id: "shown-cheap", price: 20 },
    { id: "shown-mid", price: 30, published: true },
    { id: "draft-mid", price: 150, published: false },
  ];
  const view = viewCatalog(products, state({
    inStockOnly: true,
    priceRangeIds: ["below-100"],
    categoryIds: ["cat-other"],
  }));
  assert.equal(view.priceCounts["below-100"], 2);
  assert.equal(view.priceCounts["100-199"], 0);
  assert.equal(view.count, 0);
  assert.equal(view.catalogCount, 2);
});

test("filterProducts still returns an unpublished product", () => {
  const products = [{ id: "hidden", price: 10, published: false }];
  assert.deepEqual(
    filterProducts(products, state()).map((product) => product.id),
    ["hidden"],
  );
});

test("in stock only does not bring an unpublished product back", () => {
  const products = [
    { id: "hidden", price: 10, published: false },
    { id: "shown", price: 20, published: true },
  ];
  const view = viewCatalog(products, state({ inStockOnly: true }));
  assert.deepEqual(view.items.map((product) => product.id), ["shown"]);
  assert.equal(view.count, 1);
  assert.equal(view.catalogCount, 1);
});

test("missing or empty brandIds keeps products with and without a brand", () => {
  const products = [
    { id: "with", brandId: "brand-samsung", price: 10 },
    { id: "without", price: 12 },
    { id: "blank", brandId: "", price: 14 },
  ];
  assert.deepEqual(
    filterProducts(products, state()).map((product) => product.id),
    ["with", "without", "blank"],
  );
  assert.deepEqual(
    filterProducts(products, state({ brandIds: [] })).map((product) => product.id),
    ["with", "without", "blank"],
  );
});

test("selected brands keep the OR union and drop a product with a missing brandId", () => {
  const products = [
    { id: "samsung", brandId: "brand-samsung", price: 10 },
    { id: "sony", brandId: "brand-sony", price: 20 },
    { id: "lg", brandId: "brand-lg", price: 30 },
    { id: "missing", price: 40 },
  ];
  assert.deepEqual(
    filterProducts(products, state({ brandIds: ["brand-samsung", "brand-sony"] })).map((product) => product.id),
    ["samsung", "sony"],
  );
});

test("a brand selection and a category selection keep only products that match both", () => {
  const products = [
    { id: "both", brandId: "brand-samsung", categoryId: "cat-tv", price: 10 },
    { id: "brand-only", brandId: "brand-samsung", categoryId: "cat-home", price: 20 },
    { id: "category-only", brandId: "brand-sony", categoryId: "cat-tv", price: 30 },
  ];
  assert.deepEqual(
    filterProducts(products, state({
      brandIds: ["brand-samsung"],
      categoryIds: ["cat-tv"],
    })).map((product) => product.id),
    ["both"],
  );
});

test("price counts stay on the whole published list when brandIds is set", () => {
  const products = [
    { id: "cheap", price: 10, brandId: "brand-samsung", published: true },
    { id: "mid", price: 150, brandId: "brand-sony", published: true },
    { id: "draft", price: 10, brandId: "brand-samsung", published: false },
  ];
  const view = viewCatalog(products, state({ brandIds: ["brand-samsung"] }));
  assert.equal(view.priceCounts["below-100"], 1);
  assert.equal(view.priceCounts["100-199"], 1);
  assert.equal(view.count, 1);
  assert.equal(view.items[0].id, "cheap");
});

test("chips follow availability, price ranges, brand names, then category names", () => {
  const filters = state({
    inStockOnly: true,
    priceRangeIds: ["below-100"],
    brandIds: ["brand-sony", "brand-missing", "brand-samsung"],
    categoryIds: ["cat-home"],
  });
  const categories = [{ id: "cat-home", name: "Home" }];
  const brands = [
    { id: "brand-samsung", name: "Samsung" },
    { id: "brand-sony", name: "Sony" },
  ];
  const chips = activeChips(filters, categories, brands);
  assert.deepEqual(chips.map((chip) => chip.label), [
    "In Stock Only",
    "below $100",
    "Samsung",
    "Sony",
    "brand-missing",
    "Home",
  ]);

  const withoutBrand = activeChips(clearChip(filters, chips[2]), categories, brands);
  assert.deepEqual(withoutBrand.map((chip) => chip.label), [
    "In Stock Only",
    "below $100",
    "Sony",
    "brand-missing",
    "Home",
  ]);
  assert.deepEqual(filters.brandIds, ["brand-sony", "brand-missing", "brand-samsung"]);
  assert.equal(filters.inStockOnly, true);
  assert.deepEqual(filters.priceRangeIds, ["below-100"]);
  assert.deepEqual(filters.categoryIds, ["cat-home"]);
});

test("viewCatalog omits an unpublished product even when its brandId is selected", () => {
  const products = [
    { id: "hidden", price: 10, published: false, brandId: "brand-samsung" },
    { id: "shown", price: 20, published: true, brandId: "brand-sony" },
  ];
  const filters = state({ brandIds: ["brand-samsung"] });
  const view = viewCatalog(products, filters);
  assert.equal(view.items.some((product) => product.id === "hidden"), false);
  assert.equal(view.count, 0);
  assert.deepEqual(
    filterProducts(products, filters).map((product) => product.id),
    ["hidden"],
  );
});

test("a negative or non-finite price stays visible until a price range is selected", () => {
  const products = [
    { id: "ok", price: 12 },
    { id: "bad", price: -5 },
  ];
  assert.deepEqual(
    filterProducts(products, state()).map((product) => product.id),
    ["ok", "bad"],
  );
  assert.deepEqual(
    filterProducts(products, state({ priceRangeIds: ["below-100"] })).map((product) => product.id),
    ["ok"],
  );
  assert.equal(countPriceRanges(products)["below-100"], 1);
});
