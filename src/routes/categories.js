import { Router } from "express";
import { asyncRoute } from "../asyncRoute.js";
import { localEnv } from "../env.js";
import { resolveAdmin } from "../requireAdmin.js";
import { addCategory, deleteCategory, listCategories, updateCategory } from "../store.js";

const router = Router();

router.get("/", asyncRoute(async (req, res) => {
  res.json({ items: await listCategories(localEnv()) });
}));

router.post("/", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.status(201).json({ item: await addCategory(localEnv(), req.body) });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.json({ item: await updateCategory(localEnv(), req.params.id, req.body) });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  await resolveAdmin(req.headers.cookie, localEnv());
  res.json(await deleteCategory(localEnv(), req.params.id));
}));

export default router;
