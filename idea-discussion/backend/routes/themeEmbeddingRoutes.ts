import express from "express";
import {
  clusterTheme,
  generateThemeEmbeddings,
  searchTheme,
} from "../controllers/embeddingController.js";

const router = express.Router({ mergeParams: true });

router.use(express.json());

router.post("/embeddings/generate", generateThemeEmbeddings);

router.get("/search", searchTheme);

router.post("/cluster", clusterTheme);

export default router;
