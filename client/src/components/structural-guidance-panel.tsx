import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// [Fix115] Panel de guidance estructural manual. Se monta en el dashboard
// cuando un proyecto entra en status="awaiting_structural_guidance" porque
// el bucle del Auditor Estructural no alcanzó el mínimo publicable (7/10)
// tras 8 iteraciones + audit on-demand de la World Bible. Muestra:
//  - El mejor score alcanzado vs el umbral
//  - La lista de problemas residuales (severidad, area, capítulos, sugerencia)
//  - Un textarea donde el usuario escribe guidance concreta para el Arquitecto
//    (ej. "mueve el reveal del traidor al cap 18", "elimina el subplot X").
// Al enviar, llama al endpoint POST /api/projects/:id/structural-guidance que
// appendea la guidance a architectInstructions, marca status="idle" y reinicia
// generateNovel reusando el snapshot del bestSA como Fase 1 fortificada.

interface ProblemaResidual {
  severidad: "alta" | "media" | "baja";
  area: string;
  capitulos: number[];
  descripcion: string;
  sugerencia: string;
}

interface PendingStructuralGuidance {
  bestScore: number;
  threshold: number;
  problemas: ProblemaResidual[];
  resumenAuditor?: string;
  savedAt: string;
  iterations: number;
  wbaExternalRan: boolean;
  // [Fix118] Auto-guidance mecánica pre-rellenada cuando el sistema ya
  // intentó una pasada extra con correcciones automáticas y aun así no
  // alcanzó el umbral.
  autoMechanicalGuidance?: string;
  autoMechanicalGuidanceApplied?: boolean;
}

interface Props {
  project: {
    id: number;
    title: string;
    pendingStructuralGuidance: PendingStructuralGuidance;
  };
  onSubmitted: () => void;
}

const SEVERIDAD_COLOR: Record<string, string> = {
  alta: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40",
  media: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  baja: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40",
};

export function StructuralGuidancePanel({ project, onSubmitted }: Props) {
  const pending = project.pendingStructuralGuidance;
  // [Fix118] Si el sistema ya generó una auto-guidance mecánica en su
  // pasada extra automática, la pre-rellenamos en el textarea para que el
  // usuario solo tenga que editarla o enviarla tal cual (en vez de
  // escribirla desde cero).
  const [guidance, setGuidance] = useState(pending.autoMechanicalGuidance || "");
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/structural-guidance`, { guidance });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Guidance enviada", description: "El Arquitecto va a reanudar el rediseño con tus instrucciones." });
      setGuidance("");
      onSubmitted();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "No se pudo enviar la guidance", variant: "destructive" });
    },
  });

  const altas = pending.problemas.filter(p => p.severidad === "alta").length;
  const medias = pending.problemas.filter(p => p.severidad === "media").length;
  const bajas = pending.problemas.filter(p => p.severidad === "baja").length;

  return (
    <Card className="border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20" data-testid="card-structural-guidance">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          La estructura necesita tu guidance ({pending.bestScore}/10 &lt; {pending.threshold}/10)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Tras <strong>{pending.iterations} iteraciones</strong> del Auditor Estructural
          {pending.wbaExternalRan ? " + un audit adicional del Auditor de World Bible" : ""}
          {pending.autoMechanicalGuidanceApplied ? " + una pasada extra con auto-guidance mecánica (Fix118)" : ""}
          , el mejor intento se queda en <strong>{pending.bestScore}/10</strong>, por debajo del mínimo
          publicable de <strong>{pending.threshold}/10</strong>. El sistema no va a escribir la novela
          sobre una escaleta defectuosa. Revisa los problemas residuales y dale al Arquitecto instrucciones
          concretas (por ejemplo: "mueve el reveal del traidor al capítulo 18", "elimina el subplot de Marta",
          "el antagonista debe aparecer ya en el capítulo 3").
        </div>
        {pending.autoMechanicalGuidanceApplied && pending.autoMechanicalGuidance && (
          <div className="rounded-md border border-blue-500/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-sm" data-testid="notice-auto-guidance">
            <div className="font-semibold text-blue-700 dark:text-blue-400">Propuesta automática pre-rellenada</div>
            <div className="mt-1 text-muted-foreground">
              El sistema ha analizado los problemas residuales y ha redactado una guidance mecánica
              determinista que verás abajo en el campo de texto. Puedes editarla o enviarla tal cual.
              Si la envías sin cambios, el Arquitecto rediseñará la escaleta aplicando exactamente esas
              correcciones.
            </div>
          </div>
        )}

        {pending.resumenAuditor && (
          <div className="rounded-md border bg-background/50 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Resumen del Auditor</div>
            <div data-testid="text-auditor-summary">{pending.resumenAuditor}</div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{pending.problemas.length} problemas residuales:</span>
          {altas > 0 && <Badge variant="outline" className={SEVERIDAD_COLOR.alta} data-testid="badge-altas">{altas} altas</Badge>}
          {medias > 0 && <Badge variant="outline" className={SEVERIDAD_COLOR.media} data-testid="badge-medias">{medias} medias</Badge>}
          {bajas > 0 && <Badge variant="outline" className={SEVERIDAD_COLOR.baja} data-testid="badge-bajas">{bajas} bajas</Badge>}
        </div>

        <ScrollArea className="h-64 rounded-md border bg-background/50">
          <div className="space-y-3 p-3">
            {pending.problemas.map((p, i) => (
              <div key={i} className="border-b pb-2 last:border-0 last:pb-0" data-testid={`problema-${i}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className={SEVERIDAD_COLOR[p.severidad] || ""}>{p.severidad}</Badge>
                  <span className="font-mono text-muted-foreground">{p.area}</span>
                  {p.capitulos.length > 0 && (
                    <span className="text-muted-foreground">caps {p.capitulos.join(", ")}</span>
                  )}
                </div>
                <div className="text-sm"><strong>Problema:</strong> {p.descripcion}</div>
                {p.sugerencia && (
                  <div className="mt-1 text-sm text-muted-foreground"><strong>Sugerencia del auditor:</strong> {p.sugerencia}</div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div>
          <label className="mb-1 block text-sm font-medium">Tu guidance al Arquitecto</label>
          <Textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="Escribe instrucciones concretas: qué reorganizar, qué eliminar, qué añadir. Cuanto más específico, mejor. El Arquitecto rediseñará la escaleta sobre el mejor snapshot anterior + tus indicaciones."
            rows={6}
            className="resize-none font-mono text-sm"
            data-testid="textarea-guidance"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{guidance.length} caracteres (mínimo 10)</span>
            <span>Snapshot guardado: {new Date(pending.savedAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={guidance.trim().length < 10 || submitMutation.isPending}
            data-testid="button-submit-guidance"
          >
            {submitMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reanudando...</>
            ) : (
              <><Send className="mr-2 h-4 w-4" />Enviar guidance y reanudar</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
