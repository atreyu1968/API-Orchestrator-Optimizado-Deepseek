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
  // [Fix90] Rango opcional min/max de capítulos para que el Arquitecto audite
  // densidad y decida el número final en lugar de rellenar con tramas puente.
  // Ambas columnas son NULL por defecto: proyectos existentes mantienen el
  // comportamiento clásico exacto vía `chapterCount`.
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "min_chapter_count" integer`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "max_chapter_count" integer`,
  // [Fix108] Voz narrativa canónica estructurada (POV + tiempo verbal + tipo
  // de narrador). NULL por defecto = comportamiento pre-Fix108 (inferencia
  // por regex de la guía de estilo). Crítico para Ubuntu: sin esta columna,
  // POST/PATCH /api/projects falla cuando el usuario selecciona la voz
  // narrativa en el form de config.
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "narrative_voice" jsonb`,
  // [Fix115] Snapshot + problemas residuales cuando el bucle del Auditor
  // Estructural no alcanza 7/10 incluso con audit on-demand de WB. La UI
  // muestra un panel de guidance manual; sin esta columna el sistema no
  // puede pausar para guidance y caería en el comportamiento pre-Fix115
  // de escribir sobre escaleta defectuosa.
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "pending_structural_guidance" jsonb`,
  // [Fix172] Flag global: suspender trabajo LLM en horas pico de DeepSeek
  // (tarifa dinamica x2) y reanudar automaticamente en horas valle.
  `ALTER TABLE "queue_state" ADD COLUMN IF NOT EXISTS "pause_on_peak_hours" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "auto_polish_pending" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "auto_polish_resume_count" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "enable_post_finalization_polish" boolean NOT NULL DEFAULT false`,
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
