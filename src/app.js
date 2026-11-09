import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { localEnv } from "./env.js";
import { clientErrorMessage } from "./httpErrors.js";
import authRoutes from "./routes/auth.js";
import brandRoutes from "./routes/brands.js";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import { pageSessionUserId } from "./session.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(rootDir, "web");
const adminPagePaths = ["/products", "/brands", "/categories"];
const pagePaths = ["/dashboard", "/login", ...adminPagePaths];

/**
 * Turn a thrown store error into a JSON response.
 *
 * @param error Caught error
 * @param req Request
 * @param res Response
 * @param next Next handler
 */
function apiError(error, req, res, next) {
  if (!req.originalUrl.startsWith("/api")) {
    next(error);
    return;
  }
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error.type === "entity.too.large" || error.status === 413 || error.statusCode === 413) {
    res.status(413).json({ error: "Request body is too large" });
    return;
  }
  const status = error.status || 500;
  const message = clientErrorMessage(status, error.message);
  res.status(status).json({ error: message });
}

/**
 * Send the React app for a page route.
 * Vite transforms the document in development. Production sends the built file.
 *
 * @param vite Vite dev server, or null in production
 * @return Express handler
 */
function sendPage(vite) {
  return async (req, res, next) => {
    try {
      if (vite) {
        const template = fs.readFileSync(path.join(webDir, "index.html"), "utf8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
        return;
      }
      res.sendFile(path.join(webDir, "dist", "index.html"));
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Redirect admin documents and an authenticated login page before HTML is sent.
 * A missing or short secret takes the logged-out branch. Dashboard stays public.
 *
 * @param vite Vite dev server, or null in production
 * @return Express handler
 */
function sendGuardedPage(vite) {
  const render = sendPage(vite);
  return (req, res, next) => {
    const userId = pageSessionUserId(req.headers.cookie, localEnv());
    if (adminPagePaths.includes(req.path) && !userId) {
      res.redirect(302, "/login");
      return;
    }
    if (req.path === "/login" && userId) {
      res.redirect(302, "/products");
      return;
    }
    return render(req, res, next);
  };
}

/**
 * Build the Express app.
 * Express serves the API and the Dashboard, Product, Brand, and Category page routes.
 *
 * @param options.dev True when Vite should transform the React pages
 * @return Express app
 */
export async function createApp({ dev = false } = {}) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/brands", brandRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(apiError);

  let vite = null;
  if (dev) {
    const { createServer } = await import("vite");
    vite = await createServer({
      root: webDir,
      configFile: path.join(webDir, "vite.config.js"),
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(webDir, "dist")));
  }

  app.get("/", (req, res) => {
    res.redirect("/dashboard");
  });
  app.get(pagePaths, sendGuardedPage(vite));

  return app;
}
