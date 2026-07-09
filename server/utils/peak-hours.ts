// [Fix172] Suspension automatica del trabajo LLM en horas PICO de DeepSeek.
// DeepSeek aplica tarificacion dinamica desde mediados de julio 2026: las
// horas PICO (9:00-12:00 y 14:00-18:00 hora de Pekin, UTC+8) duplican el
// precio base. En UTC eso es 01:00-04:00 y 06:00-10:00.
// Este modulo ofrece:
//   - isPeakHourUtc(date): true si el instante cae en ventana pico.
//   - nextValleyStartUtc(date): instante en que termina la ventana pico actual.
//   - waitForOffPeakIfEnabled(...): espera bloqueante (con heartbeats para el
//     monitor de congelados) hasta salir de la hora pico, SOLO si el flag
//     queue_state.pause_on_peak_hours esta activo. Se re-lee el flag en cada
//     ciclo, asi el usuario puede desactivarlo en caliente y el trabajo
//     continua de inmediato.
import { storage } from "../storage";

// Ventanas PICO en horas UTC [inicio, fin) — equivalen a 9-12 y 14-18 Pekin.
export const PEAK_WINDOWS_UTC: Array<{ start: number; end: number }> = [
  { start: 1, end: 4 },
  { start: 6, end: 10 },
];

export function isPeakHourUtc(date: Date = new Date()): boolean {
  const h = date.getUTCHours();
  return PEAK_WINDOWS_UTC.some(w => h >= w.start && h < w.end);
}

// Devuelve el instante UTC en que TERMINA la ventana pico que contiene `date`.
// Si `date` no esta en pico, devuelve `date` tal cual.
export function nextValleyStartUtc(date: Date = new Date()): Date {
  const h = date.getUTCHours();
  const w = PEAK_WINDOWS_UTC.find(win => h >= win.start && h < win.end);
  if (!w) return date;
  const d = new Date(date);
  d.setUTCHours(w.end, 0, 0, 0);
  return d;
}

const POLL_MS = 60 * 1000; // re-chequeo cada minuto (flag + reloj)
const HEARTBEAT_MS = 15 * 60 * 1000; // log-latido cada 15 min (< timeout 22 min del monitor de congelados)
const EXT_HEARTBEAT_MS = 5 * 60 * 1000; // [Fix176] latido externo cada 5 min (< umbral 8 min del watchdog de reedicion)

async function isPauseEnabled(): Promise<boolean> {
  try {
    const state = await storage.getQueueState();
    return Boolean((state as any)?.pauseOnPeakHours);
  } catch {
    return false; // ante la duda, NO bloquear el trabajo
  }
}

/**
 * Si el flag global esta activo y estamos en hora pico, espera hasta la hora
 * valle emitiendo latidos de actividad (para que el monitor de congelados no
 * mate el proceso durante la espera, que puede durar hasta 4 h).
 *
 * @param projectId  proyecto sobre el que loguear (null → solo consola)
 * @param label      etiqueta de la fase para los logs (p.ej. "capitulo 12")
 * @param shouldAbort callback opcional; si devuelve true, la espera se corta
 *                    (p.ej. proyecto cancelado o orquestador abortado).
 * @param onHeartbeat [Fix176] callback opcional invocado al iniciar la pausa y
 *                    en cada latido; permite a pipelines con monitor PROPIO de
 *                    congelados (p.ej. reedicion, heartbeatAt con umbral 8 min)
 *                    refrescar su latido para no disparar auto-recovery.
 * @returns true si hubo pausa, false si no hizo falta esperar.
 */
export async function waitForOffPeakIfEnabled(
  projectId: number | null,
  label: string,
  shouldAbort?: () => boolean | Promise<boolean>,
  onHeartbeat?: () => void | Promise<void>,
): Promise<boolean> {
  if (!isPeakHourUtc() || !(await isPauseEnabled())) return false;

  const resumeAt = nextValleyStartUtc();
  const fmt = (d: Date) => d.toISOString().slice(11, 16) + " UTC";
  const startMsg = `[Fix172] Trabajo EN PAUSA por hora PICO de DeepSeek (tarifa x2). Fase: ${label}. Se reanudará automáticamente al entrar en hora valle (~${fmt(resumeAt)}). El progreso está guardado; puedes desactivar la pausa en Cola → "Suspender en horas pico" para continuar ya.`;
  console.log(startMsg);
  if (projectId != null) {
    try {
      await storage.createActivityLog({ projectId, level: "info", message: startMsg, agentRole: "orchestrator" });
    } catch {}
  }
  // [Fix176] Latido externo al iniciar la pausa (monitores propios, p.ej. reedicion).
  if (onHeartbeat) { try { await onHeartbeat(); } catch {} }

  let lastHeartbeat = Date.now();
  let lastExternalHeartbeat = Date.now();
  while (isPeakHourUtc()) {
    if (shouldAbort && (await shouldAbort())) {
      console.log(`[Fix172] Espera por hora pico interrumpida (abort) en fase: ${label}.`);
      return true;
    }
    if (!(await isPauseEnabled())) {
      const offMsg = `[Fix172] Pausa por hora pico DESACTIVADA por el usuario — el trabajo continúa de inmediato (fase: ${label}).`;
      console.log(offMsg);
      if (projectId != null) {
        try { await storage.createActivityLog({ projectId, level: "info", message: offMsg, agentRole: "orchestrator" }); } catch {}
      }
      return true;
    }
    await new Promise(r => setTimeout(r, POLL_MS));
    // [Fix176] Latido externo mas frecuente (cada 5 min): el watchdog de
    // reedicion considera congelado un proyecto sin heartbeatAt en 8 min.
    if (onHeartbeat && Date.now() - lastExternalHeartbeat >= EXT_HEARTBEAT_MS) {
      lastExternalHeartbeat = Date.now();
      try { await onHeartbeat(); } catch {}
    }
    // Latido: mantiene "actividad significativa" fresca para que el monitor
    // de congelados (timeout 22 min) no dispare auto-recovery durante una
    // espera legitima de hasta 4 h.
    if (projectId != null && Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = Date.now();
      try {
        await storage.createActivityLog({
          projectId,
          level: "info",
          message: `[Fix172] Sigo en pausa por hora pico de DeepSeek (fase: ${label}). Reanudación automática ~${fmt(nextValleyStartUtc())}.`,
          agentRole: "orchestrator",
        });
      } catch {}
    }
  }

  const endMsg = `[Fix172] Hora VALLE alcanzada — el trabajo se reanuda automáticamente (fase: ${label}).`;
  console.log(endMsg);
  if (projectId != null) {
    try { await storage.createActivityLog({ projectId, level: "info", message: endMsg, agentRole: "orchestrator" }); } catch {}
  }
  return true;
}
