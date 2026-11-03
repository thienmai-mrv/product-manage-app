import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(rootDir, "web");
const pagePaths = ["/dashboard", "/products", "/categories"];

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
  const message = status === 500 && error.message !== "MONGODB_URI is not set"
    ? "Request failed"
    : error.message;
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
 * Build the Express app.
 * Express serves the API and the Dashboard, Product, and Category page routes.
 *
 * @param options.dev True when Vite should transform the React pages
 * @return Express app
 */
export async function createApp({ dev = false } = {}) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/categories", categoryRoutes);
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
  app.get(pagePaths, sendPage(vite));

  return app;
}
