import { clientErrorMessage } from "./httpErrors.js";
import { parseLoginBody } from "./loginInput.js";
import { MAX_JSON_BODY_BYTES } from "./productInput.js";
import { resolveAdmin } from "./requireAdmin.js";
import {
  pageSessionUserId,
  readCookie,
  requestIsSecure,
  requireSessionSecret,
  sessionCookieHeader,
  signSession,
  verifySession,
} from "./session.js";
import { addBrand, addCategory, addProduct, authenticate, deleteBrand, deleteCategory, deleteProduct, findUserById, getProductImage, listBrands, listCategories, listProducts, updateBrand, updateCategory, updateProduct } from "./store.js";

/**
 * Build a JSON response.
 *
 * @param body Response payload
 * @param status HTTP status code
 * @return JSON response
 */
function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
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
 * A 500 hides the raw message, except the shared configuration sentences.
 *
 * @param error Caught error
 * @return JSON error response
 */
function errorResponse(error) {
  const status = error.status || 500;
  const message = clientErrorMessage(status, error.message);
  return json({ error: message }, status);
}

const ADMIN_PAGES = new Set(["/products", "/brands", "/categories"]);

/**
 * Handle login, session, and logout.
 * Any other method on those three paths is HTTP 405. Unrelated paths return null.
 *
 * @param request Incoming request
 * @param env Worker environment
 * @param url Parsed request URL
 * @return JSON response, or null when the path is not an auth route
 */
async function handleAuth(request, env, url) {
  const { pathname } = url;
  if (pathname !== "/api/auth/login" && pathname !== "/api/auth/session" && pathname !== "/api/auth/logout") {
    return null;
  }
  const secure = requestIsSecure(url, request.headers.get("x-forwarded-proto"));
  if (pathname === "/api/auth/login" && request.method === "POST") {
    const secret = requireSessionSecret(env);
    const user = await authenticate(env, parseLoginBody(await readJson(request)));
    const token = signSession(user.id, secret);
    return json({ user }, 200, { "Set-Cookie": sessionCookieHeader(token, { secure }) });
  }
  if (pathname === "/api/auth/session" && request.method === "GET") {
    const secret = requireSessionSecret(env);
    const token = readCookie(request.headers.get("cookie"));
    const userId = token ? verifySession(token, secret) : null;
    if (!userId) {
      return json({ authenticated: false });
    }
    const user = await findUserById(env, userId);
    if (!user) {
      return json({ authenticated: false });
    }
    return json({ authenticated: true, user });
  }
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    return json({ ok: true }, 200, {
      "Set-Cookie": sessionCookieHeader("", { secure, clear: true }),
    });
  }
  return json({ error: "Method not allowed" }, 405);
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
  const authResponse = await handleAuth(request, env, url);
  if (authResponse) {
    return authResponse;
  }

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
      await resolveAdmin(request.headers.get("cookie"), env);
      return json({ item: await addProduct(env, await readJson(request)) }, 201);
    }
    if (request.method === "PUT" && id) {
      await resolveAdmin(request.headers.get("cookie"), env);
      return json({ item: await updateProduct(env, id, await readJson(request)) });
    }
    if (request.method === "DELETE" && id) {
      await resolveAdmin(request.headers.get("cookie"), env);
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
      await resolveAdmin(request.headers.get("cookie"), env);
      return json({ item: await addCategory(env, await readJson(request)) }, 201);
    }
    if (request.method === "PUT" && id) {
      await resolveAdmin(request.headers.get("cookie"), env);
      return json({ item: await updateCategory(env, id, await readJson(request)) });
    }
    if (request.method === "DELETE" && id) {
      await resolveAdmin(request.headers.get("cookie"), env);
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
      await resolveAdmin(request.headers.get("cookie"), env);
      return json({ item: await addBrand(env, await readJson(request)) }, 201);
    }
    if (request.method === "PUT" && id) {
      await resolveAdmin(request.headers.get("cookie"), env);
      return json({ item: await updateBrand(env, id, await readJson(request)) });
    }
    if (request.method === "DELETE" && id) {
      await resolveAdmin(request.headers.get("cookie"), env);
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

  if (request.method === "GET" && (ADMIN_PAGES.has(url.pathname) || url.pathname === "/login")) {
    const userId = pageSessionUserId(request.headers.get("cookie"), env);
    if (ADMIN_PAGES.has(url.pathname) && !userId) {
      return Response.redirect(new URL("/login", url), 302);
    }
    if (url.pathname === "/login" && userId) {
      return Response.redirect(new URL("/products", url), 302);
    }
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
