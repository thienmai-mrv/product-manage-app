import { Router } from "express";
import { asyncRoute } from "../asyncRoute.js";
import { localEnv } from "../env.js";
import { resolveAdmin } from "../requireAdmin.js";
import { addBrand, deleteBrand, listBrands, updateBrand } from "../store.js";

const router = Router();

router.get("/", asyncRoute(async (req, res) => {
  res.json({ items: await listBrands(localEnv()) });
}));

router.post("/", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.status(201).json({ item: await addBrand(localEnv(), req.body) });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.json({ item: await updateBrand(localEnv(), req.params.id, req.body) });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.json(await deleteBrand(localEnv(), req.params.id));
}));

export default router;
