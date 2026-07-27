// Runner de tests unitarios: descubre todos los *.test.ts del repo
// (server/, shared/, script/) y los ejecuta secuencialmente con tsx.
// Sale con código 1 si alguno falla. Se invoca con `npm test`.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["server", "shared", "script"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function findTests(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findTests(full, out);
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const tests = ROOTS.flatMap((r) => findTests(r)).sort();

if (tests.length === 0) {
  console.error("No se encontró ningún archivo *.test.ts");
  process.exit(1);
}

let failed = 0;
for (const file of tests) {
  console.log(`\n=== ${file} ===`);
  const res = spawnSync("npx", ["tsx", file], { stdio: "inherit" });
  if (res.status !== 0) {
    failed++;
    console.error(`FALLÓ: ${file} (exit ${res.status})`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} archivos de test OK`);
process.exit(failed > 0 ? 1 : 0);
