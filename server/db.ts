import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

/**
 * [Fix79] Idempotent schema patches applied on every boot.
 * Each statement uses `IF NOT EXISTS` so it is safe to run repeatedly and on
 * any environment (Ubuntu, Replit, CI, prod). Avoids needing a manual
 * `psql ... -f migrations/*.sql` step on deploy.
 */
const SCHEMA_PATCHES: string[] = [
  `ALTER TABLE "series" ADD COLUMN IF NOT EXISTS "protagonist_name" text`,
  // [Fix82] Notas íntegras del último informe del Lector Holístico + marca temporal
  // de cada nota (Holístico/Beta ya tenían timestamp, Final no). Visibilidad de
  // las 3 notas refrescadas tras cada iteración del loop holístico+beta.
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "last_holistic_notes" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "last_holistic_notes_at" timestamp`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "final_score_at" timestamp`,
];

let schemaEnsured = false;
export async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  for (const stmt of SCHEMA_PATCHES) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (e: any) {
      console.warn(`[db] schema patch failed (continuing): ${stmt} -> ${e?.message}`);
    }
  }
  schemaEnsured = true;
  console.log(`[db] schema patches applied (${SCHEMA_PATCHES.length}).`);
}
