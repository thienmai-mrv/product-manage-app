/**
 * Pure catalog view for the dashboard.
 * Bucket boundaries and the non-excluding predicates live only in this module.
 */

export const SORT_OPTIONS = [
  { id: "best-sellers", label: "Best Sellers" },
  { id: "newest", label: "Newest" },
  { id: "price-desc", label: "Price:High-Low" },
  { id: "price-asc", label: "Price:Low-High" },
];

export const PRICE_RANGES = [
  { id: "below-100", label: "below $100", min: 0, max: 100 },
  { id: "100-199", label: "$100 to $199", min: 100, max: 200 },
  { id: "200-299", label: "$200 to $299", min: 200, max: 300 },
  { id: "300-399", label: "$300 to $399", min: 300, max: 400 },
  { id: "400-up", label: "$400 and up", min: 400, max: null },
];

const STORED_SORTS = new Set(["newest", "price-desc", "price-asc"]);

/**
 * Build the dashboard's initial in-memory filter state.
 * A reload starts from this object. Nothing here is written to the URL or storage.
 *
 * @return Filter state
 */
export function createFilterState() {
  return {
    sort: "newest",
    inStockOnly: false,
    priceRangeIds: [],
    brandIds: [],
    categoryIds: [],
    collapsed: {
      availability: false,
      price: false,
      brand: false,
      category: false,
    },
  };
}

/**
 * A product is in stock unless its stock flag is boolean false.
 * A missing flag stays in stock.
 *
 * @param product Catalog product
 * @return True when the product is in stock
 */
export function productIsInStock(product) {
  return product?.inStock !== false;
}

/**
 * Format a price as dollars with two decimals.
 *
 * @param price Stored price
 * @return Price text such as `$24.50`
 */
export function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

/**
 * Return the price-range id that contains a price, or null when it matches none.
 * Intervals are half-open except the open-ended top bucket.
 *
 * @param price Stored price
 * @return Range id or null
 */
export function priceBucket(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  for (const range of PRICE_RANGES) {
    if (range.max === null) {
      if (value >= range.min) {
        return range.id;
      }
      continue;
    }
    if (value >= range.min && value < range.max) {
      return range.id;
    }
  }
  return null;
}

/**
 * Count products in each price bucket.
 * Counts use the full list and ignore other filters.
 *
 * @param products Fetched products
 * @return Counts keyed by range id
 */
export function countPriceRanges(products) {
  const counts = Object.fromEntries(PRICE_RANGES.map((range) => [range.id, 0]));
  for (const product of products || []) {
    const bucket = priceBucket(product.price);
    if (bucket) {
      counts[bucket] += 1;
    }
  }
  return counts;
}

/**
 * Keep products that match the selected price ranges.
 * With no price range selected, price does not exclude products.
 * With no brand selected, brand does not exclude products.
 * With no category selected, category does not exclude products.
 *
 * @param products Fetched products
 * @param state Filter state
 * @return Matching products in fetched order
 */
export function filterProducts(products, state) {
  const selectedPrices = new Set(state.priceRangeIds || []);
  const selectedBrands = new Set(state.brandIds || []);
  const selectedCategories = new Set(state.categoryIds || []);
  return (products || []).filter((product) => {
    if (state.inStockOnly && !productIsInStock(product)) {
      return false;
    }
    if (selectedBrands.size > 0 && !selectedBrands.has(product.brandId)) {
      return false;
    }
    if (selectedCategories.size > 0 && !selectedCategories.has(product.categoryId)) {
      return false;
    }
    if (selectedPrices.size === 0) {
      return true;
    }
    const bucket = priceBucket(product.price);
    return bucket !== null && selectedPrices.has(bucket);
  });
}

/**
 * Compare product ids in ascending string order.
 *
 * @param left Product
 * @param right Product
 * @return Negative, zero, or positive
 */
function compareId(left, right) {
  const a = String(left.id ?? "");
  const b = String(right.id ?? "");
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Parse a createdAt timestamp. Unparseable values sort last.
 *
 * @param product Product
 * @return Milliseconds, or null
 */
function createdAtValue(product) {
  const time = Date.parse(product.createdAt);
  return Number.isFinite(time) ? time : null;
}

/**
 * Order a copy of the products.
 * Best Sellers keeps the fetched order.
 * The input array is never sorted in place.
 *
 * @param products Products to order
 * @param sort Sort id
 * @return New ordered array
 */
export function sortProducts(products, sort) {
  const copy = (products || []).slice();
  if (!STORED_SORTS.has(sort)) {
    return copy;
  }
  if (sort === "newest") {
    copy.sort((left, right) => {
      const a = createdAtValue(left);
      const b = createdAtValue(right);
      if (a === null && b === null) {
        return compareId(left, right);
      }
      if (a === null) {
        return 1;
      }
      if (b === null) {
        return -1;
      }
      if (a !== b) {
        return b - a;
      }
      return compareId(left, right);
    });
    return copy;
  }
  const direction = sort === "price-desc" ? -1 : 1;
  copy.sort((left, right) => {
    const a = Number(left.price);
    const b = Number(right.price);
    const aOk = Number.isFinite(a);
    const bOk = Number.isFinite(b);
    if (!aOk && !bOk) {
      return compareId(left, right);
    }
    if (!aOk) {
      return 1;
    }
    if (!bOk) {
      return -1;
    }
    if (a !== b) {
      return (a - b) * direction;
    }
    return compareId(left, right);
  });
  return copy;
}

/**
 * Build removable chips for the active availability, price, brand, and category filters.
 * Sort does not create a chip. Order is availability, then price ranges, then brands, then categories.
 *
 * @param state Filter state
 * @param categories Category records used for chip labels
 * @param brands Brand records used for chip labels
 * @return Chip models
 */
export function activeChips(state, categories = [], brands = []) {
  const chips = [];
  if (state.inStockOnly) {
    chips.push({
      key: "availability:in-stock",
      label: "In Stock Only",
      kind: "availability",
    });
  }
  const selectedPrices = new Set(state.priceRangeIds || []);
  for (const range of PRICE_RANGES) {
    if (selectedPrices.has(range.id)) {
      chips.push({
        key: `price:${range.id}`,
        label: range.label,
        kind: "price",
        id: range.id,
      });
    }
  }
  const selectedBrands = new Set(state.brandIds || []);
  const labeledBrands = new Set();
  for (const brand of brands) {
    if (selectedBrands.has(brand.id)) {
      labeledBrands.add(brand.id);
      chips.push({
        key: `brand:${brand.id}`,
        label: brand.name,
        kind: "brand",
        id: brand.id,
      });
    }
  }
  for (const id of state.brandIds || []) {
    if (!labeledBrands.has(id)) {
      chips.push({
        key: `brand:${id}`,
        label: id,
        kind: "brand",
        id,
      });
    }
  }
  const selectedCategories = new Set(state.categoryIds || []);
  const labeled = new Set();
  for (const category of categories) {
    if (selectedCategories.has(category.id)) {
      labeled.add(category.id);
      chips.push({
        key: `category:${category.id}`,
        label: category.name,
        kind: "category",
        id: category.id,
      });
    }
  }
  for (const id of state.categoryIds || []) {
    if (!labeled.has(id)) {
      chips.push({
        key: `category:${id}`,
        label: id,
        kind: "category",
        id,
      });
    }
  }
  return chips;
}

/**
 * Clear one chip and leave the other filters in place.
 *
 * @param state Filter state
 * @param chip Chip model from `activeChips`
 * @return Next filter state
 */
export function clearChip(state, chip) {
  if (chip.kind === "availability") {
    return { ...state, inStockOnly: false };
  }
  if (chip.kind === "price") {
    return {
      ...state,
      priceRangeIds: (state.priceRangeIds || []).filter((id) => id !== chip.id),
    };
  }
  if (chip.kind === "brand") {
    return {
      ...state,
      brandIds: (state.brandIds || []).filter((id) => id !== chip.id),
    };
  }
  if (chip.kind === "category") {
    return {
      ...state,
      categoryIds: (state.categoryIds || []).filter((id) => id !== chip.id),
    };
  }
  return state;
}

/**
 * Keep products that are visible on the storefront.
 * Only boolean false is unpublished. A missing flag stays included.
 *
 * @param products Fetched products
 * @return Published products in fetched order
 */
export function publishedCatalog(products) {
  return (Array.isArray(products) ? products : []).filter((product) => product.published !== false);
}

/**
 * Filter, sort, and split a fetched catalog for the dashboard.
 * Publish membership is applied before price filters, sorting, the featured split, and price counts.
 *
 * @param products Fetched products
 * @param state Filter state
 * @param categories Category records used for chip labels
 * @param brands Brand records used for chip labels
 * @return View model
 */
export function viewCatalog(products, state, categories = [], brands = []) {
  const list = publishedCatalog(products);
  const items = sortProducts(filterProducts(list, state), state.sort);
  const featured = items[0] ?? null;
  const cards = items.slice(1);
  return {
    items,
    featured,
    cards,
    count: items.length,
    catalogCount: list.length,
    priceCounts: countPriceRanges(list),
    chips: activeChips(state, categories, brands),
  };
}
