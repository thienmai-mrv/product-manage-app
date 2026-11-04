import { randomUUID } from "node:crypto";
import { Binary, MongoClient } from "mongodb";
import { parseInStock, parsePublished, resolveProductImage } from "./productInput.js";

const nameCollation = { locale: "en", strength: 2 };
let indexesReady = false;

/**
 * Create an HTTP-style error the API layer can turn into a status code.
 *
 * @param status HTTP status
 * @param message Error text
 * @return Error with a status
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Resolve the Mongo database name.
 *
 * @param env Worker or local environment
 * @return Database name
 */
function databaseName(env) {
  return env.MONGODB_DB || "productmanage";
}

/**
 * Run one database call with a fresh client.
 * Workers cancel sockets when a request ends, so a cached client would block the next request.
 *
 * @param env Worker or local environment
 * @param fn Callback that receives the database
 * @return Callback result
 */
async function withDatabase(env, fn) {
  if (!env?.MONGODB_URI) {
    throw httpError(500, "MONGODB_URI is not set");
  }
  const client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 20000,
  });
  try {
    await client.connect();
    const db = client.db(databaseName(env));
    await ensureIndexes(db);
    await ensureSeed(db);
    return await fn(db);
  } finally {
    await client.close(true);
  }
}

/**
 * Create the category and brand name indexes once in this isolate.
 * The ready flag is set only after both indexes succeed, so a failed brand index is retried.
 *
 * @param db Mongo database
 */
async function ensureIndexes(db) {
  if (indexesReady) {
    return;
  }
  await db.collection("categories").createIndex(
    { name: 1 },
    { unique: true, collation: nameCollation, name: "category_name_ci" },
  );
  await db.collection("brands").createIndex(
    { name: 1 },
    { unique: true, collation: nameCollation, name: "brand_name_ci" },
  );
  indexesReady = true;
}

const sampleBrands = [
  { _id: "brand-samsung", name: "Samsung" },
  { _id: "brand-sony", name: "Sony" },
  { _id: "brand-lg", name: "LG" },
  { _id: "brand-panasonic", name: "Panasonic" },
  { _id: "brand-toshiba", name: "Toshiba" },
  { _id: "brand-apple", name: "Apple" },
  { _id: "brand-electrolux", name: "Electrolux" },
  { _id: "brand-daikin", name: "Daikin" },
  { _id: "brand-sharp", name: "Sharp" },
  { _id: "brand-casper", name: "Casper" },
];

/**
 * Insert the ten sample brands when the brands collection is empty.
 * Timestamps are one second apart so Samsung is newest.
 *
 * @param db Mongo database
 */
async function ensureBrandSeed(db) {
  const brands = db.collection("brands");
  if (await brands.countDocuments() > 0) {
    return;
  }
  const newest = Date.now();
  try {
    await brands.insertMany(sampleBrands.map((brand, index) => ({
      _id: brand._id,
      name: brand.name,
      description: "",
      createdAt: new Date(newest - index * 1000).toISOString(),
    })));
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
}

/**
 * Resolve a starter product brand.
 * A missing name uses the newest brand. The caller has already confirmed one brand exists.
 *
 * @param brands Brand collection
 * @param name Brand name
 * @param newestId Newest brand id
 * @return Brand id
 */
async function starterBrandId(brands, name, newestId) {
  const found = await findBrandByName(brands, name);
  return found?._id ?? newestId;
}

/**
 * Insert sample brands, then the starter catalog when both category and product collections are empty.
 *
 * @param db Mongo database
 */
async function ensureSeed(db) {
  await ensureBrandSeed(db);
  const categories = db.collection("categories");
  const products = db.collection("products");
  const [categoryCount, productCount] = await Promise.all([
    categories.countDocuments(),
    products.countDocuments(),
  ]);
  if (categoryCount > 0 || productCount > 0) {
    return;
  }
  const brands = db.collection("brands");
  const newestList = await brands.find().sort({ createdAt: -1 }).toArray();
  const newest = newestList[0];
  if (!newest) {
    return;
  }
  const mouseBrandId = await starterBrandId(brands, "Samsung", newest._id);
  const guideBrandId = await starterBrandId(brands, "Sony", newest._id);
  const lampBrandId = await starterBrandId(brands, "Panasonic", newest._id);
  const now = new Date().toISOString();
  try {
    await categories.insertMany([
      { _id: "cat-electronics", name: "Electronics", description: "Devices and accessories", createdAt: now },
      { _id: "cat-books", name: "Books", description: "Printed and digital books", createdAt: now },
      { _id: "cat-home", name: "Home", description: "Household goods", createdAt: now },
    ]);
    await products.insertMany([
      {
        _id: "prod-mouse",
        name: "Wireless Mouse",
        sku: "EL-100",
        price: 24.5,
        brandId: mouseBrandId,
        categoryId: "cat-electronics",
        description: "Compact Bluetooth mouse",
        imageUrl: "",
        quantity: 10,
        published: true,
        inStock: true,
        createdAt: now,
      },
      {
        _id: "prod-guide",
        name: "Field Guide",
        sku: "BK-015",
        price: 18,
        brandId: guideBrandId,
        categoryId: "cat-books",
        description: "Illustrated pocket guide",
        imageUrl: "",
        quantity: 8,
        published: true,
        inStock: true,
        createdAt: now,
      },
      {
        _id: "prod-lamp",
        name: "Desk Lamp",
        sku: "HM-220",
        price: 39,
        brandId: lampBrandId,
        categoryId: "cat-home",
        description: "Adjustable LED lamp",
        imageUrl: "",
        quantity: 5,
        published: true,
        inStock: true,
        createdAt: now,
      },
    ]);
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
}

/**
 * Require a non-empty trimmed string.
 *
 * @param value Raw value
 * @param label Field label
 * @return Trimmed string
 */
function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw httpError(400, `${label} is required`);
  }
  return text;
}

/**
 * Read an optional trimmed string.
 *
 * @param value Raw value
 * @return Trimmed string
 */
function optionalText(value) {
  return String(value ?? "").trim();
}

/**
 * Read a price that is zero or greater.
 *
 * @param value Raw price
 * @return Price number
 */
function requiredPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw httpError(400, "Price must be a number that is zero or greater");
  }
  return Math.round(price * 100) / 100;
}

/**
 * Read a stock quantity that is a whole number and zero or greater.
 *
 * @param value Raw quantity
 * @return Quantity
 */
function requiredQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw httpError(400, "Quantity must be a whole number that is zero or greater");
  }
  return quantity;
}

/**
 * Turn a duplicate-key error into a name conflict.
 *
 * @param error Caught error
 * @param message Conflict text
 */
function rethrowDuplicate(error, message) {
  if (error?.code === 11000) {
    throw httpError(409, message);
  }
  throw error;
}

/**
 * Map a category document to an API item.
 *
 * @param doc Category document
 * @param productCount Products in the category
 * @return Category item
 */
function toCategory(doc, productCount) {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description ?? "",
    createdAt: doc.createdAt,
    ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
    productCount,
  };
}

/**
 * Map a product document to an API item.
 * A missing brand id or a missing brand document reads back as empty strings.
 *
 * @param doc Product document
 * @param categories Category documents
 * @param brands Brand documents
 * @return Product item
 */
function toProduct(doc, categories, brands) {
  const category = categories.find((item) => item._id === doc.categoryId);
  const brand = (brands || []).find((item) => item._id === doc.brandId);
  return {
    id: doc._id,
    name: doc.name,
    sku: doc.sku ?? "",
    price: doc.price,
    brandId: doc.brandId ?? "",
    brandName: brand?.name || "",
    categoryId: doc.categoryId,
    categoryName: category?.name || "",
    description: doc.description ?? "",
    imageUrl: doc.imageUrl ?? "",
    published: doc.published !== false,
    inStock: doc.inStock !== false,
    quantity: Number.isInteger(doc.quantity) ? doc.quantity : 0,
    createdAt: doc.createdAt,
    ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
  };
}

/**
 * Find a category with the same name, ignoring letter case.
 *
 * @param categories Category collection
 * @param name Category name
 * @param exceptId Id to ignore
 * @return Matching document, or null
 */
function findCategoryByName(categories, name, exceptId) {
  const query = exceptId ? { name, _id: { $ne: exceptId } } : { name };
  return categories.findOne(query, { collation: nameCollation });
}

/**
 * Find a brand with the same name, ignoring letter case.
 *
 * @param brands Brand collection
 * @param name Brand name
 * @param exceptId Id to ignore
 * @return Matching document, or null
 */
function findBrandByName(brands, name, exceptId) {
  const query = exceptId ? { name, _id: { $ne: exceptId } } : { name };
  return brands.findOne(query, { collation: nameCollation });
}

/**
 * List categories with a product count.
 *
 * @param env Worker or local environment
 * @return Category rows
 */
export function listCategories(env) {
  return withDatabase(env, async (db) => {
    const categories = await db.collection("categories").find().sort({ createdAt: -1 }).toArray();
    const products = await db.collection("products").find({}, { projection: { categoryId: 1 } }).toArray();
    return categories.map((category) => toCategory(
      category,
      products.filter((product) => product.categoryId === category._id).length,
    ));
  });
}

/**
 * List products with the category name filled in.
 *
 * @param env Worker or local environment
 * @return Product rows
 */
export function listProducts(env) {
  return withDatabase(env, async (db) => {
    const [products, categories, brands] = await Promise.all([
      db.collection("products").find().sort({ createdAt: -1 }).toArray(),
      db.collection("categories").find().toArray(),
      db.collection("brands").find().toArray(),
    ]);
    return products.map((product) => toProduct(product, categories, brands));
  });
}

/**
 * Create a category.
 *
 * @param env Worker or local environment
 * @param input Name and description
 * @return Created category
 */
export function addCategory(env, input) {
  return withDatabase(env, async (db) => {
    const categories = db.collection("categories");
    const name = requiredText(input?.name, "Name");
    if (await findCategoryByName(categories, name)) {
      throw httpError(409, "A category with that name already exists");
    }
    const category = {
      _id: randomUUID(),
      name,
      description: optionalText(input?.description),
      createdAt: new Date().toISOString(),
    };
    try {
      await categories.insertOne(category);
    } catch (error) {
      rethrowDuplicate(error, "A category with that name already exists");
    }
    return toCategory(category, 0);
  });
}

/**
 * Update a category.
 *
 * @param env Worker or local environment
 * @param id Category id
 * @param input Name and description
 * @return Updated category
 */
export function updateCategory(env, id, input) {
  return withDatabase(env, async (db) => {
    const categories = db.collection("categories");
    const current = await categories.findOne({ _id: id });
    if (!current) {
      throw httpError(404, "Category not found");
    }
    const name = requiredText(input?.name, "Name");
    if (await findCategoryByName(categories, name, id)) {
      throw httpError(409, "A category with that name already exists");
    }
    const updatedAt = new Date().toISOString();
    try {
      await categories.updateOne(
        { _id: id },
        { $set: { name, description: optionalText(input?.description), updatedAt } },
      );
    } catch (error) {
      rethrowDuplicate(error, "A category with that name already exists");
    }
    const productCount = await db.collection("products").countDocuments({ categoryId: id });
    return toCategory({ ...current, name, description: optionalText(input?.description), updatedAt }, productCount);
  });
}

/**
 * Delete a category that has no products.
 *
 * @param env Worker or local environment
 * @param id Category id
 * @return Delete result
 */
export function deleteCategory(env, id) {
  return withDatabase(env, async (db) => {
    const categories = db.collection("categories");
    const category = await categories.findOne({ _id: id });
    if (!category) {
      throw httpError(404, "Category not found");
    }
    const used = await db.collection("products").countDocuments({ categoryId: id });
    if (used > 0) {
      throw httpError(409, "Move or delete products in this category first");
    }
    await categories.deleteOne({ _id: id });
    return { deleted: true };
  });
}

/**
 * Map a brand document to an API item.
 *
 * @param doc Brand document
 * @param productCount Products in the brand
 * @return Brand item
 */
function toBrand(doc, productCount) {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description ?? "",
    createdAt: doc.createdAt,
    ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
    productCount,
  };
}

/**
 * List brands with a product count.
 * Counts are computed from product brandId values and are not stored.
 *
 * @param env Worker or local environment
 * @return Brand rows, newest first
 */
export function listBrands(env) {
  return withDatabase(env, async (db) => {
    const brands = await db.collection("brands").find().sort({ createdAt: -1 }).toArray();
    const products = await db.collection("products").find({}, { projection: { brandId: 1 } }).toArray();
    return brands.map((brand) => toBrand(
      brand,
      products.filter((product) => product.brandId === brand._id).length,
    ));
  });
}

/**
 * Create a brand.
 *
 * @param env Worker or local environment
 * @param input Name and description
 * @return Created brand
 */
export function addBrand(env, input) {
  return withDatabase(env, async (db) => {
    const brands = db.collection("brands");
    const name = requiredText(input?.name, "Name");
    if (await findBrandByName(brands, name)) {
      throw httpError(409, "A brand with that name already exists");
    }
    const brand = {
      _id: randomUUID(),
      name,
      description: optionalText(input?.description),
      createdAt: new Date().toISOString(),
    };
    try {
      await brands.insertOne(brand);
    } catch (error) {
      rethrowDuplicate(error, "A brand with that name already exists");
    }
    return toBrand(brand, 0);
  });
}

/**
 * Update a brand.
 * Keeping the brand's own name, including a case-only change, succeeds.
 *
 * @param env Worker or local environment
 * @param id Brand id
 * @param input Name and description
 * @return Updated brand
 */
export function updateBrand(env, id, input) {
  return withDatabase(env, async (db) => {
    const brands = db.collection("brands");
    const current = await brands.findOne({ _id: id });
    if (!current) {
      throw httpError(404, "Brand not found");
    }
    const name = requiredText(input?.name, "Name");
    if (await findBrandByName(brands, name, id)) {
      throw httpError(409, "A brand with that name already exists");
    }
    const updatedAt = new Date().toISOString();
    try {
      await brands.updateOne(
        { _id: id },
        { $set: { name, description: optionalText(input?.description), updatedAt } },
      );
    } catch (error) {
      rethrowDuplicate(error, "A brand with that name already exists");
    }
    const productCount = await db.collection("products").countDocuments({ brandId: id });
    return toBrand({ ...current, name, description: optionalText(input?.description), updatedAt }, productCount);
  });
}

/**
 * Delete a brand that has no products.
 *
 * @param env Worker or local environment
 * @param id Brand id
 * @return Delete result
 */
export function deleteBrand(env, id) {
  return withDatabase(env, async (db) => {
    const brands = db.collection("brands");
    const brand = await brands.findOne({ _id: id });
    if (!brand) {
      throw httpError(404, "Brand not found");
    }
    const used = await db.collection("products").countDocuments({ brandId: id });
    if (used > 0) {
      throw httpError(409, "Move or delete products in this brand first");
    }
    await brands.deleteOne({ _id: id });
    return { deleted: true };
  });
}

/**
 * Copy stored image bytes so the caller cannot mutate the driver buffer.
 *
 * @param data Binary or byte view from MongoDB
 * @return Exact byte copy
 */
function copyImageBytes(data) {
  const source = data && typeof data.value === "function" ? data.value() : data;
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

/**
 * Upsert one product image document.
 * `createdAt` is set only on the first insert.
 *
 * @param images productImages collection
 * @param id Product id
 * @param image Upload decision from resolveProductImage
 */
async function upsertProductImage(images, id, image) {
  const now = new Date().toISOString();
  await images.updateOne(
    { _id: id },
    {
      $set: {
        contentType: image.contentType,
        size: image.bytes.byteLength,
        data: new Binary(image.bytes),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

/**
 * Delete one product image document. A missing document is not an error.
 *
 * @param images productImages collection
 * @param id Product id
 */
async function deleteProductImage(images, id) {
  await images.deleteOne({ _id: id });
}

/**
 * Put the previous image document back after a failed product update.
 *
 * @param images productImages collection
 * @param id Product id
 * @param previous Image document, or null when there was none
 */
async function restoreProductImage(images, id, previous) {
  if (previous) {
    await images.replaceOne({ _id: id }, previous, { upsert: true });
    return;
  }
  await deleteProductImage(images, id);
}

/**
 * Create a product.
 *
 * @param env Worker or local environment
 * @param input Product fields
 * @return Created product
 */
export function addProduct(env, input) {
  return withDatabase(env, async (db) => {
    const [categories, brands] = await Promise.all([
      db.collection("categories").find().toArray(),
      db.collection("brands").find().toArray(),
    ]);
    const name = requiredText(input?.name, "Name");
    const brandId = requiredText(input?.brandId, "Brand");
    if (!brands.some((brand) => brand._id === brandId)) {
      throw httpError(400, "Brand not found");
    }
    const categoryId = requiredText(input?.categoryId, "Category");
    if (!categories.some((category) => category._id === categoryId)) {
      throw httpError(400, "Category not found");
    }
    const price = requiredPrice(input?.price);
    const quantity = requiredQuantity(input?.quantity);
    const id = randomUUID();
    const published = parsePublished(input?.published, { omitted: "default-true" });
    const inStock = parseInStock(input?.inStock, { omitted: "default-true" });
    const image = resolveProductImage(input, { id });
    const product = {
      _id: id,
      name,
      sku: optionalText(input?.sku),
      price,
      brandId,
      categoryId,
      description: optionalText(input?.description),
      imageUrl: image.imageUrl,
      quantity,
      published,
      inStock,
      createdAt: new Date().toISOString(),
    };
    const products = db.collection("products");
    const images = db.collection("productImages");
    if (image.kind === "upload") {
      await upsertProductImage(images, id, image);
      try {
        await products.insertOne(product);
      } catch (error) {
        await restoreProductImage(images, id, null);
        throw error;
      }
    } else {
      await products.insertOne(product);
      if (image.kind === "empty" || image.kind === "external") {
        await deleteProductImage(images, id);
      }
    }
    return toProduct(product, categories, brands);
  });
}

/**
 * Update a product.
 *
 * @param env Worker or local environment
 * @param id Product id
 * @param input Product fields
 * @return Updated product
 */
export function updateProduct(env, id, input) {
  return withDatabase(env, async (db) => {
    const products = db.collection("products");
    const current = await products.findOne({ _id: id });
    if (!current) {
      throw httpError(404, "Product not found");
    }
    const [categories, brands] = await Promise.all([
      db.collection("categories").find().toArray(),
      db.collection("brands").find().toArray(),
    ]);
    const name = requiredText(input?.name, "Name");
    const brandId = requiredText(input?.brandId, "Brand");
    if (!brands.some((brand) => brand._id === brandId)) {
      throw httpError(400, "Brand not found");
    }
    const categoryId = requiredText(input?.categoryId, "Category");
    if (!categories.some((category) => category._id === categoryId)) {
      throw httpError(400, "Category not found");
    }
    const sku = optionalText(input?.sku);
    const price = requiredPrice(input?.price);
    const description = optionalText(input?.description);
    const quantity = requiredQuantity(input?.quantity);
    const parsedPublished = parsePublished(input?.published, { omitted: "keep" });
    const published = parsedPublished === undefined
      ? current.published === false
        ? false
        : true
      : parsedPublished;
    const parsedInStock = parseInStock(input?.inStock, { omitted: "keep" });
    const inStock = parsedInStock === undefined
      ? current.inStock === false
        ? false
        : true
      : parsedInStock;
    const image = resolveProductImage(input, {
      id,
      currentImageUrl: current.imageUrl ?? "",
    });
    const updatedAt = new Date().toISOString();
    const product = {
      ...current,
      name,
      sku,
      price,
      brandId,
      categoryId,
      description,
      imageUrl: image.imageUrl,
      quantity,
      published,
      inStock,
      updatedAt,
    };
    const fields = {
      name: product.name,
      sku: product.sku,
      price: product.price,
      brandId: product.brandId,
      categoryId: product.categoryId,
      description: product.description,
      imageUrl: product.imageUrl,
      quantity: product.quantity,
      published,
      inStock,
      updatedAt,
    };
    const images = db.collection("productImages");
    if (image.kind === "upload") {
      const previousImage = await images.findOne({ _id: id });
      await upsertProductImage(images, id, image);
      try {
        await products.updateOne({ _id: id }, { $set: fields });
      } catch (error) {
        await restoreProductImage(images, id, previousImage);
        throw error;
      }
    } else if (image.kind === "empty" || image.kind === "external") {
      await products.updateOne({ _id: id }, { $set: fields });
      await deleteProductImage(images, id);
    } else {
      await products.updateOne({ _id: id }, { $set: fields });
    }
    return toProduct(product, categories, brands);
  });
}

/**
 * Delete a product.
 *
 * @param env Worker or local environment
 * @param id Product id
 * @return Delete result
 */
export function deleteProduct(env, id) {
  return withDatabase(env, async (db) => {
    const result = await db.collection("products").deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw httpError(404, "Product not found");
    }
    await db.collection("productImages").deleteOne({ _id: id });
    return { deleted: true };
  });
}

/**
 * Read one uploaded product image.
 *
 * @param env Worker or local environment
 * @param id Product id
 * @return Content type and a copy of the stored bytes
 */
export function getProductImage(env, id) {
  return withDatabase(env, async (db) => {
    const doc = await db.collection("productImages").findOne({ _id: id });
    if (!doc) {
      throw httpError(404, "Product image not found");
    }
    return {
      contentType: doc.contentType,
      data: copyImageBytes(doc.data),
    };
  });
}
