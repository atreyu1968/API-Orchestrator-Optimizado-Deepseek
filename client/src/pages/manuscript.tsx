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
import { Download, BookOpen, MessageSquare, PenTool, ChevronDown, Wand2, Loader2, Sparkles, Pencil, Check, X, Search, AlertTriangle, CheckCircle2, RotateCcw, Trash2, ShieldAlert, ShieldCheck } from "lucide-react";
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
  // [Fix249] Sugerencias de titulo por IA para la novela
  const [titleSuggestions, setTitleSuggestions] = useState<string[] | null>(null);
  const [reeditAssessment, setReeditAssessment] = useState<any>(null);
  const [rewriteWarningAcknowledged, setRewriteWarningAcknowledged] = useState(false);
  const { currentProject, isLoading: projectsLoading } = useProject();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // [Fix259] Verificacion de datos de TODA la novela: estado del runner
  const [factCheckReportOpen, setFactCheckReportOpen] = useState(false);
  const { data: novelFactCheck } = useQuery<any>({
    queryKey: ["/api/projects", currentProject?.id, "fact-check-novel", "status"],
    enabled: !!currentProject,
    refetchInterval: (query) => (query.state.data as any)?.status === "running" ? 4000 : false,
  });
  const novelFactCheckRunning = novelFactCheck?.status === "running";

  // [Fix265] Tramas colgantes pendientes (auditor de cierre) + resolucion manual
  const { data: plotThreadsPendingData } = useQuery<{ pendientes: any[]; count: number }>({
    queryKey: ["/api/projects", currentProject?.id, "plot-threads-pending"],
    enabled: !!currentProject,
  });
  const plotThreadsPending = plotThreadsPendingData?.pendientes || [];
  const resolvePlotThreadMutation = useMutation({
    mutationFn: async (nombres: string[]) => {
      const res = await apiRequest("POST", `/api/projects/${currentProject!.id}/plot-threads-pending/resolve`, { nombres });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "plot-threads-pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Trama marcada como resuelta", description: "Si era la última pendiente, la novela pasará a \"completada\"." });
    },
    onError: () => {
      toast({ title: "No se pudo marcar la trama como resuelta", variant: "destructive" });
    },
  });
  // [Fix266] Fichas pendientes del verificador de datos + acciones masivas
  const { data: factPendingData } = useQuery<{ count: number; corregibles: number; dudosas: number; applying: boolean }>({
    queryKey: ["/api/projects", currentProject?.id, "fact-check-pending"],
    enabled: !!currentProject,
    refetchInterval: (query) => (query.state.data as any)?.applying ? 5000 : false,
  });
  const factPendingCount = factPendingData?.count || 0;
  const factBulkMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await apiRequest("POST", `/api/projects/${currentProject!.id}/fact-check-pending/bulk`, { action });
      return res.json();
    },
    onSuccess: (data, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "fact-check-pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (action === "apply_corregibles") {
        toast({ title: "Corrección masiva iniciada", description: "Se aplican en segundo plano, capítulo a capítulo. Sigue el progreso en el registro de actividad." });
      } else {
        toast({ title: "Fichas descartadas", description: data.message || "Hecho. Si no queda nada pendiente, la novela pasará a \"completada\"." });
      }
    },
    onError: (error: any) => {
      toast({ title: "No se pudo ejecutar la acción", description: error.message || undefined, variant: "destructive" });
    },
  });
  const startNovelFactCheckMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/fact-check-novel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "fact-check-novel", "status"] });
      toast({ title: "Verificación iniciada", description: "El Verificador de Datos revisará toda la novela capítulo a capítulo. Sigue el progreso aquí o en el registro de actividad." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo iniciar la verificación", variant: "destructive" });
    },
  });

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

  // [Fix249] Pide a la IA titulos alternativos para la novela
  const suggestTitlesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${currentProject!.id}/title-suggestions`, {});
      return res.json();
    },
    onSuccess: (data: { suggestions: string[] }) => {
      setTitleSuggestions(data.suggestions || []);
    },
    onError: (err: Error) => {
      toast({ title: "No se pudieron generar sugerencias", description: err.message, variant: "destructive" });
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

  // [Fix100] Ejecutar una acción admin pendiente (merge_chapters / delete_chapter).
  // Borra el cap correspondiente y renumera los siguientes -1.
  const executeAdminActionMutation = useMutation({
    mutationFn: async (actionId: number) => {
      const res = await fetch(
        `/api/projects/${currentProject!.id}/pending-admin-actions/${actionId}/execute`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "pending-admin-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "chapters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id] });
      const desc = data?.alreadyApplied
        ? "El capítulo ya no existía; la tarjeta se ha limpiado."
        : data?.split
          ? `Cap ${data.chapterSplit} dividido en dos (nuevo cap ${data.newChapter}); ${data.renumbered} cap(s) renumerado(s) +1.`
          : `Cap ${data.chapterDeleted} eliminado y ${data.renumbered} cap(s) renumerado(s).`;
      toast({ title: "Acción ejecutada", description: desc });
    },
    onError: (err: Error) => {
      toast({ title: "No se pudo ejecutar", description: err.message, variant: "destructive" });
    },
  });

  const isExecutableAdminAction = (type: string): boolean =>
    type === "merge_chapters" || type === "delete_chapter" || type === "split_chapter";

  const handleExecuteAdminAction = (action: any) => {
    const isMerge = action.type === "merge_chapters";
    const isSplit = action.type === "split_chapter";
    const chapToDelete = isMerge ? action.secondaryChapter : action.targetChapter;
    const msg = isSplit
      ? `Esto dividirá el capítulo ${action.targetChapter} en dos por el punto de corte citado en la descripción (texto ancla) y renumerará los capítulos posteriores +1. Si el ancla no se localiza de forma única, no se hará ningún cambio. ¿Continuar?`
      : isMerge
      ? `Esto eliminará el capítulo ${chapToDelete} (su contenido ya fue absorbido por el capítulo ${action.targetChapter} en el paso de prosa) y renumerará los capítulos posteriores. ¿Continuar?`
      : `Esto eliminará el capítulo ${chapToDelete} y renumerará los capítulos posteriores. ¿Continuar?`;
    if (window.confirm(msg)) {
      executeAdminActionMutation.mutate(action.id);
    }
  };

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
              <Button
                data-testid="button-suggest-project-titles"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Sugerir títulos con IA"
                onClick={() => suggestTitlesMutation.mutate()}
                disabled={suggestTitlesMutation.isPending}
              >
                {suggestTitlesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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
          {(currentProject.status === "completed" || currentProject.status === "completed_with_issues") && (
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
              variant="outline"
              onClick={() => {
                if (novelFactCheckRunning || novelFactCheck?.status === "completed" || novelFactCheck?.status === "failed" || novelFactCheck?.status === "cancelled") {
                  setFactCheckReportOpen(true);
                } else if (currentProject) {
                  startNovelFactCheckMutation.mutate(currentProject.id);
                }
              }}
              disabled={startNovelFactCheckMutation.isPending}
              title="Verifica datos reales, continuidad y lógica de toda la novela y corrige automáticamente los errores objetivos"
              data-testid="button-fact-check-novel"
            >
              {novelFactCheckRunning || startNovelFactCheckMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <ShieldCheck className="h-4 w-4 mr-2" />}
              {novelFactCheckRunning
                ? `Verificando ${novelFactCheck?.chaptersDone ?? 0}/${novelFactCheck?.chaptersTotal ?? "?"}...`
                : novelFactCheck?.status === "completed"
                  ? "Informe de verificación"
                  : "Verificar novela"}
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

      {/* [Fix259] Informe de verificacion de datos de toda la novela */}
      <Dialog open={factCheckReportOpen} onOpenChange={setFactCheckReportOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Verificación de datos de la novela
            </DialogTitle>
            <DialogDescription>
              {novelFactCheckRunning
                ? `En marcha: ${novelFactCheck?.chaptersDone ?? 0} de ${novelFactCheck?.chaptersTotal ?? "?"} capítulos revisados${novelFactCheck?.currentChapterLabel ? ` (ahora: ${novelFactCheck.currentChapterLabel})` : ""}.`
                : novelFactCheck?.status === "completed"
                  ? `Completada: ${novelFactCheck?.chaptersDone ?? 0} capítulos revisados, ${novelFactCheck?.correctionsApplied ?? 0} corrección(es) objetiva(s) aplicada(s), ${novelFactCheck?.cleanChapters ?? 0} capítulos limpios${(novelFactCheck?.failedChapters ?? 0) > 0 ? `, ${novelFactCheck.failedChapters} capítulo(s) no verificados por error` : ""}.`
                  : novelFactCheck?.status === "cancelled"
                    ? "Cancelada por el usuario. Las correcciones ya aplicadas se conservan."
                    : novelFactCheck?.status === "failed"
                      ? `Falló: ${novelFactCheck?.error || "error desconocido"}. Puedes relanzarla; lo ya corregido se conserva.`
                      : "Sin datos de verificación."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {novelFactCheckRunning && (
              <Progress value={novelFactCheck?.chaptersTotal ? (novelFactCheck.chaptersDone / novelFactCheck.chaptersTotal) * 100 : 0} />
            )}
            {(novelFactCheck?.pending?.length ?? 0) > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Hallazgos que requieren tu decisión (dudosos o sin corrección automática). Corrígelos ficha a ficha desde el visor del capítulo con "Verificar datos":
                </p>
                {novelFactCheck.pending.map((f: any, i: number) => (
                  <div key={i} className="border rounded-md p-3 text-sm space-y-1" data-testid={`card-novel-finding-${i}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={f.veredicto === "incorrecto" ? "destructive" : "secondary"}>{f.veredicto}</Badge>
                      <Badge variant="outline">{f.categoria}</Badge>
                      <span className="text-xs text-muted-foreground">{f.chapterLabel}</span>
                    </div>
                    <p className="font-medium">"{f.afirmacion}"</p>
                    {f.explicacion && <p className="text-muted-foreground">{f.explicacion}</p>}
                    {f.sugerencia && <p className="text-muted-foreground"><span className="font-medium">Sugerencia:</span> {f.sugerencia}</p>}
                  </div>
                ))}
              </>
            ) : !novelFactCheckRunning && novelFactCheck?.status === "completed" ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                No quedan hallazgos pendientes: todos los errores objetivos detectados fueron corregidos.
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            {novelFactCheckRunning ? (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await apiRequest("POST", `/api/projects/${currentProject?.id}/fact-check-novel/cancel`);
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "fact-check-novel", "status"] });
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message || "No se pudo cancelar", variant: "destructive" });
                  }
                }}
                data-testid="button-cancel-novel-fact-check"
              >
                Cancelar verificación
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => currentProject && startNovelFactCheckMutation.mutate(currentProject.id)}
                disabled={startNovelFactCheckMutation.isPending}
                data-testid="button-restart-novel-fact-check"
              >
                {startNovelFactCheckMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Volver a verificar
              </Button>
            )}
            <Button onClick={() => setFactCheckReportOpen(false)} data-testid="button-close-novel-fact-check">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      {/* [Fix265] Tramas colgantes que la reparacion automatica no pudo cerrar:
           el usuario puede corregirlas (notas editoriales / reedicion) o
           aceptarlas y marcarlas resueltas — al vaciarse, el estado pasa a
           "completada" automaticamente. */}
      {plotThreadsPending.length > 0 && (
        <Card className="mb-4 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-plot-threads-pending">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5" />
              Tramas colgantes sin cerrar ({plotThreadsPending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              El Auditor de Cierre de Tramas detectó estos hilos narrativos sin resolución y la reparación automática no pudo cerrarlos. Mientras queden pendientes, la novela figura como <strong>"completada con issues"</strong>. Puedes corregirlos (notas editoriales o reedición) o, si consideras que el hilo está bien como está, marcarlo como resuelto.
            </p>
            <div className="space-y-1.5">
              {plotThreadsPending.map((t: any, idx: number) => (
                <div
                  key={`${t.nombre}-${idx}`}
                  className="flex items-start justify-between gap-3 p-2 rounded border border-amber-200 dark:border-amber-800 bg-background"
                  data-testid={`row-plot-thread-pending-${idx}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{t.tipo}</Badge>
                      <span className="text-sm font-medium" data-testid={`text-plot-thread-name-${idx}`}>{t.nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.estado === "abierta_colgante" ? "abandonada" : "cierre insuficiente"} · caps {t.introducida_en_cap}–{t.ultima_aparicion_cap}
                      </span>
                    </div>
                    {t.fix_sugerido && (
                      <p className="text-xs text-muted-foreground mt-1">{t.fix_sugerido}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolvePlotThreadMutation.isPending}
                    onClick={() => resolvePlotThreadMutation.mutate([t.nombre])}
                    data-testid={`button-resolve-plot-thread-${idx}`}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Marcar resuelta
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* [Fix266] Fichas pendientes del verificador de datos con acciones
           MASIVAS: aplicar todas las corregibles en segundo plano, descartar
           las dudosas o descartar todo. Al vaciarse, el estado pasa a
           "completada" automaticamente. */}
      {factPendingCount > 0 && (
        <Card className="mb-4 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-fact-check-pending">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5" />
              Fichas del verificador de datos pendientes ({factPendingCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              El Verificador de Datos dejó <strong data-testid="text-fact-pending-corregibles">{factPendingData?.corregibles || 0} corregibles</strong> (dato incorrecto con corrección propuesta) y <strong data-testid="text-fact-pending-dudosas">{factPendingData?.dudosas || 0} dudosas</strong> (posibles decisiones deliberadas de la historia). Mientras queden pendientes, la novela figura como <strong>"completada con issues"</strong>. Puedes resolverlas de golpe desde aquí en vez de capítulo a capítulo.
            </p>
            {factPendingData?.applying && (
              <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="text-fact-bulk-applying">
                Corrección masiva en curso… se aplican las fichas capítulo a capítulo en segundo plano.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(factPendingData?.corregibles || 0) > 0 && (
                <Button
                  size="sm"
                  disabled={factBulkMutation.isPending || factPendingData?.applying}
                  onClick={() => factBulkMutation.mutate("apply_corregibles")}
                  data-testid="button-fact-apply-corregibles"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Corregir las {factPendingData?.corregibles} corregibles
                </Button>
              )}
              {(factPendingData?.dudosas || 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={factBulkMutation.isPending || factPendingData?.applying}
                  onClick={() => factBulkMutation.mutate("discard_dudosas")}
                  data-testid="button-fact-discard-dudosas"
                >
                  Descartar las {factPendingData?.dudosas} dudosas
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={factBulkMutation.isPending || factPendingData?.applying}
                onClick={() => factBulkMutation.mutate("discard_todas")}
                data-testid="button-fact-discard-todas"
              >
                Descartar todas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              Operaciones destructivas que el sistema detectó pero <strong>NO aplicó automáticamente</strong>. Para <em>Fusionar</em>, <em>Eliminar</em> y <em>Dividir</em> capítulos puedes pulsar <strong>Ejecutar</strong>: el sistema borrará/partirá el capítulo correspondiente y renumerará los siguientes (en la división, el punto de corte se localiza por el texto ancla citado en la descripción). El resto de tipos (intercambiar, mover, etc.) requieren intervención manual desde la lista de capítulos. Usa el botón de papelera para descartar una acción sin aplicarla.
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
                      {action.archived === true && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-admin-action-archived-${action.id}`}>
                          Sugerencia del pulido
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-admin-action-reason-${action.id}`}>
                      {action.reason}
                    </p>
                    {action.archived === true && action.archiveReason && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5" data-testid={`text-admin-action-archive-reason-${action.id}`}>
                        {action.archiveReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isExecutableAdminAction(action.type) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleExecuteAdminAction(action)}
                        disabled={executeAdminActionMutation.isPending || dismissAdminActionMutation.isPending}
                        data-testid={`button-execute-admin-action-${action.id}`}
                      >
                        {executeAdminActionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Ejecutar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAdminActionMutation.mutate(action.id)}
                      disabled={dismissAdminActionMutation.isPending || executeAdminActionMutation.isPending}
                      data-testid={`button-dismiss-admin-action-${action.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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

      {/* [Fix249] Dialogo de sugerencias de titulo por IA para la novela */}
      <Dialog open={titleSuggestions !== null} onOpenChange={(open) => { if (!open) setTitleSuggestions(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Sugerencias de título
            </DialogTitle>
            <DialogDescription>
              Haz clic en una sugerencia para usarla como nuevo título de la novela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(titleSuggestions || []).map((s, i) => (
              <Button
                key={i}
                variant="outline"
                className="w-full justify-start text-left h-auto py-2 whitespace-normal"
                onClick={() => {
                  renameMutation.mutate(s);
                  setTitleSuggestions(null);
                }}
                disabled={renameMutation.isPending}
                data-testid={`button-title-suggestion-${i}`}
              >
                {s}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => suggestTitlesMutation.mutate()}
              disabled={suggestTitlesMutation.isPending}
              data-testid="button-regenerate-title-suggestions"
            >
              {suggestTitlesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Otras sugerencias
            </Button>
            <Button variant="outline" onClick={() => setTitleSuggestions(null)} data-testid="button-close-title-suggestions">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
