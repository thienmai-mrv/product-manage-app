import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

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
 * Create the category name index once in this isolate.
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
  indexesReady = true;
}

/**
 * Insert the starter catalog when both collections are empty.
 *
 * @param db Mongo database
 */
async function ensureSeed(db) {
  const categories = db.collection("categories");
  const products = db.collection("products");
  const [categoryCount, productCount] = await Promise.all([
    categories.countDocuments(),
    products.countDocuments(),
  ]);
  if (categoryCount > 0 || productCount > 0) {
    return;
  }
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
        categoryId: "cat-electronics",
        description: "Compact Bluetooth mouse",
        imageUrl: "",
        quantity: 10,
        createdAt: now,
      },
      {
        _id: "prod-guide",
        name: "Field Guide",
        sku: "BK-015",
        price: 18,
        categoryId: "cat-books",
        description: "Illustrated pocket guide",
        imageUrl: "",
        quantity: 8,
        createdAt: now,
      },
      {
        _id: "prod-lamp",
        name: "Desk Lamp",
        sku: "HM-220",
        price: 39,
        categoryId: "cat-home",
        description: "Adjustable LED lamp",
        imageUrl: "",
        quantity: 5,
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
 * Read an optional product image URL.
 * An empty value means the product has no image. Only http and https are accepted.
 *
 * @param value Raw image URL
 * @return Trimmed URL, or an empty string
 */
function optionalImageUrl(value) {
  const text = optionalText(value);
  if (!text) {
    return "";
  }
  if (text.length > 2048) {
    throw httpError(400, "Image URL is too long");
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw httpError(400, "Image must be an http or https URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw httpError(400, "Image must be an http or https URL");
  }
  return text;
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
 * Turn a duplicate-key error into a category conflict.
 *
 * @param error Caught error
 */
function rethrowDuplicate(error) {
  if (error?.code === 11000) {
    throw httpError(409, "A category with that name already exists");
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
 *
 * @param doc Product document
 * @param categories Category documents
 * @return Product item
 */
function toProduct(doc, categories) {
  const category = categories.find((item) => item._id === doc.categoryId);
  return {
    id: doc._id,
    name: doc.name,
    sku: doc.sku ?? "",
    price: doc.price,
    categoryId: doc.categoryId,
    categoryName: category?.name || "",
    description: doc.description ?? "",
    imageUrl: doc.imageUrl ?? "",
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
    const [products, categories] = await Promise.all([
      db.collection("products").find().sort({ createdAt: -1 }).toArray(),
      db.collection("categories").find().toArray(),
    ]);
    return products.map((product) => toProduct(product, categories));
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
      rethrowDuplicate(error);
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
      rethrowDuplicate(error);
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
 * Create a product.
 *
 * @param env Worker or local environment
 * @param input Product fields
 * @return Created product
 */
export function addProduct(env, input) {
  return withDatabase(env, async (db) => {
    const categories = await db.collection("categories").find().toArray();
    const name = requiredText(input?.name, "Name");
    const categoryId = requiredText(input?.categoryId, "Category");
    if (!categories.some((category) => category._id === categoryId)) {
      throw httpError(400, "Category not found");
    }
    const product = {
      _id: randomUUID(),
      name,
      sku: optionalText(input?.sku),
      price: requiredPrice(input?.price),
      categoryId,
      description: optionalText(input?.description),
      imageUrl: optionalImageUrl(input?.imageUrl),
      quantity: requiredQuantity(input?.quantity),
      createdAt: new Date().toISOString(),
    };
    await db.collection("products").insertOne(product);
    return toProduct(product, categories);
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
    const categories = await db.collection("categories").find().toArray();
    const categoryId = requiredText(input?.categoryId, "Category");
    if (!categories.some((category) => category._id === categoryId)) {
      throw httpError(400, "Category not found");
    }
    const updatedAt = new Date().toISOString();
    const product = {
      ...current,
      name: requiredText(input?.name, "Name"),
      sku: optionalText(input?.sku),
      price: requiredPrice(input?.price),
      categoryId,
      description: optionalText(input?.description),
      imageUrl: optionalImageUrl(input?.imageUrl),
      quantity: requiredQuantity(input?.quantity),
      updatedAt,
    };
    await products.updateOne(
      { _id: id },
      {
        $set: {
          name: product.name,
          sku: product.sku,
          price: product.price,
          categoryId: product.categoryId,
          description: product.description,
          imageUrl: product.imageUrl,
          quantity: product.quantity,
          updatedAt,
        },
      },
    );
    return toProduct(product, categories);
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
    return { deleted: true };
  });
}
