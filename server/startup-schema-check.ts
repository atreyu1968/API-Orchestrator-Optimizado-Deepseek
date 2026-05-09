import pg from "pg";

type RequiredColumn = { table: string; column: string; addedIn: string };
type RequiredTable = { table: string; addedIn: string };

const REQUIRED_COLUMNS: RequiredColumn[] = [
  { table: "projects", column: "pending_admin_actions", addedIn: "Fix40" },
  { table: "projects", column: "auto_beta_loop", addedIn: "Fix47" },
  { table: "projects", column: "auto_beta_loop_max_iterations", addedIn: "Fix47" },
  { table: "projects", column: "last_beta_notes", addedIn: "Fix38" },
  { table: "projects", column: "last_beta_notes_at", addedIn: "Fix38" },
  { table: "projects", column: "holistic_gate_verdict", addedIn: "Fix49" },
  { table: "reedit_projects", column: "pending_editorial_parse", addedIn: "Fix34" },
  { table: "reedit_projects", column: "auto_beta_loop_on_translations", addedIn: "Fix52" },
  { table: "reedit_projects", column: "auto_beta_loop_on_translations_max_iterations", addedIn: "Fix52" },
];

const REQUIRED_TABLES: RequiredTable[] = [
  { table: "guide_generation_jobs", addedIn: "Fix43" },
  { table: "publishers", addedIn: "Fix51" },
];

export async function assertSchemaUpToDate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("[schema-check] DATABASE_URL is not set. Refusing to start.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const missingCols: RequiredColumn[] = [];
  const missingTables: RequiredTable[] = [];

  try {
    for (const t of REQUIRED_TABLES) {
      const r = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1",
        [t.table],
      );
      if (r.rowCount === 0) missingTables.push(t);
    }
    for (const c of REQUIRED_COLUMNS) {
      const r = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2",
        [c.table, c.column],
      );
      if (r.rowCount === 0) missingCols.push(c);
    }
  } catch (err) {
    console.error("[schema-check] Could not query information_schema:", err);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }

  if (missingCols.length === 0 && missingTables.length === 0) return;

  console.error("");
  console.error("===============================================================");
  console.error("[schema-check] DATABASE SCHEMA IS OUT OF SYNC. Refusing to start.");
  console.error("===============================================================");
  if (missingTables.length > 0) {
    console.error("Missing tables:");
    for (const t of missingTables) console.error(`  - ${t.table} (added in ${t.addedIn})`);
  }
  if (missingCols.length > 0) {
    console.error("Missing columns:");
    for (const c of missingCols) console.error(`  - ${c.table}.${c.column} (added in ${c.addedIn})`);
  }
  console.error("");
  console.error("To fix on the VPS, run with the env file loaded so DATABASE_URL is in scope:");
  console.error("  cd /var/www/litagents");
  console.error("  sudo bash -c 'set -a; source /etc/litagents/env; set +a; npx drizzle-kit push --force'");
  console.error("  sudo systemctl restart litagents");
  console.error("===============================================================");
  process.exit(1);
}
