import assert from "node:assert/strict";
import test from "node:test";
import {
  COLORS,
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
    colorIds: [],
    ...overrides,
  };
}

test("option catalogs match the screenshot order", () => {
  assert.deepEqual(SORT_OPTIONS.map((option) => option.label), [
    "Best Sellers",
    "Newest",
    "Price:High-Low",
    "Price:Low-High",
    "Weight:Heavy-Light",
    "Weight:Light-Heavy",
  ]);
  assert.equal(SORT_OPTIONS.length, 6);
  assert.deepEqual(PRICE_RANGES.map((range) => range.label), [
    "below $100",
    "$100 to $199",
    "$200 to $299",
    "$300 to $399",
    "$400 and up",
  ]);
  assert.deepEqual(COLORS.map((color) => color.label), [
    "Black",
    "White",
    "Gold",
    "Silver",
    "Red",
    "Blue/Navy",
    "Green",
    "Yellow",
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

test("price counts ignore availability, color, and the selected ranges", () => {
  const products = [
    { id: "a", price: 10 },
    { id: "b", price: 20 },
    { id: "c", price: 30 },
    { id: "d", price: 150 },
  ];
  const filters = state({
    inStockOnly: true,
    priceRangeIds: ["below-100"],
    colorIds: ["gold"],
  });
  const view = viewCatalog(products, filters);
  assert.equal(view.priceCounts["100-199"], 1);
  assert.equal(view.priceCounts["below-100"], 3);
  assert.equal(view.count, 3);
});

test("in stock only keeps every product", () => {
  const matched = filterProducts(seed, state({ inStockOnly: true }));
  assert.deepEqual(matched.map((product) => product.id), seed.map((product) => product.id));
});

test("selecting every color keeps every product", () => {
  const matched = filterProducts(seed, state({
    colorIds: COLORS.map((color) => color.id),
  }));
  assert.deepEqual(matched.map((product) => product.id), seed.map((product) => product.id));
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

test("best sellers and weight sorts keep the fetched order", () => {
  const input = [
    { id: "z", price: 1 },
    { id: "a", price: 9 },
    { id: "m", price: 3 },
  ];
  const byPrice = sortProducts(input, "price-asc");
  assert.deepEqual(byPrice.map((product) => product.id), ["z", "m", "a"]);
  assert.notEqual(byPrice, input);

  for (const sort of ["best-sellers", "weight-desc", "weight-asc"]) {
    const ordered = sortProducts(input, sort);
    assert.deepEqual(ordered.map((product) => product.id), ["z", "a", "m"]);
    assert.notEqual(ordered, input);
  }
  assert.deepEqual(input.map((product) => product.id), ["z", "a", "m"]);
});

test("chips follow availability, price, then color, and clearing one removes only that chip", () => {
  const filters = state({
    sort: "price-desc",
    inStockOnly: true,
    priceRangeIds: ["400-up", "below-100"],
    colorIds: ["gold"],
  });
  const chips = activeChips(filters);
  assert.deepEqual(chips.map((chip) => chip.label), [
    "In Stock Only",
    "below $100",
    "$400 and up",
    "Gold",
  ]);
  assert.equal(chips.length, 4);

  const withoutPrice = activeChips(clearChip(filters, chips[1]));
  assert.deepEqual(withoutPrice.map((chip) => chip.label), [
    "In Stock Only",
    "$400 and up",
    "Gold",
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
