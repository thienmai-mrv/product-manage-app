import { Router } from "express";
import { asyncRoute } from "../asyncRoute.js";
import { localEnv } from "../env.js";
import { resolveAdmin } from "../requireAdmin.js";
import { addProduct, deleteProduct, getProductImage, listProducts, updateProduct } from "../store.js";

const router = Router();

router.get("/", asyncRoute(async (req, res) => {
  res.json({ items: await listProducts(localEnv()) });
}));

router.get("/:id/image", asyncRoute(async (req, res) => {
  const image = await getProductImage(localEnv(), req.params.id);
  const body = Buffer.from(image.data);
  res.status(200).set({
    "Content-Type": image.contentType,
    "Content-Length": String(body.length),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  }).end(body);
}));

router.post("/", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.status(201).json({ item: await addProduct(localEnv(), req.body) });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.json({ item: await updateProduct(localEnv(), req.params.id, req.body) });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.json(await deleteProduct(localEnv(), req.params.id));
}));

export default router;
