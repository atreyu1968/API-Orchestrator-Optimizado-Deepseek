/**
 * ExternalReviewDialog
 * --------------------
 * Diálogo de tres pasos para aplicar una crítica literaria externa:
 *
 *  1. PLANTILLA  — textarea con estructura guiada + pegar crítica libre
 *  2. PLAN       — intervenciones clasificadas, toggle on/off, prioridades
 *  3. EJECUCIÓN  — progreso en tiempo real por intervención
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Play, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── types ───────────────────────────────────────────────────────────────────

type InterventionType = "puntual" | "densidad" | "siembra" | "estructural";
type InterventionStatus = "pending" | "running" | "done" | "skipped" | "failed";

interface ReviewIntervention {
  id: string;
  type: InterventionType;
  titulo: string;
  descripcion: string;
  capitulosAfectados: number[];
  instruccion: string;
  sembraRevelacion?: string;
  sembraContextoLector?: string;
  prioridad: "alta" | "media" | "baja";
  status: InterventionStatus;
  completedAt?: string;
  errorMsg?: string;
}

interface ExternalReviewPlan {
  critiqueText: string;
  parsedAt: string;
  overallSummary: string;
  currentScore?: string;
  potentialScore?: string;
  interventions: ReviewIntervention[];
}

interface ExternalReviewState {
  externalReviewStatus: string | null;
  pendingExternalReview: ExternalReviewPlan | null;
}

// ─── constants ───────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<InterventionType, string> = {
  puntual: "Puntual",
  densidad: "Densidad",
  siembra: "Siembra",
  estructural: "Estructural",
};

const TYPE_COLOR: Record<InterventionType, string> = {
  puntual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  densidad: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  siembra: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  estructural: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const PRIORITY_COLOR: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  media: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  baja: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const CRITIQUE_TEMPLATE = `MI IMPRESIÓN GENERAL
────────────────────────────────────
[Escribe aquí tu valoración general de la novela: qué funciona, qué nota le darías y cuál sería su potencial tras revisión]


FORTALEZAS — NO TOCAR
────────────────────────────────────
[Lista los elementos que ya funcionan bien y que NO deben modificarse. El sistema los ignorará.]


PROBLEMA PRINCIPAL: RITMO / REDUNDANCIAS
────────────────────────────────────
Capítulos afectados: [ej: 11, 12, 13, 14, 15, 16, 17, 18, 19]
Descripción: [Describe el patrón redundante que se repite — ej: "cada escena explica lo que acaba de ocurrir, da una interpretación psicológica y termina con una frase épica. El lector ya entiende la información en la primera mención."]


CORRECCIONES TÉCNICAS PUNTUALES
────────────────────────────────────
[Lista cada error concreto en su propio párrafo]

Capítulo afectado: [número]
Problema: [descripción del error]
Cómo corregirlo: [instrucción concreta]

Capítulo afectado: [número]
Problema: [descripción]
Cómo corregirlo: [instrucción]


GIRO A SEMBRAR RETROACTIVAMENTE
────────────────────────────────────
[Si hay una revelación tardía que debería prepararse antes, descríbela aquí]

La revelación: [ej: "En el capítulo 27 se descubre que Linnea también manipuló deliberadamente a Sloane durante años"]
Capítulos donde sembrar (tempranos): [ej: 10, 11, 13, 15]
Lo que el lector sabe hasta esos capítulos: [ej: "El lector solo sabe que Linnea murió y le dejó una señal a Sloane. No sabe que la relación era manipuladora."]


REESCRITURAS ESTRUCTURALES
────────────────────────────────────
[Lista los cambios que requieren reescritura amplia de capítulos]

Capítulo(s) afectado(s): [números]
Qué cambiar: [descripción del cambio estructural]
Por qué: [justificación narrativa]


NOTA ACTUAL / POTENCIAL
────────────────────────────────────
Nota actual: [ej: 7,5/10]
Nota potencial tras revisión: [ej: 8,5–9/10]
`;

// ─── component ───────────────────────────────────────────────────────────────

export interface ExternalReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID del proyecto normal. Mutuamente excluyente con manuscriptId. */
  projectId?: number;
  projectTitle?: string;
  /** ID del manuscrito importado. Mutuamente excluyente con projectId. */
  manuscriptId?: number;
  manuscriptTitle?: string;
}

export function ExternalReviewDialog({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  manuscriptId,
  manuscriptTitle,
}: ExternalReviewDialogProps) {
  // Derivar las URLs base según el tipo de fuente
  const isManuscript = manuscriptId != null;
  const baseUrl = isManuscript
    ? `/api/imported-manuscripts/${manuscriptId}/external-review`
    : `/api/projects/${projectId}/external-review`;
  const streamUrl = isManuscript
    ? `/api/imported-manuscripts/${manuscriptId}/external-review/stream`
    : `/api/projects/${projectId}/stream`;
  const displayTitle = isManuscript ? manuscriptTitle : projectTitle;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"plantilla" | "plan" | "ejecucion">("plantilla");
  const [critiqueText, setCritiqueText] = useState(CRITIQUE_TEMPLATE);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<Array<{ id: string; msg: string; ok?: boolean }>>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: reviewState, refetch: refetchState } = useQuery<ExternalReviewState>({
    queryKey: [baseUrl],
    enabled: open,
    refetchInterval: running ? 3000 : false,
  });

  const plan = reviewState?.pendingExternalReview ?? null;

  // Auto-select all pending when plan arrives
  useEffect(() => {
    if (plan) {
      setSelectedIds(new Set(plan.interventions.filter(i => i.status === "pending").map(i => i.id)));
      setTab("plan");
    }
  }, [plan?.parsedAt]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((id: string, msg: string, ok?: boolean) => {
    setLogs(prev => [...prev, { id: `${Date.now()}-${prev.length}`, msg, ok }]);
  }, []);

  // SSE listener
  useEffect(() => {
    if (!open) return;
    const es = new EventSource(streamUrl);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "external_review_parsed") {
          setParsing(false);
          refetchState();
          toast({ title: "Crítica analizada", description: `${data.plan?.interventions?.length ?? 0} intervenciones identificadas` });
        }
        if (data.type === "external_review_parse_error") {
          setParsing(false);
          toast({ title: "Error al analizar", description: data.message, variant: "destructive" });
        }
        if (data.type === "external_review_started") {
          setTab("ejecucion");
          addLog("sys", `▶ Iniciando ${data.count} intervenciones...`);
        }
        if (data.type === "intervention_start") {
          addLog(data.id, `⚙ [${data.type}] ${data.titulo}...`);
        }
        if (data.type === "intervention_progress") {
          addLog(data.id, `  ${data.message}`);
        }
        if (data.type === "intervention_done") {
          addLog(data.id, `✓ Completada`, true);
          refetchState();
        }
        if (data.type === "intervention_failed") {
          addLog(data.id, `✗ Error: ${data.error}`, false);
          refetchState();
        }
        if (data.type === "external_review_done") {
          setRunning(false);
          refetchState();
          qc.invalidateQueries({ queryKey: ["/api/projects"] });
          qc.invalidateQueries({ queryKey: ["/api/imported-manuscripts"] });
          toast({ title: data.status === "completed" ? "Revisión completada" : "Revisión con errores", description: data.status === "completed" ? "Todas las intervenciones aplicadas" : "Algunas intervenciones fallaron" });
        }
      } catch {}
    };
    return () => es.close();
  }, [open, streamUrl]);

  const handleParse = async () => {
    if (!critiqueText.trim() || critiqueText === CRITIQUE_TEMPLATE) {
      toast({ title: "Crítica vacía", description: "Escribe o pega la crítica antes de analizar", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const res = await fetch(`${baseUrl}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ critiqueText }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Error al analizar");
      }
      // Result arrives via SSE
    } catch (err: any) {
      setParsing(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRun = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "Sin selección", description: "Selecciona al menos una intervención", variant: "destructive" });
      return;
    }
    setRunning(true);
    setLogs([]);
    try {
      const res = await fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interventionIds: [...selectedIds] }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Error al iniciar");
      }
    } catch (err: any) {
      setRunning(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleIntervention = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const statusIcon = (status: InterventionStatus) => {
    if (status === "done") return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />;
    return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Revisión Editorial Externa
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{displayTitle}</span> — Aplica una crítica de lector externo con agentes especializados
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="plantilla" className="flex-1">
              <FileText className="h-4 w-4 mr-2" />
              1. Crítica
            </TabsTrigger>
            <TabsTrigger value="plan" className="flex-1" disabled={!plan}>
              {plan ? <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" /> : <Clock className="h-4 w-4 mr-2" />}
              2. Plan {plan ? `(${plan.interventions.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="ejecucion" className="flex-1" disabled={!plan}>
              <Play className="h-4 w-4 mr-2" />
              3. Ejecución
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: PLANTILLA ─────────────────────────────────── */}
          <TabsContent value="plantilla" className="mt-3">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Rellena la plantilla o pega directamente la crítica completa. Cuanto más detallada, más preciso será el plan.
              </p>
              <Textarea
                className="font-mono text-xs resize-none h-[340px]"
                value={critiqueText}
                onChange={e => setCritiqueText(e.target.value)}
                placeholder="Escribe o pega la crítica aquí..."
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{critiqueText.length.toLocaleString()} caracteres</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCritiqueText(CRITIQUE_TEMPLATE)}>
                    Restaurar plantilla
                  </Button>
                  <Button size="sm" onClick={handleParse} disabled={parsing}>
                    {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    {parsing ? "Analizando..." : "Analizar crítica"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── TAB 2: PLAN ──────────────────────────────────────── */}
          <TabsContent value="plan" className="mt-3">
            {plan && (
              <div className="flex flex-col gap-3">
                {/* Summary */}
                <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                  <p>{plan.overallSummary}</p>
                  {(plan.currentScore || plan.potentialScore) && (
                    <p className="text-xs text-muted-foreground">
                      {plan.currentScore && <span>Nota actual: <strong>{plan.currentScore}</strong></span>}
                      {plan.currentScore && plan.potentialScore && <span> → </span>}
                      {plan.potentialScore && <span>Potencial: <strong>{plan.potentialScore}</strong></span>}
                    </p>
                  )}
                </div>

                {/* Select all / none */}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => {
                    const pending = plan.interventions.filter(i => i.status === "pending");
                    setSelectedIds(selectedIds.size === pending.length ? new Set() : new Set(pending.map(i => i.id)));
                  }}>
                    {selectedIds.size === plan.interventions.filter(i => i.status === "pending").length ? "Deseleccionar todo" : "Seleccionar todo"}
                  </Button>
                  <span className="text-xs text-muted-foreground">{selectedIds.size} seleccionadas</span>
                </div>

                <ScrollArea className="h-[320px] border rounded-md">
                  <div className="space-y-2 p-1">
                    {plan.interventions.map(iv => {
                      const expanded = expandedIds.has(iv.id);
                      const isDone = iv.status === "done";
                      return (
                        <div key={iv.id} className={`border rounded-md overflow-hidden ${isDone ? "opacity-60" : ""}`}>
                          <div className="flex items-center gap-2 p-3">
                            {!isDone && iv.status === "pending" && (
                              <Checkbox
                                checked={selectedIds.has(iv.id)}
                                onCheckedChange={() => toggleIntervention(iv.id)}
                              />
                            )}
                            {statusIcon(iv.status)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">{iv.titulo}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLOR[iv.type]}`}>
                                  {TYPE_LABEL[iv.type]}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[iv.prioridad]}`}>
                                  {iv.prioridad}
                                </span>
                                {iv.capitulosAfectados.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    cap. {iv.capitulosAfectados.join(", ")}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{iv.descripcion}</p>
                            </div>
                            <button className="shrink-0 p-1" onClick={() => toggleExpand(iv.id)}>
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </div>
                          {expanded && (
                            <div className="border-t bg-muted/30 px-3 py-2 text-xs space-y-1">
                              <p><span className="font-medium">Instrucción:</span> {iv.instruccion}</p>
                              {iv.sembraRevelacion && (
                                <p><span className="font-medium">Revelación:</span> {iv.sembraRevelacion}</p>
                              )}
                              {iv.errorMsg && (
                                <p className="text-destructive"><span className="font-medium">Error:</span> {iv.errorMsg}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                <Button
                  className="shrink-0 w-full"
                  onClick={handleRun}
                  disabled={running || selectedIds.size === 0}
                >
                  {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  {running ? "Ejecutando..." : `Aplicar ${selectedIds.size} intervención(es)`}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── TAB 3: EJECUCIÓN ─────────────────────────────────── */}
          <TabsContent value="ejecucion" className="mt-3">
            <div className="flex flex-col gap-3">
            <ScrollArea className="h-[320px] border rounded-md bg-black/90">
              <div className="p-3 font-mono text-xs space-y-0.5">
                {logs.length === 0 && (
                  <p className="text-gray-500">Esperando inicio de ejecución...</p>
                )}
                {logs.map(l => (
                  <p key={l.id} className={l.ok === true ? "text-green-400" : l.ok === false ? "text-red-400" : "text-gray-300"}>
                    {l.msg}
                  </p>
                ))}
                <div ref={logsEndRef} />
              </div>
            </ScrollArea>

            {plan && (
              <div className="shrink-0 grid grid-cols-3 gap-2 text-center">
                {(["pending", "done", "failed"] as const).map(st => {
                  const count = plan.interventions.filter(i => i.status === st).length;
                  return (
                    <div key={st} className="border rounded p-2">
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground capitalize">{st === "pending" ? "Pendientes" : st === "done" ? "Completadas" : "Fallidas"}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {!running && plan?.interventions.some(i => i.status === "failed") && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedIds(new Set(plan.interventions.filter(i => i.status === "failed").map(i => i.id)));
                  setTab("plan");
                }}
              >
                <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
                Reintentar fallidas
              </Button>
            )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
