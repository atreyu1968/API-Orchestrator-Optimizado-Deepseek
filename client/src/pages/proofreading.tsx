import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SpellCheck, Play, Loader2, Trash2, Check, AlertCircle, ChevronDown, FileText, ArrowRight } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface Source {
  sourceType: string;
  sourceId: number;
  title: string;
  chapters: number;
  language: string;
  genre?: string;
}

interface ProofreadingChange {
  tipo: string;
  original: string;
  corregido: string;
  motivo: string;
}

interface ProofreadingChapter {
  id: number;
  chapterNumber: string;
  title: string;
  originalContent: string;
  correctedContent: string | null;
  changes: ProofreadingChange[];
  totalChanges: number;
  qualityLevel: string | null;
  summary: string | null;
  status: string;
}

interface ProofreadingProject {
  id: number;
  title: string;
  sourceType: string;
  sourceId: number;
  genre: string | null;
  language: string | null;
  totalChapters: number;
  processedChapters: number;
  totalChanges: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  chapters?: ProofreadingChapter[];
}

const sourceTypeLabels: Record<string, string> = {
  project: "Proyecto",
  reedit: "Re-edición",
  imported: "Importado",
  translation: "Traducción",
};

const qualityBadge = (level: string | null) => {
  switch (level) {
    case "excelente": return <Badge className="bg-green-600" data-testid="badge-quality-excellent">Excelente</Badge>;
    case "bueno": return <Badge className="bg-blue-600" data-testid="badge-quality-good">Bueno</Badge>;
    case "aceptable": return <Badge variant="secondary" data-testid="badge-quality-acceptable">Aceptable</Badge>;
    case "necesita_revision": return <Badge variant="destructive" data-testid="badge-quality-needs-review">Necesita revisión</Badge>;
    default: return null;
  }
};

const changeBadge = (tipo: string) => {
  const colors: Record<string, string> = {
    ortografia: "bg-red-500",
    tipografia: "bg-orange-500",
    puntuacion: "bg-yellow-600",
    estilo: "bg-blue-500",
    glitch_ia: "bg-purple-600",
    concordancia: "bg-pink-500",
    dialogo: "bg-teal-500",
  };
  return <Badge className={colors[tipo] || "bg-gray-500"} data-testid={`badge-change-${tipo}`}>{tipo}</Badge>;
};

export default function ProofreadingPage() {
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailChapter, setDetailChapter] = useState<ProofreadingChapter | null>(null);
  const { toast } = useToast();

  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ["/api/proofreading/sources/available"],
  });

  const { data: projects = [], isLoading } = useQuery<ProofreadingProject[]>({
    queryKey: ["/api/proofreading"],
    refetchInterval: 5000,
  });

  const { data: selectedDetail } = useQuery<ProofreadingProject>({
    queryKey: ["/api/proofreading", selectedProjectId],
    enabled: !!selectedProjectId,
    refetchInterval: 3000,
  });

  const createMutation = useMutation({
    mutationFn: async (source: Source) => {
      const res = await apiRequest("POST", "/api/proofreading", {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      toast({ title: "Proyecto creado", description: `${data.chapters} capítulos listos para corrección` });
      queryClient.invalidateQueries({ queryKey: ["/api/proofreading"] });
      await apiRequest("POST", `/api/proofreading/${data.id}/start`);
      setSelectedProjectId(data.id);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", `/api/proofreading/${projectId}/apply`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Correcciones aplicadas", description: `${data.applied} de ${data.total} capítulos actualizados en la fuente original` });
      queryClient.invalidateQueries({ queryKey: ["/api/proofreading"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/proofreading/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Eliminado" });
      queryClient.invalidateQueries({ queryKey: ["/api/proofreading"] });
      if (selectedProjectId === deleteId) setSelectedProjectId(null);
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    },
  });

  const handleStart = () => {
    if (!selectedSource) return;
    const [type, id] = selectedSource.split(":");
    const source = sources.find(s => s.sourceType === type && s.sourceId === parseInt(id));
    if (source) createMutation.mutate(source);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary" data-testid="badge-status-pending">Pendiente</Badge>;
      case "processing": return <Badge className="bg-yellow-600 animate-pulse" data-testid="badge-status-processing">Procesando...</Badge>;
      case "completed": return <Badge className="bg-green-600" data-testid="badge-status-completed">Completado</Badge>;
      case "completed_with_errors": return <Badge className="bg-orange-600" data-testid="badge-status-partial">Parcial</Badge>;
      case "error": return <Badge variant="destructive" data-testid="badge-status-error">Error</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SpellCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Corrector Ortotipográfico</h1>
          <p className="text-sm text-muted-foreground">Corrección profesional de ortografía, tipografía y estilo adaptada al género y autor</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva Corrección</CardTitle>
          <CardDescription>Selecciona el libro a corregir. Compatible con proyectos, re-ediciones, importados y traducciones.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="flex-1" data-testid="select-source">
                <SelectValue placeholder="Selecciona un libro..." />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem
                    key={`${s.sourceType}:${s.sourceId}`}
                    value={`${s.sourceType}:${s.sourceId}`}
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{sourceTypeLabels[s.sourceType]}</Badge>
                      {s.title} ({s.chapters} cap. — {s.language?.toUpperCase()})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleStart}
              disabled={!selectedSource || createMutation.isPending}
              data-testid="button-start-proofreading"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Corregir
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <SpellCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No hay correcciones todavía. Selecciona un libro para empezar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition-colors ${selectedProjectId === p.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedProjectId(p.id)}
              data-testid={`card-project-${p.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate" data-testid={`text-title-${p.id}`}>{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {sourceTypeLabels[p.sourceType]} · {p.language?.toUpperCase()} · {p.totalChapters} capítulos
                        {p.totalChanges > 0 && ` · ${p.totalChanges} cambios`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.status === "processing" && (
                      <span className="text-xs text-muted-foreground">{p.processedChapters}/{p.totalChapters}</span>
                    )}
                    {statusBadge(p.status)}
                    {(p.status === "completed" || p.status === "completed_with_errors") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); applyMutation.mutate(p.id); }}
                        disabled={applyMutation.isPending}
                        data-testid={`button-apply-${p.id}`}
                        title="Aplicar correcciones al libro original"
                      >
                        {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Aplicar
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
                      data-testid={`button-delete-${p.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedDetail && selectedDetail.chapters && selectedDetail.chapters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SpellCheck className="h-5 w-5" />
              Capítulos: {selectedDetail.title}
            </CardTitle>
            <CardDescription>
              {selectedDetail.processedChapters}/{selectedDetail.totalChapters} procesados · {selectedDetail.totalChanges} cambios totales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="space-y-1">
              {selectedDetail.chapters.map((ch) => (
                <AccordionItem key={ch.id} value={ch.id.toString()} className="border rounded-lg">
                  <AccordionTrigger className="px-4 py-2 hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <span className="font-medium text-sm">{ch.chapterNumber}{ch.title ? `: ${ch.title}` : ""}</span>
                      <div className="flex items-center gap-2">
                        {ch.status === "completed" ? (
                          <Badge className="bg-green-600 text-xs">{ch.totalChanges} cambios</Badge>
                        ) : ch.status === "processing" ? (
                          <Badge className="bg-yellow-600 animate-pulse text-xs">Procesando...</Badge>
                        ) : ch.status === "error" ? (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Pendiente</Badge>
                        )}
                        {qualityBadge(ch.qualityLevel)}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {ch.status === "completed" ? (
                      <div className="space-y-3">
                        {ch.summary && (
                          <p className="text-sm text-muted-foreground italic">{ch.summary}</p>
                        )}
                        {ch.changes && (ch.changes as ProofreadingChange[]).length > 0 ? (
                          <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {(ch.changes as ProofreadingChange[]).slice(0, 30).map((change, idx) => (
                              <div key={idx} className="text-sm border rounded p-3 bg-muted/30 space-y-1">
                                <div className="flex items-center gap-2">
                                  {changeBadge(change.tipo)}
                                  <span className="text-xs text-muted-foreground">{change.motivo}</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="line-through text-red-500/80 text-xs flex-1">{change.original}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                  <span className="text-green-600 dark:text-green-400 text-xs flex-1">{change.corregido}</span>
                                </div>
                              </div>
                            ))}
                            {(ch.changes as ProofreadingChange[]).length > 30 && (
                              <p className="text-xs text-muted-foreground text-center">
                                ...y {(ch.changes as ProofreadingChange[]).length - 30} cambios más
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-green-600 dark:text-green-400">Sin correcciones necesarias — texto limpio</p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailChapter(ch)}
                          data-testid={`button-view-full-${ch.id}`}
                        >
                          <FileText className="h-4 w-4 mr-1" /> Ver texto corregido completo
                        </Button>
                      </div>
                    ) : ch.status === "error" ? (
                      <div className="flex items-center gap-2 text-destructive text-sm">
                        <AlertCircle className="h-4 w-4" /> {ch.summary || "Error en la corrección"}
                      </div>
                    ) : ch.status === "processing" ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Corrigiendo...
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Pendiente de corrección</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detailChapter} onOpenChange={(open) => !open && setDetailChapter(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Texto corregido — {detailChapter?.chapterNumber}</DialogTitle>
          </DialogHeader>
          {detailChapter?.correctedContent && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-serif text-sm leading-relaxed">
              {detailChapter.correctedContent}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailChapter(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Eliminar corrección"
        description="¿Seguro que quieres eliminar este proyecto de corrección? No afecta al libro original."
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        confirmText="Eliminar"
        variant="destructive"
      />
    </div>
  );
}
