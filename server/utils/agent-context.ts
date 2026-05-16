// [Fix74] Contexto async para propagar el projectId actual a TODO el árbol de
// llamadas del orchestrator → agentes → BaseAgent SIN tener que añadir
// `projectId` a cada interfaz de input. Resuelve el bug de tokens no
// contabilizados: muchos agentes (Editor, Copyeditor, Final-Reviewer,
// Continuity-Sentinel, Voice-Auditor, Semantic-Detector, Chapter-Expander,
// Arc-Validator, Restructurer, Surgical-Patcher, etc.) llamaban a
// `generateContent(prompt)` SIN proyecto, y BaseAgent solo escribía a
// `ai_usage_events` cuando recibía un projectId explícito. Resultado: los
// tokens se calculaban pero nunca se persistían por libro.
//
// Esta utilidad usa AsyncLocalStorage para que los entry points del
// orchestrator (generateNovel, resumeNovel, runFinalReviewOnly,
// applyEditorialNotes, etc.) establezcan el projectId una sola vez y que
// BaseAgent lo lea automáticamente al final del árbol.

import { AsyncLocalStorage } from "node:async_hooks";

interface AgentContextStore {
  projectId: number;
}

const agentContextStorage = new AsyncLocalStorage<AgentContextStore>();

/**
 * Ejecuta `fn` dentro de un contexto que asocia el árbol de llamadas (incluido
 * cualquier `await`) con `projectId`. Cualquier `generateContent` invocado por
 * dentro recogerá ese projectId automáticamente si no se le pasa uno explícito.
 */
export function runWithProjectContext<T>(projectId: number, fn: () => Promise<T>): Promise<T> {
  return agentContextStorage.run({ projectId }, fn);
}

/**
 * Devuelve el projectId del contexto actual o `undefined` si no se está
 * ejecutando dentro de `runWithProjectContext` (p.ej. una llamada cruda desde
 * routes.ts que no representa generación de un libro).
 */
export function getCurrentProjectId(): number | undefined {
  return agentContextStorage.getStore()?.projectId;
}
