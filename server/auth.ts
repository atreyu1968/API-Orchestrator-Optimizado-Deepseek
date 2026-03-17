import { Request, Response, NextFunction } from "express";
import session from "express-session";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
  }
}

const isReplit = (): boolean => {
  return !!(process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN);
};

const getPassword = (): string | null => {
  const password = process.env.LITAGENTS_PASSWORD;
  if (!password || password.trim() === "") {
    return null;
  }
  return password.trim();
};

export const isAuthEnabled = (): boolean => {
  if (isReplit()) {
    return false;
  }
  return getPassword() !== null;
};

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!isAuthEnabled()) {
    next();
    return;
  }

  const publicPaths = ["/api/auth/login", "/api/auth/status", "/api/auth/logout"];
  if (publicPaths.includes(req.path)) {
    next();
    return;
  }

  if (req.path === "/" || req.path === "/manifest.json" || req.path === "/sw.js" || req.path.startsWith("/assets") || req.path.startsWith("/icons/") || req.path.endsWith(".js") || req.path.endsWith(".css") || req.path.endsWith(".ico") || req.path.endsWith(".png") || req.path.endsWith(".svg")) {
    next();
    return;
  }

  if (req.session?.authenticated) {
    next();
    return;
  }

  res.status(401).json({ error: "No autorizado", requiresAuth: true });
};

export const setupAuth = (app: any): void => {
  const sessionSecret = process.env.SESSION_SECRET;
  const secureCookies = process.env.SECURE_COOKIES === "true";
  
  if (!sessionSecret && isAuthEnabled()) {
    console.error("[Auth] ERROR: SESSION_SECRET is required when authentication is enabled");
    console.error("[Auth] Please set SESSION_SECRET in your environment variables");
    process.exit(1);
  }
  
  const secret = sessionSecret || "dev-only-not-for-production";

  app.use(
    session({
      secret: secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: secureCookies,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: secureCookies ? "none" : "lax",
      },
    })
  );

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    const correctPassword = getPassword();

    if (!isAuthEnabled()) {
      res.json({ success: true, message: "Autenticacion no requerida" });
      return;
    }

    if (!password) {
      res.status(400).json({ error: "Contrasena requerida" });
      return;
    }

    if (password === correctPassword) {
      req.session.authenticated = true;
      res.json({ success: true, message: "Login exitoso" });
    } else {
      res.status(401).json({ error: "Contrasena incorrecta" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: "Error al cerrar sesion" });
        return;
      }
      res.json({ success: true, message: "Sesion cerrada" });
    });
  });

  app.get("/api/auth/status", (req: Request, res: Response) => {
    const authEnabled = isAuthEnabled();
    const authenticated = !authEnabled || req.session?.authenticated === true;
    
    res.json({
      authEnabled,
      authenticated,
      isReplit: isReplit(),
    });
  });
};
