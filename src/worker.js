import { MAX_JSON_BODY_BYTES } from "./productInput.js";
import { addBrand, addCategory, addProduct, deleteBrand, deleteCategory, deleteProduct, getProductImage, listBrands, listCategories, listProducts, updateBrand, updateCategory, updateProduct } from "./store.js";

/**
 * Build a JSON response.
 *
 * @param body Response payload
 * @param status HTTP status code
 * @return JSON response
 */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Read a JSON request body.
 *
 * @param request Incoming request
 * @return Parsed JSON body
 */
async function readJson(request) {
  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_JSON_BODY_BYTES) {
    const error = new Error("Request body is too large");
    error.status = 413;
    throw error;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    const error = new Error("Body must be JSON");
    error.status = 400;
    throw error;
  }
}

/**
 * Turn a thrown error into a JSON error response.
 * A 500 hides the raw message, except a missing Mongo URI.
 *
 * @param error Caught error
 * @return JSON error response
 */
function errorResponse(error) {
  const status = error.status || 500;
  const message = status === 500 && error.message !== "MONGODB_URI is not set"
    ? "Request failed"
    : error.message;
  return json({ error: message }, status);
}

/**
 * Handle product, category, and brand API requests.
 *
 * @param request Incoming request
 * @param env Worker environment
 * @param url Parsed request URL
 * @return JSON response
 */
async function handleApi(request, env, url) {
  const imageMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/image$/);
  if (imageMatch) {
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }
    const image = await getProductImage(env, decodeURIComponent(imageMatch[1]));
    return new Response(image.data, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.data.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  const productMatch = url.pathname.match(/^\/api\/products(?:\/([^/]+))?$/);
  if (productMatch) {
    const id = productMatch[1] ? decodeURIComponent(productMatch[1]) : "";
    if (request.method === "GET" && !id) {
      return json({ items: await listProducts(env) });
    }
    if (request.method === "POST" && !id) {
      return json({ item: await addProduct(env, await readJson(request)) }, 201);
    }
    if (request.method === "PUT" && id) {
      return json({ item: await updateProduct(env, id, await readJson(request)) });
    }
    if (request.method === "DELETE" && id) {
      return json(await deleteProduct(env, id));
    }
    return json({ error: "Method not allowed" }, 405);
  }

  const categoryMatch = url.pathname.match(/^\/api\/categories(?:\/([^/]+))?$/);
  if (categoryMatch) {
    const id = categoryMatch[1] ? decodeURIComponent(categoryMatch[1]) : "";
    if (request.method === "GET" && !id) {
      return json({ items: await listCategories(env) });
    }
    if (request.method === "POST" && !id) {
      return json({ item: await addCategory(env, await readJson(request)) }, 201);
    }
    if (request.method === "PUT" && id) {
      return json({ item: await updateCategory(env, id, await readJson(request)) });
    }
    if (request.method === "DELETE" && id) {
      return json(await deleteCategory(env, id));
    }
    return json({ error: "Method not allowed" }, 405);
  }

  const brandMatch = url.pathname.match(/^\/api\/brands(?:\/([^/]+))?$/);
  if (brandMatch) {
    const id = brandMatch[1] ? decodeURIComponent(brandMatch[1]) : "";
    if (request.method === "GET" && !id) {
      return json({ items: await listBrands(env) });
    }
    if (request.method === "POST" && !id) {
      return json({ item: await addBrand(env, await readJson(request)) }, 201);
    }
    if (request.method === "PUT" && id) {
      return json({ item: await updateBrand(env, id, await readJson(request)) });
    }
    if (request.method === "DELETE" && id) {
      return json(await deleteBrand(env, id));
    }
    return json({ error: "Method not allowed" }, 405);
  }

  return json({ error: "Not found" }, 404);
}

/**
 * Handle a Worker request.
 * API routes run here. Page routes are served from the ASSETS binding.
 *
 * @param request Incoming request
 * @param env Worker environment
 * @return Response
 */
async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }
    try {
      return await handleApi(request, env, url);
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (url.pathname === "/" && request.method === "GET") {
    return Response.redirect(new URL("/dashboard", url), 302);
  }

  if (!env.ASSETS?.fetch) {
    return new Response("ASSETS binding is not configured for this deployment.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return env.ASSETS.fetch(request);
}

export default {
  fetch(request, env) {
    return route(request, env);
  },
};
