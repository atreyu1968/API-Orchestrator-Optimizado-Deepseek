import fs from "fs";
import path from "path";

// [Fix33] Logger persistente por proyecto de reedit.
//
// Escribe eventos estructurados a disco en `data/reedit-logs/{projectId}.log`
// (ruta no versionada). Cada evento es una línea JSON-friendly con timestamp ISO,
// nivel, etapa, capítulo opcional y mensaje. Se expone vía endpoints
// `GET /api/reedit-projects/:id/logs/download` y `DELETE …/logs`.
//
// Diseño:
// - Append asíncrono fire-and-forget: NUNCA debe bloquear el orquestador ni
//   abortar un reedit por un fallo de I/O del log.
// - Mutex por proyecto (Map<projectId, Promise>) para serializar writes y evitar
//   intercalado de líneas en sistemas con file locking laxo.
// - Sin rotación automática: la operación destructiva la inicia el usuario vía
//   `clearProjectLog` (botón "Borrar logs" o `restart` del proyecto).

export type ReeditLogLevel = "info" | "warn" | "error" | "debug";

export interface ReeditLogEntry {
  ts: string;
  level: ReeditLogLevel;
  stage?: string;
  chapter?: number;
  message: string;
  context?: Record<string, unknown>;
}

const LOG_DIR = path.resolve(process.cwd(), "data", "reedit-logs");
const writeChain = new Map<number, Promise<void>>();

function ensureLogDir(): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {
    // mkdir falla si la ruta ya existe como fichero; aceptamos el error y dejamos
    // que el siguiente appendFile produzca un error trazable.
  }
}

function logFilePath(projectId: number): string {
  return path.join(LOG_DIR, `${projectId}.log`);
}

function formatLine(entry: ReeditLogEntry): string {
  const parts: string[] = [
    `[${entry.ts}]`,
    `[${entry.level.toUpperCase()}]`,
  ];
  if (entry.stage) parts.push(`[${entry.stage}]`);
  if (typeof entry.chapter === "number") parts.push(`[cap=${entry.chapter}]`);
  parts.push(entry.message);
  if (entry.context && Object.keys(entry.context).length > 0) {
    let ctx: string;
    try {
      ctx = JSON.stringify(entry.context);
    } catch {
      ctx = "{...unserializable...}";
    }
    parts.push(ctx);
  }
  return parts.join(" ") + "\n";
}

export function logReeditEvent(
  projectId: number,
  level: ReeditLogLevel,
  stage: string | undefined,
  message: string,
  options?: { chapter?: number; context?: Record<string, unknown> }
): void {
  if (!projectId || !Number.isFinite(projectId)) return;
  ensureLogDir();
  const entry: ReeditLogEntry = {
    ts: new Date().toISOString(),
    level,
    stage,
    chapter: options?.chapter,
    message: String(message ?? "").replace(/\n/g, " "),
    context: options?.context,
  };
  const line = formatLine(entry);
  const file = logFilePath(projectId);
  const prev = writeChain.get(projectId) || Promise.resolve();
  const next = prev
    .then(() => fs.promises.appendFile(file, line, "utf8"))
    .catch(err => {
      // Logging del logger: a consola únicamente, no propagar.
      console.error(`[ReeditLogger] No pude escribir log de proyecto ${projectId}:`, (err as Error).message);
    })
    .finally(() => {
      // Cleanup: si seguimos siendo el último write encolado, soltamos la entrada
      // del Map para evitar crecimiento ilimitado en procesos de vida larga.
      if (writeChain.get(projectId) === next) {
        writeChain.delete(projectId);
      }
    });
  writeChain.set(projectId, next);
}

export async function readProjectLog(projectId: number): Promise<string> {
  const file = logFilePath(projectId);
  try {
    return await fs.promises.readFile(file, "utf8");
  } catch (err: any) {
    if (err && err.code === "ENOENT") return "";
    throw err;
  }
}

export async function projectLogStats(projectId: number): Promise<{ exists: boolean; bytes: number; updatedAt?: string }> {
  const file = logFilePath(projectId);
  try {
    const st = await fs.promises.stat(file);
    return { exists: true, bytes: st.size, updatedAt: st.mtime.toISOString() };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

export async function clearProjectLog(projectId: number): Promise<void> {
  const file = logFilePath(projectId);
  try {
    await fs.promises.unlink(file);
  } catch (err: any) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}
