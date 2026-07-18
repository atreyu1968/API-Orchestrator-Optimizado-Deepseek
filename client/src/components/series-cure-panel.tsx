import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Stethoscope, Loader2, XCircle, CheckCircle2, AlertTriangle, Circle, ShieldCheck, Activity } from "lucide-react";

// [Fix194] Panel de la Cura de Serie: lanza el pipeline autonomo por volumen
// (arco -> correcciones -> reescritura profunda -> pulido -> veredicto) y
// muestra el progreso con polling mientras corre.

interface CureVolume {
  volumeType: string;
  volumeId: number;
  title: string;
  seriesOrder: number;
  steps: { arcVerify: string; corrections: string; mdClean?: string; deepRewrite: string; polish: string; issues?: string; seam?: string };
  arcScore?: number;
  arcPassed?: boolean;
  correctionsApplied?: number;
  markdownCleaned?: number;
  chaptersRewritten?: number;
  betaScore?: number | null;
  holisticScore?: number | null;
  polishProgress?: {
    beta: number | null;
    holistico: number | null;
    ultimaActividad?: string;
    ultimaActividadAt?: string;
    fase?: string;
  };
  reviewNotes?: string;
  issuesResolved?: number;
  seamSummary?: string;
  verdict?: string;
  rescueRounds?: number;
  suggestions: string[];
  error?: string;
}

interface SagaVerdict {
  notaDeSerie: number;
  promesasSinPago: string[];
  escaladaEntreVolumenes: string;
  evolucionPersonajes: string;
  resumen: string;
  correccionesAplicadas: number;
  sugerencias: string[];
}

interface CureState {
  status: "idle" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  startedAt?: string;
  finishedAt?: string;
  currentVolumeIndex?: number;
  volumes?: CureVolume[];
  log?: { at: string; message: string }[];
  sagaVerdict?: SagaVerdict;
  sagaStep?: string;
}

const STEP_LABELS: Record<string, string> = {
  arcVerify: "Arco",
  corrections: "Hitos",
  mdClean: "Markdown",
  deepRewrite: "Reescritura",
  polish: "Pulido",
  issues: "Issues",
  seam: "Costura",
};

const VERDICT_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  publicable: { label: "Publicable", variant: "default" },
  publicable_con_reservas: { label: "Publicable con reservas", variant: "secondary" },
  necesita_cirugia: { label: "Necesita cirugia", variant: "destructive" },
  sin_veredicto: { label: "Sin veredicto", variant: "secondary" },
};

function StepBadge({ name, status }: { name: string; status: string }) {
  const icon =
    status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> :
    status === "done" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> :
    status === "validated" ? <ShieldCheck className="h-3 w-3 text-green-600" /> :
    status === "failed" ? <XCircle className="h-3 w-3 text-destructive" /> :
    status === "skipped" ? <Circle className="h-3 w-3 text-muted-foreground" /> :
    <Circle className="h-3 w-3 text-muted-foreground/40" />;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid={`step-cure-${name}`}>
      {icon}
      {STEP_LABELS[name] || name}
      {status === "validated" && <span className="text-green-600">(validado)</span>}
    </span>
  );
}

// [Fix203] Actividad en vivo del volumen en pulido: el paso "polish" dura
// horas y el estado de la cura solo cambia en las fronteras de paso; este
// ticker lee los activity-logs del proyecto (endpoint ya existente) para que
// el panel muestre que esta pasando DENTRO del pulido.
interface ActivityLogEntry {
  id: number;
  agentRole?: string | null;
  message: string;
  createdAt: string;
}

function PolishActivityTicker({ projectId }: { projectId: number }) {
  const { data: logs } = useQuery<ActivityLogEntry[]>({
    queryKey: [`/api/projects/${projectId}/activity-logs?limit=5`],
    refetchInterval: 10000,
  });
  if (!logs || logs.length === 0) return null;
  // El endpoint devuelve ascendente (mas antiguo primero): mostrar los ultimos.
  const recent = logs.slice(-3).reverse();
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-2" data-testid={`ticker-polish-activity-${projectId}`}>
      {recent.map((l, i) => (
        <p key={l.id} className={`text-xs flex items-start gap-1 ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
          <Activity className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="font-medium">{new Date(l.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
            {l.agentRole ? ` · ${l.agentRole}` : ""} — {l.message}
          </span>
        </p>
      ))}
    </div>
  );
}

export function SeriesCurePanel({ seriesId }: { seriesId: number }) {
  const { toast } = useToast();

  const { data: cure } = useQuery<CureState>({
    queryKey: [`/api/series/${seriesId}/cure-status`],
    refetchInterval: (query) => (query.state.data?.status === "running" ? 5000 : false),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/series/${seriesId}/cure`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/series/${seriesId}/cure-status`] });
      toast({ title: "Cura de serie iniciada", description: data.message });
    },
    onError: () => {
      toast({ title: "No se pudo iniciar la cura", description: "Puede que ya haya una cura en marcha.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/series/${seriesId}/cure-cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/series/${seriesId}/cure-status`] });
      toast({ title: "Cancelacion solicitada", description: "Se detendra al terminar el paso en curso." });
    },
  });

  const running = cure?.status === "running";
  const lastLog = cure?.log && cure.log.length > 0 ? cure.log[cure.log.length - 1].message : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={() => startMutation.mutate()}
          disabled={running || startMutation.isPending}
          data-testid="button-start-series-cure"
        >
          {running || startMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Stethoscope className="h-4 w-4 mr-1" />}
          {running ? "Cura en marcha..." : "Curar serie"}
        </Button>
        {running && (
          <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} data-testid="button-cancel-series-cure">
            <XCircle className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
        )}
        {cure?.status && cure.status !== "idle" && !running && (
          <Badge variant={cure.status === "completed" ? "default" : "secondary"} data-testid="badge-cure-status">
            {cure.status === "completed" ? "Cura terminada" : cure.status === "cancelled" ? "Cancelada" : cure.status === "interrupted" ? "Interrumpida (se reanudara sola)" : "Fallida"}
          </Badge>
        )}
      </div>

      {running && lastLog && (
        <p className="text-xs text-muted-foreground" data-testid="text-cure-last-log">{lastLog}</p>
      )}

      {cure?.volumes && cure.volumes.length > 0 && (
        <div className="space-y-2">
          {cure.volumes.map((v) => {
            const verdict = v.verdict ? VERDICT_META[v.verdict] : null;
            return (
              <Card key={`${v.volumeType}-${v.volumeId}`} data-testid={`card-cure-volume-${v.volumeId}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">Vol. {v.seriesOrder}: {v.title}</span>
                    {verdict && <Badge variant={verdict.variant} data-testid={`badge-cure-verdict-${v.volumeId}`}>{verdict.label}{(v.rescueRounds ?? 0) > 0 ? ` · ${v.rescueRounds} rescate(s)` : ""}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {Object.entries(v.steps).map(([name, status]) => (
                      <StepBadge key={name} name={name} status={status} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    {v.arcScore !== undefined && <span data-testid={`text-cure-arc-${v.volumeId}`}>Arco: {v.arcScore}/100</span>}
                    {v.correctionsApplied !== undefined && <span>Hitos corregidos: {v.correctionsApplied}</span>}
                    {v.chaptersRewritten !== undefined && <span>Caps reescritos: {v.chaptersRewritten}</span>}
                    {v.betaScore != null && <span data-testid={`text-cure-beta-${v.volumeId}`}>Beta: {v.betaScore}/10</span>}
                    {v.holisticScore != null && <span>Holistico: {v.holisticScore}/10</span>}
                    {v.issuesResolved !== undefined && <span>Issues resueltos: {v.issuesResolved}</span>}
                  </div>
                  {v.steps.polish === "running" && v.polishProgress && (
                    <p className="text-xs text-muted-foreground" data-testid={`text-cure-polish-progress-${v.volumeId}`}>
                      Beta {v.polishProgress.beta ?? "?"} / Holistico {v.polishProgress.holistico ?? "?"}
                      {v.polishProgress.fase ? ` — ${v.polishProgress.fase}` : ""}
                      {v.polishProgress.ultimaActividadAt
                        ? ` (${new Date(v.polishProgress.ultimaActividadAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })})`
                        : ""}
                    </p>
                  )}
                  {v.steps.polish === "running" && v.volumeType === "project" && (
                    <PolishActivityTicker projectId={v.volumeId} />
                  )}
                  {v.seamSummary && (
                    <p className="text-xs text-muted-foreground" data-testid={`text-cure-seam-${v.volumeId}`}>
                      Costura: {v.seamSummary}
                    </p>
                  )}
                  {v.reviewNotes && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer" data-testid={`summary-cure-review-${v.volumeId}`}>Notas de lectura (Beta/Holistico)</summary>
                      <pre className="whitespace-pre-wrap font-sans mt-1 max-h-48 overflow-y-auto">{v.reviewNotes}</pre>
                    </details>
                  )}
                  {v.suggestions.length > 0 && (
                    <div className="space-y-1">
                      {v.suggestions.map((sug, i) => (
                        <p key={i} className="text-xs flex items-start gap-1 text-amber-700 dark:text-amber-400" data-testid={`text-cure-suggestion-${v.volumeId}-${i}`}>
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {sug}
                        </p>
                      ))}
                    </div>
                  )}
                  {v.error && <p className="text-xs text-destructive">{v.error}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(cure?.sagaVerdict || cure?.sagaStep === "running") && (
        <Card data-testid="card-saga-verdict">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium">Veredicto de saga</span>
              {cure.sagaStep === "running" ? (
                <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin inline" />Leyendo la serie del tiron...</Badge>
              ) : cure.sagaVerdict ? (
                <Badge variant={cure.sagaVerdict.notaDeSerie >= 8 ? "default" : "secondary"} data-testid="badge-saga-score">
                  Nota de serie: {cure.sagaVerdict.notaDeSerie}/10
                </Badge>
              ) : null}
            </div>
            {cure.sagaVerdict && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p data-testid="text-saga-resumen">{cure.sagaVerdict.resumen}</p>
                {cure.sagaVerdict.escaladaEntreVolumenes && <p><span className="font-medium">Escalada:</span> {cure.sagaVerdict.escaladaEntreVolumenes}</p>}
                {cure.sagaVerdict.evolucionPersonajes && <p><span className="font-medium">Personajes:</span> {cure.sagaVerdict.evolucionPersonajes}</p>}
                {cure.sagaVerdict.promesasSinPago.length > 0 && (
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400">Promesas sin pago:</p>
                    {cure.sagaVerdict.promesasSinPago.map((p, i) => (
                      <p key={i} className="flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-600" />{p}</p>
                    ))}
                  </div>
                )}
                <p>Correcciones de saga aplicadas: {cure.sagaVerdict.correccionesAplicadas}</p>
                {cure.sagaVerdict.sugerencias.length > 0 && (
                  <div className="space-y-1">
                    {cure.sagaVerdict.sugerencias.map((s, i) => (
                      <p key={i} className="flex items-start gap-1 text-amber-700 dark:text-amber-400" data-testid={`text-saga-suggestion-${i}`}>
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
