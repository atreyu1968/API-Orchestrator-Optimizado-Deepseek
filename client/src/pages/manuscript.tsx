import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChapterList } from "@/components/chapter-list";
import { ChapterViewer } from "@/components/chapter-viewer";
import { ChatPanel } from "@/components/chat-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, BookOpen, MessageSquare, PenTool, ChevronDown, Wand2, Loader2, Sparkles, Pencil, Check, X, Search, AlertTriangle, CheckCircle2, RotateCcw, Trash2, ShieldAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/project-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Chapter } from "@shared/schema";

function sortChaptersForDisplay<T extends { chapterNumber: number }>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => {
    const orderA = a.chapterNumber === 0 ? -1000 : a.chapterNumber === -1 ? 1000 : a.chapterNumber === -2 ? 1001 : a.chapterNumber;
    const orderB = b.chapterNumber === 0 ? -1000 : b.chapterNumber === -1 ? 1000 : b.chapterNumber === -2 ? 1001 : b.chapterNumber;
    return orderA - orderB;
  });
}

export default function ManuscriptPage() {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [agentType, setAgentType] = useState<"architect" | "reeditor">("architect");
  const [showAutoEditDialog, setShowAutoEditDialog] = useState(false);
  const [autoEditInstructions, setAutoEditInstructions] = useState("");
  const [autoEditCritique, setAutoEditCritique] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [reeditAssessment, setReeditAssessment] = useState<any>(null);
  const [rewriteWarningAcknowledged, setRewriteWarningAcknowledged] = useState(false);
  const { currentProject, isLoading: projectsLoading } = useProject();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const agentLabels = {
    architect: "Arquitecto",
    reeditor: "Re-editor",
  };

  const formatEbookMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/format-ebook`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "chapters"] });
      toast({
        title: "Formato aplicado",
        description: data.message,
      });
      setSelectedChapter(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo formatear el manuscrito",
        variant: "destructive",
      });
    },
  });

  const cloneToReeditMutation = useMutation({
    mutationFn: async (params: { projectId: number; instructions: string; editorialCritique?: string }) => {
      const res = await apiRequest("POST", `/api/projects/${params.projectId}/clone-to-reedit`, {
        instructions: params.instructions,
        ...(params.editorialCritique?.trim() ? { editorialCritique: params.editorialCritique.trim() } : {}),
      });
      return res.json();
    },
    onSuccess: async (data) => {
      toast({
        title: "Proyecto clonado",
        description: `Se creó una copia para re-edición con ${data.chaptersCloned} capítulos.`,
      });
      setShowAutoEditDialog(false);
      setAutoEditInstructions("");
      setAutoEditCritique("");
      // Start the reedit process
      await apiRequest("POST", `/api/reedit-projects/${data.reeditProjectId}/start`);
      // Navigate to the reedit page
      navigate(`/reedit?project=${data.reeditProjectId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo clonar el proyecto",
        variant: "destructive",
      });
    },
  });

  const assessReeditMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/assess-reedit`);
      return res.json();
    },
    onSuccess: (data) => {
      setReeditAssessment(data);
    },
    onError: (error: any) => {
      toast({
        title: "Error al evaluar",
        description: error.message || "No se pudo analizar el manuscrito",
        variant: "destructive",
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      await apiRequest("PATCH", `/api/projects/${currentProject!.id}`, { title: newTitle });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id] });
      toast({ title: "Título actualizado" });
      setEditingTitle(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: chapters = [], isLoading: chaptersLoading } = useQuery<Chapter[]>({
    queryKey: ["/api/projects", currentProject?.id, "chapters"],
    enabled: !!currentProject?.id,
  });

  // [Fix40] Acciones administrativas pendientes (delete_chapter, merge_chapters,
  // etc.) emitidas por el StructuralInstructionTranslator. No se aplican
  // automáticamente; el usuario las revisa y las descarta o las ejecuta a mano.
  const { data: pendingAdminData } = useQuery<{ actions: any[]; count: number }>({
    queryKey: ["/api/projects", currentProject?.id, "pending-admin-actions"],
    enabled: !!currentProject?.id,
  });
  const pendingAdminActions = pendingAdminData?.actions || [];

  const dismissAdminActionMutation = useMutation({
    mutationFn: async (actionId: number | "all") => {
      const url = actionId === "all"
        ? `/api/projects/${currentProject!.id}/pending-admin-actions`
        : `/api/projects/${currentProject!.id}/pending-admin-actions/${actionId}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: (_data, actionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "pending-admin-actions"] });
      toast({
        title: "Descartada",
        description: actionId === "all" ? "Todas las acciones se eliminaron del listado." : "Acción eliminada del listado pendiente.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const adminActionLabel = (type: string): string => {
    switch (type) {
      case "delete_chapter": return "Eliminar capítulo";
      case "merge_chapters": return "Fusionar capítulos";
      case "split_chapter": return "Dividir capítulo";
      case "swap_chapters": return "Intercambiar capítulos";
      case "reorder_chapters": return "Reordenar capítulos";
      case "move_content": return "Mover contenido";
      default: return type;
    }
  };

  const handleDownload = async () => {
    if (!currentProject || chapters.length === 0) return;

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/export-markdown`);
      if (!res.ok) throw new Error("Error al exportar");
      const data = await res.json();
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.title.replace(/\s+/g, '_')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "No se pudo descargar el manuscrito", variant: "destructive" });
    }
  };

  const completedChapters = chapters.filter(c => c.status === "completed");
  const totalWordCount = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Cargando manuscrito...</p>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <BookOpen className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Sin manuscrito</h2>
        <p className="text-muted-foreground max-w-md">
          Crea un nuevo proyecto desde el panel de control para comenzar a generar tu novela
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6" data-testid="manuscript-page">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                data-testid="input-edit-project-title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && titleDraft.trim()) renameMutation.mutate(titleDraft.trim());
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="text-3xl font-bold h-11"
                autoFocus
              />
              <Button
                data-testid="button-save-project-title"
                variant="ghost"
                size="icon"
                onClick={() => titleDraft.trim() && renameMutation.mutate(titleDraft.trim())}
                disabled={renameMutation.isPending || !titleDraft.trim()}
              >
                {renameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button data-testid="button-cancel-project-title" variant="ghost" size="icon" onClick={() => setEditingTitle(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{currentProject.title}</h1>
              <Button
                data-testid="button-edit-project-title"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setTitleDraft(currentProject.title); setEditingTitle(true); }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge variant="secondary">{currentProject.genre}</Badge>
            <Badge variant="outline">{currentProject.tone}</Badge>
            <span className="text-sm text-muted-foreground">
              {completedChapters.length}/{currentProject.chapterCount} capítulos
            </span>
            <span className="text-sm text-muted-foreground">
              {totalWordCount.toLocaleString()} palabras
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={showChat ? "secondary" : "outline"}
                  data-testid="button-toggle-chat"
                >
                  {agentType === "architect" ? (
                    <MessageSquare className="h-4 w-4 mr-2" />
                  ) : (
                    <PenTool className="h-4 w-4 mr-2" />
                  )}
                  {showChat ? `Cerrar ${agentLabels[agentType]}` : "Agentes IA"}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem 
                  onClick={() => { setAgentType("architect"); setShowChat(true); }}
                  data-testid="menu-agent-architect"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Arquitecto (trama y estructura)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => { setAgentType("reeditor"); setShowChat(true); }}
                  data-testid="menu-agent-reeditor"
                >
                  <PenTool className="h-4 w-4 mr-2" />
                  Re-editor (correcciones y mejoras)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {showChat && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChat(false)}
                data-testid="button-close-chat"
              >
                Cerrar
              </Button>
            )}
          </div>
          <Button 
            variant="outline"
            onClick={handleDownload}
            disabled={completedChapters.length === 0}
            data-testid="button-download-manuscript"
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar MD
          </Button>
          {currentProject.status === "completed" && (
            <Button
              variant="outline"
              onClick={() => {
                window.open(`/api/projects/${currentProject.id}/export-docx`, "_blank");
              }}
              data-testid="button-export-docx-manuscript"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar Word
            </Button>
          )}
          {completedChapters.length > 0 && (
            <Button
              variant="outline"
              onClick={() => currentProject && formatEbookMutation.mutate(currentProject.id)}
              disabled={formatEbookMutation.isPending}
              data-testid="button-format-ebook"
            >
              {formatEbookMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Formatear eBook
            </Button>
          )}
          {completedChapters.length > 0 && (
            <Button
              variant="default"
              onClick={() => setShowAutoEditDialog(true)}
              data-testid="button-auto-reedit"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Re-edición Automática
            </Button>
          )}
        </div>
      </div>

      {/* Auto Re-edit Dialog */}
      <Dialog open={showAutoEditDialog} onOpenChange={(open) => {
        setShowAutoEditDialog(open);
        if (!open) {
          setAutoEditInstructions("");
          setAutoEditCritique("");
          setReeditAssessment(null);
          setRewriteWarningAcknowledged(false);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Re-edición Automática</DialogTitle>
            <DialogDescription>
              El sistema creará una copia del manuscrito y aplicará las instrucciones de edición automáticamente a todos los capítulos. El manuscrito original no se modificará.
            </DialogDescription>
          </DialogHeader>

          {reeditAssessment && reeditAssessment.assessment && (
            <div className="border rounded-lg p-4 space-y-3" data-testid="reedit-assessment-results">
              <div className="flex items-center gap-2">
                {reeditAssessment.assessment.recommendation === "reedit" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                <h4 className="font-semibold text-base">
                  {reeditAssessment.assessment.recommendation === "reedit"
                    ? "Recomendación: Re-editar"
                    : "Recomendación: Reescribir desde cero"}
                </h4>
                <Badge variant={reeditAssessment.assessment.recommendation === "reedit" ? "default" : "destructive"}>
                  {reeditAssessment.assessment.currentScore}/10
                </Badge>
                <Badge variant="outline">
                  Confianza: {reeditAssessment.assessment.confidence}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">{reeditAssessment.assessment.summary}</p>

              {reeditAssessment.existingFinalScore && (
                <p className="text-xs text-muted-foreground">
                  Puntuación final anterior: {reeditAssessment.existingFinalScore}/10 | Capítulos analizados: {reeditAssessment.chaptersSampled} de {reeditAssessment.totalChapters}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "prose", label: "Prosa y estilo" },
                  { key: "structure", label: "Estructura" },
                  { key: "characters", label: "Personajes" },
                  { key: "dialogue", label: "Diálogos" },
                  { key: "pacing", label: "Ritmo" },
                  { key: "coherence", label: "Coherencia" },
                ].map(({ key, label }) => {
                  const item = reeditAssessment.assessment[key];
                  if (!item) return null;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{label}</span>
                        <span className={`font-bold ${item.score >= 7 ? "text-green-600 dark:text-green-400" : item.score >= 5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                          {item.score}/10
                        </span>
                      </div>
                      <Progress value={item.score * 10} className="h-1.5" />
                      <p className="text-[11px] text-muted-foreground leading-tight">{item.comment}</p>
                    </div>
                  );
                })}
              </div>

              {reeditAssessment.assessment.recommendation === "reedit" && reeditAssessment.assessment.reeditEstimate && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2">
                  <p className="text-xs text-green-700 dark:text-green-300">
                    <strong>Esfuerzo estimado:</strong> {reeditAssessment.assessment.reeditEstimate}
                  </p>
                </div>
              )}

              {reeditAssessment.assessment.recommendation === "rewrite" && reeditAssessment.assessment.rewriteJustification && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Por qué reescribir:</strong> {reeditAssessment.assessment.rewriteJustification}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="instructions">Instrucciones de edición</Label>
              <Textarea
                id="instructions"
                placeholder="Escribe las instrucciones de edición. Ejemplos:&#10;&#10;- Recortar 20% de introspección en todos los capítulos&#10;- Añadir más tensión y ganchos al final de cada capítulo&#10;- Eliminar repeticiones y mejorar el ritmo&#10;- Mantener las escenas de clímax sin modificar"
                value={autoEditInstructions}
                onChange={(e) => setAutoEditInstructions(e.target.value)}
                className="min-h-[150px]"
                data-testid="input-auto-edit-instructions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editorial-critique">Crítica editorial (opcional)</Label>
              <Textarea
                id="editorial-critique"
                placeholder="Pega aquí el feedback de un editor, beta-reader o crítico externo. Ejemplos:&#10;&#10;- Los diálogos del capítulo 5 suenan artificiales&#10;- El ritmo decae en la segunda mitad&#10;- El personaje secundario María necesita más desarrollo&#10;- Las descripciones de paisajes son excesivas"
                value={autoEditCritique}
                onChange={(e) => setAutoEditCritique(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-auto-edit-critique"
              />
              <p className="text-xs text-muted-foreground">
                Si tienes feedback de un editor o beta-reader, pégalo aquí. Se usará como guía prioritaria durante la re-edición.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p><strong>Consejo:</strong> Sé específico. Indica qué capítulos afectar, porcentajes de recorte, elementos a preservar, y qué tipo de mejoras aplicar.</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowAutoEditDialog(false); setReeditAssessment(null); }}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (currentProject) {
                  assessReeditMutation.mutate(currentProject.id);
                }
              }}
              disabled={assessReeditMutation.isPending}
              data-testid="button-assess-reedit"
            >
              {assessReeditMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analizando...
                </>
              ) : reeditAssessment ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Re-evaluar
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Evaluar manuscrito
                </>
              )}
            </Button>
            {reeditAssessment?.assessment?.recommendation === "rewrite" && !rewriteWarningAcknowledged ? (
              <Button
                variant="destructive"
                onClick={() => setRewriteWarningAcknowledged(true)}
                disabled={!autoEditInstructions.trim()}
                data-testid="button-acknowledge-rewrite-warning"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Re-editar de todos modos
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (currentProject && autoEditInstructions.trim()) {
                    cloneToReeditMutation.mutate({
                      projectId: currentProject.id,
                      instructions: autoEditInstructions,
                      editorialCritique: autoEditCritique,
                    });
                  }
                }}
                disabled={!autoEditInstructions.trim() || cloneToReeditMutation.isPending}
                data-testid="button-start-auto-reedit"
              >
                {cloneToReeditMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Clonando...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Iniciar Re-edición
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* [Fix40] Card de acciones administrativas pendientes. Solo visible si
           hay acciones emitidas por el StructuralInstructionTranslator que el
           sistema NO aplicó automáticamente por ser destructivas. */}
      {pendingAdminActions.length > 0 && (
        <Card className="mb-4 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-pending-admin-actions">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <ShieldAlert className="h-5 w-5" />
              Acciones administrativas pendientes ({pendingAdminActions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Operaciones destructivas que el sistema detectó pero <strong>NO aplicó automáticamente</strong>. Revisa cada una y, si quieres ejecutarla, hazlo manualmente desde la lista de capítulos. Cuando termines (o si decides ignorarla), descártala para limpiar este listado.
            </p>
            <div className="space-y-1.5">
              {pendingAdminActions.map((action: any) => (
                <div
                  key={action.id}
                  className="flex items-start justify-between gap-3 p-2 rounded border border-amber-200 dark:border-amber-800 bg-background"
                  data-testid={`row-admin-action-${action.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs" data-testid={`badge-admin-action-type-${action.id}`}>
                        {adminActionLabel(action.type)}
                      </Badge>
                      <span className="text-sm font-medium" data-testid={`text-admin-action-target-${action.id}`}>
                        {action.targetLabel || `Cap. ${action.targetChapter}`}
                      </span>
                      {typeof action.secondaryChapter === "number" && (
                        <span className="text-xs text-muted-foreground">
                          → afecta también a Cap. {action.secondaryChapter}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-admin-action-reason-${action.id}`}>
                      {action.reason}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAdminActionMutation.mutate(action.id)}
                    disabled={dismissAdminActionMutation.isPending}
                    data-testid={`button-dismiss-admin-action-${action.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {pendingAdminActions.length > 1 && (
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dismissAdminActionMutation.mutate("all")}
                  disabled={dismissAdminActionMutation.isPending}
                  data-testid="button-dismiss-all-admin-actions"
                >
                  Descartar todas
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className={`flex-1 grid grid-cols-1 gap-6 min-h-0 ${showChat ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Capítulos</CardTitle>
          </CardHeader>
          <CardContent>
            <ChapterList 
              chapters={sortChaptersForDisplay(chapters)}
              selectedChapterId={selectedChapter?.id}
              onSelectChapter={setSelectedChapter}
              projectId={currentProject?.id}
            />
          </CardContent>
        </Card>

        <Card className={`flex flex-col ${showChat ? "lg:col-span-2" : "lg:col-span-2"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Vista Previa</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <ChapterViewer chapter={selectedChapter} />
          </CardContent>
        </Card>

        {showChat && currentProject && (
          <ChatPanel
            agentType={agentType}
            projectId={currentProject.id}
            chapterNumber={selectedChapter?.chapterNumber}
            className="lg:col-span-1 h-[calc(100vh-220px)]"
            onClose={() => setShowChat(false)}
          />
        )}
      </div>
    </div>
  );
}
