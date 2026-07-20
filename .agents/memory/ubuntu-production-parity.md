---
name: Paridad Replit dev vs Ubuntu produccion
description: El usuario corre la app en Ubuntu con build de produccion y LITAGENTS_PASSWORD; bugs invisibles en Replit dev.
---

Regla: todo cambio debe pensarse tambien para el entorno Ubuntu del usuario (peticion explicita, julio 2026).

**Por que:** en Replit corre `npm run dev` (Vite, sin auth); en Ubuntu corre el build de produccion con `LITAGENTS_PASSWORD` activo y posible proxy delante. Dos clases de bug ya vistas solo alli:
- Auth: llamadas internas via loopback sin sesion devuelven 401 (resuelto con token interno).
- Cache: express.static servia index.html sin no-store -> el navegador cargaba bundles antiguos tras cada actualizacion y los fixes de frontend "no llegaban".

**How to apply:** al tocar frontend-servido, SSE, auth o self-fetch, revisar la rama NODE_ENV=production (server/static.ts, server/auth.ts) y proxies (heartbeats, X-Accel-Buffering). Probar con harness aislado si no se puede levantar un 2o servidor contra la BD viva (auto-resumes).
