import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // [Fix45] El push de schema se puede saltar con SKIP_DB_PUSH=1. Útil cuando
  // el deploy script (p.ej. update.sh en VPS) ya ejecutó `drizzle-kit push`
  // antes del build: repetirlo aquí cuelga el build si la DATABASE_URL no se
  // propaga al contexto del proceso (típico al lanzar el build con `sudo` sin
  // -E). En dev/local seguimos haciéndolo por defecto.
  if (process.env.SKIP_DB_PUSH === "1") {
    console.log("skipping database schema push (SKIP_DB_PUSH=1)");
  } else {
    console.log("pushing database schema...");
    try {
      execSync("npx drizzle-kit push --force", { stdio: "inherit", timeout: 120000 });
    } catch (e) {
      console.warn("Database push warning (may be expected):", (e as Error).message || e);
    }
  }

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
