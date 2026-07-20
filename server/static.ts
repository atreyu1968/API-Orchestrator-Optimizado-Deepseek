import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // [Fix231] Politica de cache correcta para el build de produccion (Ubuntu).
  // Antes index.html se servia SIN Cache-Control: el navegador lo cacheaba y,
  // tras actualizar la app, seguia cargando el bundle JS ANTIGUO (los fixes de
  // refresco nunca llegaban al cliente sin un hard-refresh manual). Regla:
  //  - index.html -> no-store (siempre fresco; pesa poco y referencia los hashes)
  //  - /assets/*  -> cache larga e immutable (Vite les pone hash en el nombre,
  //    un contenido nuevo SIEMPRE tiene URL nueva, cachearlo fuerte es seguro)
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
