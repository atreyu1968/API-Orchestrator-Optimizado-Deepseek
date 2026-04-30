import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentCard } from "@/components/agent-card";
import { ProcessFlow } from "@/components/process-flow";
import { ConsoleOutput, type LogEntry } from "@/components/console-output";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DuplicateManager } from "@/components/duplicate-manager";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Play, FileText, Clock, CheckCircle, Download, Archive, Copy, Trash2, ClipboardCheck, RefreshCw, Ban, CheckCheck, Plus, Upload, Database, Info, Edit3, ExternalLink, Loader2, Wrench, FilePen, ChevronDown, ChevronUp, Eye, ArrowLeft, FileUp, Undo2, RotateCcw } from "lucide-react";
import { diffWords } from "diff";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useProject } from "@/lib/project-context";
import { Link } from "wouter";
import type { Project, AgentStatus, Chapter, ReeditProject, Pseudonym } from "@shared/schema";

import type { AgentRole } from "@/components/process-flow";

const agentNames: Record<AgentRole, string> = {
  architect: "El Arquitecto",
  ghostwriter: "El Narrador",
  editor: "El Editor",
  copyeditor: "El Estilista",
  "final-reviewer": "El Revisor Final",
  "continuity-sentinel": "El Centinela",
  "voice-auditor": "El Auditor de Voz",
  "semantic-detector": "El Detector Semántico",
};

function sortChaptersForDisplay(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => {
    const orderA = a.chapterNumber === 0 ? -1000 : a.chapterNumber === -1 ? 1000 : a.chapterNumber === -2 ? 1001 : a.chapterNumber;
    const orderB = b.chapterNumber === 0 ? -1000 : b.chapterNumber === -1 ? 1000 : b.chapterNumber === -2 ? 1001 : b.chapterNumber;
    return orderA - orderB;
  });
}

function calculateCost(inputTokens: number, outputTokens: number, thinkingTokens: number): number {
  const INPUT_PRICE_PER_MILLION = 0.14;
  const OUTPUT_PRICE_PER_MILLION = 0.28;
  const THINKING_PRICE_PER_MILLION = 0.28;
  
  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;
  const thinkingCost = (thinkingTokens / 1_000_000) * THINKING_PRICE_PER_MILLION;
  
  return inputCost + outputCost + thinkingCost;
}

const MODEL_PRICING_INFO = `Modelo principal: deepseek-v4-flash
• Input: $0.14/M, Output: $0.28/M, Thinking: $0.28/M

Reserva: deepseek-v4-pro
• Input: $1.74/M, Output: $3.48/M`;

type ConfirmType = "cancel" | "forceComplete" | "resume" | "delete" | null;

export default function Dashboard() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStage, setCurrentStage] = useState<AgentRole | null>(null);
  const [completedStages, setCompletedStages] = useState<AgentRole[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmType>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showArchitectDialog, setShowArchitectDialog] = useState(false);
  const [architectInstructions, setArchitectInstructions] = useState("");
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [targetChapters, setTargetChapters] = useState("");
  const { projects, currentProject, setSelectedProjectId } = useProject();

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/data-export");
      if (!response.ok) throw new Error("Export failed");
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `litagents-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exportación completada", description: "Los datos se han descargado correctamente" });
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron exportar los datos", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      const response = await fetch("/api/data-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonData),
      });
      
      if (!response.ok) throw new Error("Import failed");
      const result = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pseudonyms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/style-guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      
      toast({ 
        title: "Importación completada", 
        description: `Importados: ${Object.entries(result.results?.imported || {}).map(([k, v]) => `${v} ${k}`).join(", ")}` 
      });
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron importar los datos. Verifica el formato del archivo.", variant: "destructive" });
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const { data: agentStatuses = [] } = useQuery<AgentStatus[]>({
    queryKey: ["/api/agent-statuses"],
    refetchInterval: 2000,
  });

  const { data: reeditProjects = [] } = useQuery<ReeditProject[]>({
    queryKey: ["/api/reedit-projects"],
  });

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const getPseudonymName = (pseudonymId: number | null): string | null => {
    if (!pseudonymId) return null;
    const p = pseudonyms.find(ps => ps.id === pseudonymId);
    return p?.name || null;
  };

  const activeProject = projects.find(p => p.status === "generating");

  const { data: fullProjectDetail } = useQuery<Project>({
    queryKey: ["/api/projects", currentProject?.id],
    enabled: !!currentProject?.id,
    refetchInterval: currentProject?.status === "generating" ? 5000 : false,
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/projects", currentProject?.id, "chapters"],
    enabled: !!currentProject?.id,
    refetchInterval: currentProject?.status === "generating" ? 3000 : false,
  });

  const fetchLogs = () => {
    if (!currentProject?.id) return;
    
    fetch(`/api/projects/${currentProject.id}/activity-logs?limit=200`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((historicalLogs: Array<{ id: number; level: string; message: string; agentRole?: string; createdAt: string }>) => {
        const levelToType: Record<string, LogEntry["type"]> = {
          info: "info",
          success: "success",
          warning: "editing",
          error: "error",
        };
        const mapped: LogEntry[] = historicalLogs.map(log => ({
          id: String(log.id),
          type: levelToType[log.level] || "info",
          message: log.message,
          timestamp: new Date(log.createdAt),
          agent: log.agentRole,
        }));
        setLogs(mapped);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchLogs();
  }, [currentProject?.id]);

  useEffect(() => {
    if (currentProject?.status === "generating") {
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [currentProject?.id, currentProject?.status]);

  const saveArchitectInstructionsMutation = useMutation({
    mutationFn: async (params: { projectId: number; instructions: string }) => {
      const response = await apiRequest("PATCH", `/api/projects/${params.projectId}`, {
        architectInstructions: params.instructions,
      });
      return response.json();
    },
  });

  const startGenerationMutation = useMutation({
    mutationFn: async (params: { projectId: number; instructions?: string }) => {
      // First save instructions if provided
      if (params.instructions) {
        await saveArchitectInstructionsMutation.mutateAsync({
          projectId: params.projectId,
          instructions: params.instructions,
        });
      }
      const response = await apiRequest("POST", `/api/projects/${params.projectId}/generate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      addLog("info", "Generación iniciada");
      setShowArchitectDialog(false);
      setArchitectInstructions("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo iniciar la generación",
        variant: "destructive",
      });
      addLog("error", `Error: ${error.message}`);
    },
  });

  const archiveProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/archive`);
      return response.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjectId(null);
      toast({ title: "Proyecto archivado", description: `"${project.title}" ha sido archivado` });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo archivar el proyecto", variant: "destructive" });
    },
  });

  const unarchiveProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/unarchive`);
      return response.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Proyecto restaurado", description: `"${project.title}" ha sido restaurado` });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo restaurar el proyecto", variant: "destructive" });
    },
  });

  const duplicateProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/duplicate`);
      return response.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjectId(project.id);
      toast({ title: "Proyecto duplicado", description: `"${project?.title || 'Copia'}" ha sido creado` });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo duplicar el proyecto", variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedProjectId(null);
      toast({ title: "Proyecto eliminado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el proyecto", variant: "destructive" });
    },
  });

  const finalReviewMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/final-review`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Revisión final iniciada", description: "El Revisor Final está analizando el manuscrito" });
      addLog("thinking", "Iniciando revisión final del manuscrito...", "final-reviewer");
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo iniciar la revisión final", variant: "destructive" });
    },
  });

  const resolveIssuesMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/resolve-issues`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Resolución iniciada", description: `Corrigiendo ${data.issueCount || ""} issues documentados...` });
      addLog("thinking", "Resolviendo issues documentados del manuscrito...", "final-reviewer");
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo iniciar la resolución de issues", variant: "destructive" });
    },
  });

  const [editorialNotes, setEditorialNotes] = useState("");
  const [editorialNotesOpen, setEditorialNotesOpen] = useState(false);

  // Two-step preview/apply for editorial notes
  type EditorialInstructionPreview = {
    capitulos_afectados: number[];
    categoria: string;
    descripcion: string;
    instrucciones_correccion: string;
    elementos_a_preservar?: string;
    prioridad?: "alta" | "media" | "baja";
    // "eliminar" → el editor pide BORRAR el/los capítulo(s) por completo. Es destructivo
    // e irreversible, así que la UI exige confirmación adicional antes de aplicar.
    tipo?: "puntual" | "estructural" | "eliminar";
    plan_por_capitulo?: Record<string, string>;
  };
  const [editorialPreview, setEditorialPreview] = useState<{
    resumen_general: string | null;
    instrucciones: EditorialInstructionPreview[];
  } | null>(null);
  const [selectedInstructionIdxs, setSelectedInstructionIdxs] = useState<Set<number>>(new Set());
  // Confirmación para eliminaciones: cuando el usuario pulsa "Aplicar" y entre las
  // instrucciones seleccionadas hay alguna de tipo "eliminar", abrimos un AlertDialog
  // con el detalle de qué se va a borrar antes de disparar la mutation.
  const [pendingEditorialApply, setPendingEditorialApply] = useState<{
    selected: EditorialInstructionPreview[];
    deletions: EditorialInstructionPreview[];
  } | null>(null);
  // El parseo de notas editoriales corre en background y entrega el resultado
  // por SSE. La mutation HTTP responde casi al instante (202), así que su
  // isPending no representa el estado real de carga; este flag sí.
  const [isParsingEditorial, setIsParsingEditorial] = useState(false);
  const [isHolisticReviewing, setIsHolisticReviewing] = useState(false);
  const [isBetaReviewing, setIsBetaReviewing] = useState(false);

  // Diff dialog state for "Ver cambios" per chapter
  const [diffChapter, setDiffChapter] = useState<Chapter | null>(null);

  // Confirmation state for "Regenerar capítulo" — null when closed,
  // chapter number when the user clicked the regenerate icon and we await confirm.
  const [regenerateChapterTarget, setRegenerateChapterTarget] = useState<number | null>(null);

  const revertChapterEditMutation = useMutation({
    mutationFn: async ({ projectId, chapterId }: { projectId: number; chapterId: number }) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/chapters/${chapterId}/revert-edit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "chapters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Capítulo revertido", description: "Se restauró la versión anterior del capítulo." });
      setDiffChapter(null);
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo revertir",
        description: err?.message || "Error al restaurar el capítulo",
        variant: "destructive",
      });
    },
  });

  const regenerateChapterMutation = useMutation({
    mutationFn: async ({ projectId, chapterNumber }: { projectId: number; chapterNumber: number }) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/regenerate-chapter/${chapterNumber}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "chapters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Capítulo regenerado",
        description: data?.message || `Se ha vuelto a escribir el capítulo (${data?.wordCount || "?"} palabras).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo regenerar",
        description: err?.message || "Error al regenerar el capítulo. Mira los logs del proyecto.",
        variant: "destructive",
      });
    },
  });

  const sectionLabel = (n: number) =>
    n === 0 ? "Prólogo" : n === -1 ? "Epílogo" : n === -2 ? "Nota del autor" : `Cap. ${n}`;

  const handleNotesFileUpload = async (file: File) => {
    const okExt = /\.(txt|md|markdown)$/i.test(file.name);
    if (!okExt) {
      toast({
        title: "Formato no soportado",
        description: "Sube un archivo .txt, .md o .markdown (PDFs y docx no se procesan).",
        variant: "destructive",
      });
      return;
    }
    try {
      const text = await file.text();
      if (text.length > 200000) {
        toast({
          title: "Archivo demasiado largo",
          description: `El archivo tiene ${text.length.toLocaleString()} caracteres (máximo 200.000). Recorta el contenido.`,
          variant: "destructive",
        });
        return;
      }
      setEditorialNotes(text);
      toast({ title: "Notas cargadas", description: `${text.length.toLocaleString()} caracteres importados desde "${file.name}"` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo leer el archivo", variant: "destructive" });
    }
  };

  // Aplica el payload de vista previa que llega por SSE (o por el legacy
  // sync response, si alguna vez se reinstala). Centralizado para reuso.
  const applyEditorialParsePayload = (data: {
    resumen_general: string | null;
    instrucciones: EditorialInstructionPreview[];
  }) => {
    const instrucciones = data.instrucciones || [];
    setEditorialPreview({
      resumen_general: data.resumen_general || null,
      instrucciones,
    });
    setSelectedInstructionIdxs(new Set(instrucciones.map((_, i) => i)));
    if (instrucciones.length === 0) {
      // Sin instrucciones aplicables: damos al usuario el resumen detectado por el
      // analista + una sugerencia concreta para reescribir la nota. Los logs de
      // actividad ya tienen el diagnóstico completo (caso a vs b vs canon-conflict).
      const resumen = (data.resumen_general || "").trim();
      const description = resumen
        ? `Resumen detectado: "${resumen.slice(0, 200)}${resumen.length > 200 ? "…" : ""}"\n\nSugerencia: añade frases imperativas con número de capítulo, p. ej. "En el capítulo 5 refuerza la motivación de X" o "Elimina el capítulo 7". Revisa los logs de actividad para ver si alguna nota quedó descartada por el refiner.`
        : "El sistema no encontró ninguna acción aplicable. Revisa los logs de actividad para ver el motivo y reescribe las notas con frases imperativas explícitas y números de capítulo.";
      toast({
        title: "No se extrajeron instrucciones aplicables",
        description,
        variant: "destructive",
        duration: 12000,
      });
    } else {
      toast({
        title: "Vista previa lista",
        description: `${instrucciones.length} instrucciones extraídas. Revisa, desmarca las que no quieras y aplica.`,
      });
    }
  };

  const parseEditorialNotesMutation = useMutation({
    // El backend ahora responde 202 inmediato y entrega el resultado por SSE.
    // Esta mutation solo confirma que el trabajo se ha encolado correctamente.
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const response = await apiRequest("POST", `/api/projects/${id}/parse-editorial-notes`, { notes });
      return response.json();
    },
    onMutate: () => {
      setIsParsingEditorial(true);
    },
    onSuccess: () => {
      // No hacemos nada con el preview aquí — llega por SSE.
      // Solo informamos al usuario de que el trabajo arrancó.
      toast({
        title: "Analizando notas editoriales",
        description: "Esto puede tomar un par de minutos. La vista previa aparecerá automáticamente al terminar.",
      });
    },
    onError: (err: any) => {
      setIsParsingEditorial(false);
      toast({
        title: "Error analizando notas",
        description: err?.message || "No se pudieron analizar las notas editoriales",
        variant: "destructive",
      });
    },
  });

  const holisticReviewMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const response = await apiRequest("POST", `/api/projects/${id}/holistic-review`, {});
      return response.json();
    },
    onMutate: () => {
      setIsHolisticReviewing(true);
    },
    onSuccess: () => {
      toast({
        title: "Lector holístico trabajando",
        description: "Esto puede tomar 3-5 minutos. El informe aparecerá en el cuadro de notas al terminar.",
      });
    },
    onError: (err: any) => {
      setIsHolisticReviewing(false);
      toast({
        title: "Error iniciando revisión holística",
        description: err?.message || "No se pudo iniciar la revisión holística",
        variant: "destructive",
      });
    },
  });

  const betaReviewMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const response = await apiRequest("POST", `/api/projects/${id}/beta-review`, {});
      return response.json();
    },
    onMutate: () => {
      setIsBetaReviewing(true);
    },
    onSuccess: () => {
      toast({
        title: "Lector beta trabajando",
        description: "Esto puede tomar 3-5 minutos. Las impresiones aparecerán en el cuadro de notas al terminar.",
      });
    },
    onError: (err: any) => {
      setIsBetaReviewing(false);
      toast({
        title: "Error iniciando lectura beta",
        description: err?.message || "No se pudo iniciar la lectura beta",
        variant: "destructive",
      });
    },
  });

  const applyEditorialNotesMutation = useMutation({
    mutationFn: async (
      args:
        | { id: number; notes: string }
        | { id: number; instructions: EditorialInstructionPreview[] }
    ) => {
      const body: any = "instructions" in args ? { instructions: args.instructions } : { notes: args.notes };
      const response = await apiRequest("POST", `/api/projects/${args.id}/apply-editorial-notes`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Aplicando notas del editor", description: "Reescribiendo capítulos y recalculando puntuación al final..." });
      addLog("thinking", "Aplicando notas del editor humano al manuscrito...", "editor");
      setEditorialNotes("");
      setEditorialNotesOpen(false);
      setEditorialPreview(null);
      setSelectedInstructionIdxs(new Set());
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "No se pudieron aplicar las notas editoriales",
        variant: "destructive"
      });
    },
  });

  const cancelProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-statuses"] });
      toast({ title: "Generación cancelada", description: "El proceso ha sido detenido" });
      addLog("error", "Generación cancelada por el usuario");
      setCurrentStage(null);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo cancelar la generación", variant: "destructive" });
    },
  });

  const forceCompleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/projects/${id}/force-complete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "chapters"] });
      toast({ title: "Proyecto completado", description: "El manuscrito ha sido marcado como finalizado" });
      addLog("success", "Proyecto marcado como completado (forzado)");
      setCurrentStage(null);
      setCompletedStages(["architect", "ghostwriter", "editor", "copyeditor", "final-reviewer"]);
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo completar el proyecto", variant: "destructive" });
    },
  });

  const resumeProjectMutation = useMutation({
    mutationFn: async (id: number) => {
      console.log("[Resume] Sending resume request for project:", id);
      const response = await apiRequest("POST", `/api/projects/${id}/resume`);
      console.log("[Resume] Response status:", response.status);
      const data = await response.json();
      console.log("[Resume] Response data:", data);
      return data;
    },
    onSuccess: (data) => {
      console.log("[Resume] Success:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-statuses"] });
      toast({ title: "Generación reanudada", description: "Continuando desde donde se detuvo" });
      addLog("success", "Reanudando generación del manuscrito...");
      setCompletedStages([]);
    },
    onError: (error) => {
      console.error("[Resume] Error:", error);
      toast({ title: "Error", description: "No se pudo reanudar la generación", variant: "destructive" });
    },
  });

  const extendProjectMutation = useMutation({
    mutationFn: async ({ id, targetChapters }: { id: number; targetChapters: number }) => {
      const response = await apiRequest("POST", `/api/projects/${id}/extend`, { targetChapters });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-statuses"] });
      toast({ 
        title: "Extensión iniciada", 
        description: `Generando capítulos ${data.fromChapter} a ${data.toChapter}` 
      });
      addLog("success", `Extendiendo novela: generando capítulos ${data.fromChapter} a ${data.toChapter}...`);
      setCompletedStages([]);
      setShowExtendDialog(false);
      setTargetChapters("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo extender el proyecto", variant: "destructive" });
    },
  });

  const addLog = (type: LogEntry["type"], message: string, agent?: string) => {
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date(),
      agent,
    };
    setLogs(prev => [...prev, newLog]);
  };

  useEffect(() => {
    // El SSE se abre para CUALQUIER proyecto seleccionado, no solo los que
    // están generando. Esto es necesario porque flujos como "aplicar notas
    // del editor" se disparan sobre proyectos completados y emiten eventos
    // (editorial_parse_complete, chapter_rewrite, etc.) que el cliente debe
    // escuchar. Limitar el SSE a status="generating" hacía que el evento
    // editorial_parse_complete se emitiera hacia un canal vacío y el botón
    // de análisis se quedara colgado en "Analizando..." para siempre.
    const projectForStream = currentProject || activeProject;
    if (projectForStream) {
      const projectId = projectForStream.id;
      const eventSource = new EventSource(`/api/projects/${projectId}/stream`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "agent_status") {
            const role = data.role as AgentRole;
            if (data.status === "thinking") {
              setCurrentStage(role);
              addLog("thinking", data.message || `${agentNames[role]} está procesando...`, role);
            } else if (data.status === "writing") {
              addLog("writing", data.message || `${agentNames[role]} está escribiendo...`, role);
            } else if (data.status === "editing") {
              addLog("editing", data.message || `${agentNames[role]} está revisando...`, role);
            } else if (data.status === "completed") {
              setCompletedStages(prev => prev.includes(role) ? prev : [...prev, role]);
              addLog("success", data.message || `${agentNames[role]} completó su tarea`, role);
            }
          } else if (data.type === "chapter_rewrite") {
            addLog("editing", 
              `Reescribiendo capítulo ${data.chapterNumber}: "${data.chapterTitle}" (${data.currentIndex}/${data.totalToRewrite}) - ${data.reason}`,
              "final-reviewer"
            );
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "chapters"] });
          } else if (data.type === "chapter_status_change") {
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "chapters"] });
          } else if (data.type === "chapter_complete") {
            const sectionName = data.chapterTitle === "Prólogo" ? "Prólogo" :
                               data.chapterTitle === "Epílogo" ? "Epílogo" :
                               data.chapterTitle === "Nota del Autor" ? "Nota del Autor" :
                               `Capítulo ${data.chapterNumber}`;
            addLog("success", `${sectionName} completado (${data.wordCount} palabras)`);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "chapters"] });
          } else if (data.type === "project_complete") {
            addLog("success", "¡Manuscrito completado!");
            toast({
              title: "¡Manuscrito completado!",
              description: "Tu novela ha sido generada exitosamente",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
            setCurrentStage(null);
          } else if (data.type === "error") {
            addLog("error", data.message || "Error durante la generación");
          } else if (data.type === "editorial_parse_complete") {
            // Resultado del análisis de notas editoriales (background, vía SSE
            // porque sobrepasaba el timeout de Cloudflare cuando era síncrono).
            setIsParsingEditorial(false);
            if (data.payload) {
              applyEditorialParsePayload(data.payload);
            }
          } else if (data.type === "editorial_parse_error") {
            setIsParsingEditorial(false);
            addLog("error", data.message || "Error analizando notas editoriales", "editor");
            toast({
              title: "Error analizando notas",
              description: data.message || "No se pudieron analizar las notas editoriales",
              variant: "destructive",
            });
          } else if (data.type === "holistic_review_complete") {
            // Informe del Lector Holístico: lo inyectamos en el textarea de notas.
            // Si el usuario ya tenía algo escrito, lo añadimos al final con separador.
            setIsHolisticReviewing(false);
            const incoming: string = data.payload?.notesText || "";
            if (incoming.trim()) {
              setEditorialNotesOpen(true);
              setEditorialNotes(prev => {
                if (!prev.trim()) return incoming;
                return `${prev}\n\n--- Revisión automática ---\n\n${incoming}`;
              });
              const chapters = data.payload?.totalChaptersRead;
              const words = data.payload?.totalWordsRead;
              toast({
                title: "Informe holístico listo",
                description: `Leído: ${chapters} capítulos, ${(words || 0).toLocaleString("es-ES")} palabras. El informe está en el cuadro de notas; revísalo, edítalo y pulsa "Analizar notas" para procesarlo.`,
              });
            }
          } else if (data.type === "holistic_review_error") {
            setIsHolisticReviewing(false);
            addLog("error", data.message || "Error en revisión holística", "editor");
            toast({
              title: "Error en revisión holística",
              description: data.message || "No se pudo completar la revisión",
              variant: "destructive",
            });
          } else if (data.type === "beta_review_complete") {
            // Impresiones del Lector Beta: misma lógica de inyección que el holístico.
            setIsBetaReviewing(false);
            const incoming: string = data.payload?.notesText || "";
            if (incoming.trim()) {
              setEditorialNotesOpen(true);
              setEditorialNotes(prev => {
                if (!prev.trim()) return incoming;
                return `${prev}\n\n--- Lectura beta ---\n\n${incoming}`;
              });
              const chapters = data.payload?.totalChaptersRead;
              const words = data.payload?.totalWordsRead;
              toast({
                title: "Impresiones del lector beta listas",
                description: `Leído: ${chapters} capítulos, ${(words || 0).toLocaleString("es-ES")} palabras. El informe está en el cuadro de notas; revísalo y luego pulsa "Analizar notas" para procesarlo.`,
              });
            }
          } else if (data.type === "beta_review_error") {
            setIsBetaReviewing(false);
            addLog("error", data.message || "Error en lectura beta", "editor");
            toast({
              title: "Error en lectura beta",
              description: data.message || "No se pudo completar la lectura beta",
              variant: "destructive",
            });
          }
        } catch (e) {
          console.error("Error parsing SSE:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        // Si la conexión SSE se cae a mitad de una lectura full-novel, el resultado
        // se pierde (no hay persistencia ni recuperación). Limpiamos los flags para
        // que la UI no se quede bloqueada esperando un evento que nunca llegará.
        // El usuario tendrá que volver a lanzar la lectura si quiere las notas.
        setIsHolisticReviewing(prev => {
          if (prev) {
            toast({
              title: "Conexión perdida durante la lectura",
              description: "Se cortó la conexión con el servidor. Si la lectura llegó a terminar en el backend los tokens se gastaron, pero el informe se ha perdido. Vuelve a lanzar la lectura holística cuando quieras.",
              variant: "destructive",
            });
          }
          return false;
        });
        setIsBetaReviewing(prev => {
          if (prev) {
            toast({
              title: "Conexión perdida durante la lectura",
              description: "Se cortó la conexión con el servidor. Si la lectura llegó a terminar en el backend los tokens se gastaron, pero las impresiones se han perdido. Vuelve a lanzar la lectura beta cuando quieras.",
              variant: "destructive",
            });
          }
          return false;
        });
        setIsParsingEditorial(prev => {
          if (prev) {
            toast({
              title: "Conexión perdida durante el análisis",
              description: "Se cortó la conexión. Vuelve a pulsar 'Analizar notas' si quieres reintentar.",
              variant: "destructive",
            });
          }
          return false;
        });
      };

      return () => {
        eventSource.close();
      };
    }
  }, [currentProject?.id, activeProject?.id]);

  const getAgentStatus = (role: AgentRole) => {
    const status = agentStatuses.find(s => s.agentName.toLowerCase() === role);
    return {
      status: (status?.status as "idle" | "thinking" | "writing" | "editing" | "reviewing" | "polishing" | "completed" | "error" | "analyzing" | "warning") || "idle",
      currentTask: status?.currentTask,
      lastActivity: status?.lastActivity ? new Date(status.lastActivity) : undefined,
    };
  };

  const completedChapters = chapters.filter(c => c.status === "completed").length;
  const totalWordCount = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);

  const handleStartGeneration = () => {
    if (currentProject && currentProject.status === "idle") {
      // Load existing instructions if any
      setArchitectInstructions(currentProject.architectInstructions || "");
      setShowArchitectDialog(true);
    }
  };

  const handleConfirmGeneration = () => {
    if (currentProject) {
      startGenerationMutation.mutate({
        projectId: currentProject.id,
        instructions: architectInstructions.trim() || undefined,
      });
    }
  };

  return (
    <div className="space-y-6 p-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Panel de Control</h1>
          <p className="text-muted-foreground mt-1">
            Orquestación de agentes literarios autónomos
          </p>
        </div>
        {activeProject && (
          <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 text-sm px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
            Generando: {activeProject.title}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AgentCard 
          name={agentNames.architect}
          role="architect"
          {...getAgentStatus("architect")}
        />
        <AgentCard 
          name={agentNames.ghostwriter}
          role="ghostwriter"
          {...getAgentStatus("ghostwriter")}
        />
        <AgentCard 
          name={agentNames.editor}
          role="editor"
          {...getAgentStatus("editor")}
        />
        <AgentCard 
          name={agentNames.copyeditor}
          role="copyeditor"
          {...getAgentStatus("copyeditor")}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AgentCard 
          name={agentNames["continuity-sentinel"]}
          role="continuity-sentinel"
          {...getAgentStatus("continuity-sentinel")}
        />
        <AgentCard 
          name={agentNames["voice-auditor"]}
          role="voice-auditor"
          {...getAgentStatus("voice-auditor")}
        />
        <AgentCard 
          name={agentNames["semantic-detector"]}
          role="semantic-detector"
          {...getAgentStatus("semantic-detector")}
        />
        <AgentCard 
          name={agentNames["final-reviewer"]}
          role="final-reviewer"
          {...getAgentStatus("final-reviewer")}
        />
      </div>

      {activeProject && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Flujo de Proceso</CardTitle>
          </CardHeader>
          <CardContent>
            <ProcessFlow 
              currentStage={currentStage} 
              completedStages={completedStages} 
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Consola de Actividad</CardTitle>
            </CardHeader>
            <CardContent>
              <ConsoleOutput logs={logs} projectId={currentProject?.id} />
            </CardContent>
          </Card>

          {currentProject && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                <CardTitle className="text-lg">Progreso del Manuscrito</CardTitle>
                <div className="flex items-center gap-4">
                  {getPseudonymName(currentProject.pseudonymId) && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-pseudonym">
                      {getPseudonymName(currentProject.pseudonymId)}
                    </Badge>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{completedChapters}/{currentProject.chapterCount + (currentProject.hasPrologue ? 1 : 0) + (currentProject.hasEpilogue ? 1 : 0) + (currentProject.hasAuthorNote ? 1 : 0)} secciones</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{totalWordCount.toLocaleString()} palabras</span>
                  </div>
                  {currentProject.status === "completed" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => finalReviewMutation.mutate(currentProject.id)}
                        disabled={finalReviewMutation.isPending}
                        data-testid="button-final-review"
                      >
                        <ClipboardCheck className="h-4 w-4 mr-2" />
                        Revisión Final
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.open(`/api/projects/${currentProject.id}/export-docx`, "_blank");
                        }}
                        data-testid="button-export-docx"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Exportar Word
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sortChaptersForDisplay(chapters).map((chapter) => (
                    <div 
                      key={chapter.id}
                      className="flex items-center justify-between gap-4 p-2 rounded-md bg-muted/50"
                      data-testid={`progress-chapter-${chapter.chapterNumber}`}
                    >
                      <div className="flex items-center gap-2">
                        {chapter.status === "completed" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : chapter.status === "revision" ? (
                          <RefreshCw className="h-4 w-4 text-orange-500 animate-spin" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">
                          {chapter.title === "Prólogo" ? "Prólogo" :
                           chapter.title === "Epílogo" ? "Epílogo" :
                           chapter.title === "Nota del Autor" ? "Nota del Autor" :
                           `Capítulo ${chapter.chapterNumber}`}
                        </span>
                        {chapter.title && chapter.title !== "Prólogo" && chapter.title !== "Epílogo" && chapter.title !== "Nota del Autor" && (
                          <span className="text-sm text-muted-foreground">
                            - {chapter.title}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {chapter.wordCount && chapter.wordCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {chapter.wordCount.toLocaleString()} palabras
                          </span>
                        )}
                        {(chapter as any).preEditContent && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setDiffChapter(chapter)}
                                className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20"
                                data-testid={`button-view-diff-${chapter.chapterNumber}`}
                              >
                                <Eye className="h-3 w-3" />
                                Ver cambios
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Ver qué cambió en este capítulo tras las últimas notas editoriales
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Badge 
                          variant={chapter.status === "completed" ? "default" : chapter.status === "revision" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {chapter.status === "completed" ? "Completado" : 
                           chapter.status === "writing" ? "Escribiendo" :
                           chapter.status === "editing" ? "Editando" : 
                           chapter.status === "revision" ? "Reescribiendo" : "Pendiente"}
                        </Badge>
                        {chapter.status === "completed" && currentProject?.status !== "generating" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setRegenerateChapterTarget(chapter.chapterNumber)}
                                disabled={regenerateChapterMutation.isPending}
                                className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-50"
                                data-testid={`button-regenerate-chapter-${chapter.chapterNumber}`}
                                aria-label={`Regenerar ${chapter.title || `capítulo ${chapter.chapterNumber}`}`}
                              >
                                {regenerateChapterMutation.isPending && regenerateChapterMutation.variables?.chapterNumber === chapter.chapterNumber ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Regenerar este capítulo desde cero (usa El Narrador)
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ))}
                  {chapters.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Los capítulos aparecerán aquí conforme se generen
                    </p>
                  )}
                </div>
                
                {currentProject.status === "completed" && currentProject.finalScore && (
                  <div className="mt-4 p-4 rounded-md border border-border" 
                    style={{ 
                      backgroundColor: currentProject.finalScore >= 9 
                        ? 'hsl(var(--chart-2) / 0.1)' 
                        : currentProject.finalScore >= 7 
                          ? 'hsl(var(--chart-4) / 0.1)' 
                          : 'hsl(var(--destructive) / 0.1)'
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Puntuación Final del Revisor</p>
                        <p className="text-xs text-muted-foreground">
                          {currentProject.finalScore >= 9 
                            ? "Publicable - Calidad profesional" 
                            : currentProject.finalScore >= 7 
                              ? "Aceptable con reservas"
                              : "No publicable - Requiere revisión"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${
                          currentProject.finalScore >= 9 
                            ? 'text-green-600 dark:text-green-400' 
                            : currentProject.finalScore >= 7 
                              ? 'text-yellow-600 dark:text-yellow-400' 
                              : 'text-red-600 dark:text-red-400'
                        }`} data-testid="text-final-score">
                          {currentProject.finalScore}/10
                        </p>
                      </div>
                    </div>
                    
                    {/* Show Final Review Issues if available */}
                    {fullProjectDetail?.finalReviewResult && (fullProjectDetail.finalReviewResult as any).issues?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-sm font-medium mb-2">Issues Documentados ({(fullProjectDetail.finalReviewResult as any).issues.length})</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {((fullProjectDetail.finalReviewResult as any).issues as Array<{capitulos_afectados?: number[]; categoria?: string; descripcion?: string; severidad?: string; instrucciones_correccion?: string}>).map((issue, idx) => {
                            const chapters = issue.capitulos_afectados || [];
                            const chapterLabel = chapters.length > 0
                              ? chapters.map(ch => ch === 0 ? "Prólogo" : ch === -1 ? "Epílogo" : ch === -2 ? "Nota" : `Cap. ${ch}`).join(", ")
                              : "General";
                            const severity = issue.severidad || issue.categoria || "otro";
                            return (
                              <div 
                                key={idx} 
                                className="text-xs p-2 rounded bg-background/50 border border-border/30"
                                data-testid={`issue-${idx}`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge 
                                    variant={severity === "critica" ? "destructive" : severity === "mayor" ? "secondary" : "outline"}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {severity}
                                  </Badge>
                                  <span className="text-muted-foreground">{chapterLabel}</span>
                                </div>
                                <p className="text-foreground">{issue.descripcion}</p>
                                {issue.instrucciones_correccion && (
                                  <p className="text-muted-foreground mt-1 italic">{issue.instrucciones_correccion}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {(fullProjectDetail?.finalReviewResult as any)?.issues?.length > 0 && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => resolveIssuesMutation.mutate(currentProject.id)}
                            disabled={resolveIssuesMutation.isPending}
                            data-testid="button-resolve-issues"
                            className="mt-3 w-full bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            <Wrench className="h-4 w-4 mr-2" />
                            {resolveIssuesMutation.isPending ? "Resolviendo..." : `Resolver ${(fullProjectDetail.finalReviewResult as any).issues.length} Issues`}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Notas del Editor Humano — corrección quirúrgica a partir de texto libre */}
                    {currentProject.status === "completed" && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => setEditorialNotesOpen(v => !v)}
                          className="w-full flex items-center justify-between gap-2 text-sm font-medium hover-elevate p-2 rounded-md"
                          data-testid="button-toggle-editorial-notes"
                        >
                          <span className="flex items-center gap-2">
                            <FilePen className="h-4 w-4 text-primary" />
                            Notas del Editor Humano
                          </span>
                          {editorialNotesOpen
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>

                        {editorialNotesOpen && !editorialPreview && (
                          <div className="mt-3 space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Pega o sube las notas de tu editor. <strong>Paso 1:</strong> el sistema las analiza y te muestra
                              una vista previa de las instrucciones extraídas, agrupadas por capítulo. <strong>Paso 2:</strong> tú
                              revisas, desmarcas las que no quieras y aplicas. Cada capítulo se reescribe quirúrgicamente,
                              y al final se recalcula la puntuación global para ver el impacto neto.
                            </p>

                            {/* Generadores automáticos de notas: Lector Holístico (editor severo) + Lector Beta (lector cualificado) */}
                            <div className="rounded-md border border-muted-foreground/20 bg-muted/30 p-3 space-y-3">
                              <p className="text-xs leading-relaxed">
                                <strong>¿No tienes notas todavía?</strong> Dos lectores automáticos pueden leerse la novela completa de una sentada
                                y volcar sus impresiones en este cuadro. Son perspectivas <strong>complementarias</strong>: lanzas uno, esperas a que termine,
                                y si quieres lanzas el otro (no se pueden ejecutar a la vez para no mezclar tokens; el segundo informe se apila debajo del primero
                                con un separador). Cada uno tarda 3-5 minutos. Después editas, depuras y pulsas "Analizar notas".
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => holisticReviewMutation.mutate({ id: currentProject.id })}
                                  disabled={
                                    isHolisticReviewing ||
                                    isBetaReviewing ||
                                    isParsingEditorial ||
                                    applyEditorialNotesMutation.isPending ||
                                    currentProject.status !== "completed"
                                  }
                                  data-testid="button-holistic-review"
                                  className="border-purple-400 dark:border-purple-600 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                                >
                                  <FilePen className="h-4 w-4 mr-2 shrink-0" />
                                  <span className="truncate">
                                    {isHolisticReviewing ? "Leyendo (3-5 min)..." : "Lector Holístico (editor severo)"}
                                  </span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => betaReviewMutation.mutate({ id: currentProject.id })}
                                  disabled={
                                    isHolisticReviewing ||
                                    isBetaReviewing ||
                                    isParsingEditorial ||
                                    applyEditorialNotesMutation.isPending ||
                                    currentProject.status !== "completed"
                                  }
                                  data-testid="button-beta-review"
                                  className="border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                >
                                  <FilePen className="h-4 w-4 mr-2 shrink-0" />
                                  <span className="truncate">
                                    {isBetaReviewing ? "Leyendo (3-5 min)..." : "Lector Beta (lector cualificado)"}
                                  </span>
                                </Button>
                              </div>
                              <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                                <strong className="text-purple-700 dark:text-purple-300">Holístico</strong>: diagnostica problemas estructurales, arcos, continuidad y ritmo. Voz de editor profesional, formato clínico.
                                {" "}<strong className="text-emerald-700 dark:text-emerald-300">Beta</strong>: cuenta cómo le sentó la novela como lector. Reacciones emocionales, qué enganchó, qué aburrió, expectativas. Voz en primera persona.
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="editorial-notes-textarea" className="text-xs">
                                Notas editoriales (máx. 200.000 caracteres)
                              </Label>
                              <label className="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1" data-testid="label-upload-editorial-notes">
                                <FileUp className="h-3 w-3" />
                                Subir archivo (.txt/.md)
                                <input
                                  type="file"
                                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleNotesFileUpload(f);
                                    e.target.value = "";
                                  }}
                                  data-testid="input-upload-editorial-notes"
                                />
                              </label>
                            </div>
                            <Textarea
                              id="editorial-notes-textarea"
                              value={editorialNotes}
                              onChange={(e) => setEditorialNotes(e.target.value)}
                              placeholder="Ej: '1. Veredicto Editorial Riguroso. El manuscrito presenta una premisa de alto impacto... ⚠️ Debilidades críticas: La aparición de Vasco Carballo en la cripta de Guadalupe resulta demasiado providencial...'"
                              className="min-h-[200px] text-xs font-mono resize-y"
                              maxLength={200000}
                              data-testid="textarea-editorial-notes"
                            />
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>{editorialNotes.length.toLocaleString()} / 200.000 caracteres</span>
                              {editorialNotes.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setEditorialNotes("")}
                                  className="hover:text-foreground"
                                  data-testid="button-clear-editorial-notes"
                                >
                                  Limpiar
                                </button>
                              )}
                            </div>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => parseEditorialNotesMutation.mutate({
                                id: currentProject.id,
                                notes: editorialNotes.trim()
                              })}
                              disabled={
                                !editorialNotes.trim() ||
                                parseEditorialNotesMutation.isPending ||
                                isParsingEditorial ||
                                applyEditorialNotesMutation.isPending ||
                                currentProject.status !== "completed"
                              }
                              data-testid="button-parse-editorial-notes"
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {isParsingEditorial
                                ? "Analizando notas (puede tardar 1-3 min)..."
                                : "Analizar notas y mostrar vista previa"}
                            </Button>
                            <p className="text-[10px] text-muted-foreground italic">
                              ⓘ Antes de tocar el manuscrito verás cada instrucción extraída. Si algo no te cuadra, lo desmarcas.
                              Los arcos multi-capítulo muestran su plan distributivo. Al terminar, se recalcula la puntuación global.
                            </p>
                          </div>
                        )}

                        {/* PASO 2: Vista previa de instrucciones extraídas */}
                        {editorialNotesOpen && editorialPreview && (
                          <div className="mt-3 space-y-3" data-testid="container-editorial-preview">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                Vista previa: {editorialPreview.instrucciones.length} instrucciones extraídas
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditorialPreview(null);
                                  setSelectedInstructionIdxs(new Set());
                                }}
                                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                data-testid="button-back-to-editorial-notes"
                              >
                                <ArrowLeft className="h-3 w-3" /> Volver a editar las notas
                              </button>
                            </div>

                            {editorialPreview.resumen_general && (
                              <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                                {editorialPreview.resumen_general}
                              </p>
                            )}

                            {editorialPreview.instrucciones.length > 0 && (
                              <div className="flex items-center gap-3 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => setSelectedInstructionIdxs(new Set(editorialPreview.instrucciones.map((_, i) => i)))}
                                  className="text-primary hover:underline"
                                  data-testid="button-select-all-instructions"
                                >
                                  Marcar todas
                                </button>
                                <span className="text-muted-foreground">·</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedInstructionIdxs(new Set())}
                                  className="text-primary hover:underline"
                                  data-testid="button-deselect-all-instructions"
                                >
                                  Desmarcar todas
                                </button>
                                <span className="ml-auto text-muted-foreground">
                                  {selectedInstructionIdxs.size} / {editorialPreview.instrucciones.length} seleccionadas
                                </span>
                              </div>
                            )}

                            <div className="max-h-[400px] overflow-y-auto space-y-2 border rounded-md p-2 bg-muted/30">
                              {editorialPreview.instrucciones.map((ins, idx) => {
                                const isArc = (ins.capitulos_afectados || []).length > 1;
                                const checked = selectedInstructionIdxs.has(idx);
                                const priorityColor =
                                  ins.prioridad === "alta" ? "bg-red-500/20 text-red-700 dark:text-red-300"
                                  : ins.prioridad === "media" ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300"
                                  : "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300";
                                const isDeletion = ins.tipo === "eliminar";
                                // Estilo destacado para eliminaciones: borde rojo, fondo rojizo,
                                // visualmente claro que NO es una reescritura sino un borrado.
                                const containerClass = isDeletion
                                  ? `p-2 rounded-md border-2 border-red-500/60 text-[11px] space-y-1 ${checked ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/50 opacity-60"}`
                                  : `p-2 rounded-md border text-[11px] space-y-1 ${checked ? "bg-background" : "bg-muted/50 opacity-60"}`;
                                return (
                                  <div
                                    key={idx}
                                    className={containerClass}
                                    data-testid={`instruction-preview-${idx}`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <Checkbox
                                        id={`ins-${idx}`}
                                        checked={checked}
                                        onCheckedChange={(v) => {
                                          setSelectedInstructionIdxs(prev => {
                                            const next = new Set(prev);
                                            if (v) next.add(idx); else next.delete(idx);
                                            return next;
                                          });
                                        }}
                                        className="mt-0.5"
                                        data-testid={`checkbox-instruction-${idx}`}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1">
                                          {isDeletion && (
                                            <Badge variant="destructive" className="text-[10px] uppercase font-semibold">
                                              <Trash2 className="h-3 w-3 mr-0.5" />
                                              Eliminar
                                            </Badge>
                                          )}
                                          <Badge variant="outline" className="text-[10px] uppercase">{ins.categoria || "otro"}</Badge>
                                          {ins.prioridad && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityColor}`}>{ins.prioridad}</span>
                                          )}
                                          {isArc && !isDeletion && (
                                            <Badge variant="default" className="text-[10px] bg-purple-600 hover:bg-purple-700">
                                              ARCO {ins.capitulos_afectados.length} caps
                                            </Badge>
                                          )}
                                          {isDeletion && ins.capitulos_afectados.length > 1 && (
                                            <Badge variant="destructive" className="text-[10px]">
                                              {ins.capitulos_afectados.length} capítulos
                                            </Badge>
                                          )}
                                          <span className="text-muted-foreground">
                                            {(ins.capitulos_afectados || []).map(sectionLabel).join(", ")}
                                          </span>
                                        </div>
                                        <p className={`font-medium mt-1 ${isDeletion ? "text-red-700 dark:text-red-300" : ""}`}>
                                          {ins.descripcion}
                                        </p>
                                        <p className="text-muted-foreground italic mt-1">
                                          {isDeletion ? "🗑️" : "✏️"} {ins.instrucciones_correccion}
                                        </p>
                                        {ins.elementos_a_preservar && !isDeletion && (
                                          <p className="text-amber-700 dark:text-amber-400 mt-1">⚠️ Preservar: {ins.elementos_a_preservar}</p>
                                        )}
                                        {isArc && !isDeletion && ins.plan_por_capitulo && Object.keys(ins.plan_por_capitulo).length > 0 && (
                                          <details className="mt-1">
                                            <summary className="cursor-pointer text-purple-700 dark:text-purple-300 text-[10px]">
                                              Ver plan distributivo del arco
                                            </summary>
                                            <ul className="mt-1 ml-3 space-y-0.5 text-[10px]">
                                              {Object.entries(ins.plan_por_capitulo).map(([k, v]) => (
                                                <li key={k}><span className="font-semibold">{sectionLabel(parseInt(k))}:</span> {v}</li>
                                              ))}
                                            </ul>
                                          </details>
                                        )}
                                        {isDeletion && (
                                          <p className="text-[10px] text-red-700/80 dark:text-red-400/90 mt-1 font-medium">
                                            ⚠️ Acción irreversible: el capítulo se borra y los posteriores se renumeran.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {(() => {
                              // Cuento eliminaciones seleccionadas para mostrarlas en el botón
                              // y para decidir si abrimos el AlertDialog antes de aplicar.
                              const selectedItems = Array.from(selectedInstructionIdxs)
                                .sort((a, b) => a - b)
                                .map(i => editorialPreview.instrucciones[i]);
                              const deletionsSelected = selectedItems.filter(s => s.tipo === "eliminar");
                              const hasDeletions = deletionsSelected.length > 0;
                              const totalChaptersToDelete = new Set(
                                deletionsSelected.flatMap(d => d.capitulos_afectados || []).filter(n => n > 0)
                              ).size;
                              return (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => {
                                    if (hasDeletions) {
                                      // Confirmación obligatoria: la mutation se dispara desde el AlertDialog.
                                      setPendingEditorialApply({ selected: selectedItems, deletions: deletionsSelected });
                                    } else {
                                      applyEditorialNotesMutation.mutate({
                                        id: currentProject.id,
                                        instructions: selectedItems,
                                      });
                                    }
                                  }}
                                  disabled={
                                    selectedInstructionIdxs.size === 0 ||
                                    applyEditorialNotesMutation.isPending ||
                                    currentProject.status !== "completed"
                                  }
                                  data-testid="button-apply-selected-instructions"
                                  className={`w-full text-white ${hasDeletions ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
                                >
                                  {hasDeletions ? <Trash2 className="h-4 w-4 mr-2" /> : <FilePen className="h-4 w-4 mr-2" />}
                                  {applyEditorialNotesMutation.isPending
                                    ? "Procesando..."
                                    : hasDeletions
                                      ? `Aplicar ${selectedInstructionIdxs.size} (incluye borrar ${totalChaptersToDelete} cap.)`
                                      : `Aplicar ${selectedInstructionIdxs.size} instrucciones seleccionadas`}
                                </Button>
                              );
                            })()}
                            <p className="text-[10px] text-muted-foreground italic">
                              ⓘ Tras aplicar: cada capítulo se reescribe quirúrgicamente, se guarda un snapshot del original
                              (botón "Ver cambios" en la lista de capítulos) y al final se recalcula la puntuación global.
                              Puedes cancelar en cualquier momento durante el proceso.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Show Score Justification if available */}
                    {fullProjectDetail?.finalReviewResult && (fullProjectDetail.finalReviewResult as any).justificacion_puntuacion && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-sm font-medium mb-2">Desglose de Puntuación</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries((fullProjectDetail.finalReviewResult as any).justificacion_puntuacion.puntuacion_desglosada || {}).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                              <span className="font-medium">{value as number}/10</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentProject.status === "completed" && (currentProject.totalInputTokens || currentProject.totalOutputTokens) && (
                  <div className="mt-4 p-4 rounded-md bg-muted/30 border border-border">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Coste de Generación</p>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Tokens entrada: {(currentProject.totalInputTokens || 0).toLocaleString()}</span>
                          <span>Tokens salida: {(currentProject.totalOutputTokens || 0).toLocaleString()}</span>
                          <span>Tokens razonamiento: {(currentProject.totalThinkingTokens || 0).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary" data-testid="text-total-cost">
                          ${calculateCost(
                            currentProject.totalInputTokens || 0,
                            currentProject.totalOutputTokens || 0,
                            currentProject.totalThinkingTokens || 0
                          ).toFixed(2)}
                        </p>
                        <div className="flex items-center justify-end gap-1">
                          <p className="text-xs text-muted-foreground">USD estimado</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs whitespace-pre-line text-xs">
                              {MODEL_PRICING_INFO}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {projects.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center space-y-4">
                <p className="text-muted-foreground">No hay proyectos creados</p>
                <Link href="/config">
                  <Button data-testid="button-new-project">
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Proyecto
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {currentProject && currentProject.status === "idle" && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleStartGeneration}
                  disabled={startGenerationMutation.isPending}
                  data-testid="button-continue-generation"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Generación
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Proyecto: {currentProject.title}
                </p>
              </CardContent>
            </Card>
          )}

          {currentProject && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Acciones del Proyecto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateProjectMutation.mutate(currentProject.id)}
                    disabled={duplicateProjectMutation.isPending}
                    data-testid="button-duplicate-project"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </Button>
                  
                  {currentProject.status === "generating" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog("cancel")}
                        disabled={cancelProjectMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        data-testid="button-cancel-generation"
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        Cancelar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog("forceComplete")}
                        disabled={forceCompleteMutation.isPending}
                        data-testid="button-force-complete"
                      >
                        <CheckCheck className="h-4 w-4 mr-2" />
                        Forzar Completado
                      </Button>
                    </>
                  )}

                  {["paused", "cancelled", "error", "failed_final_review"].includes(currentProject.status) && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setConfirmDialog("resume")}
                      disabled={resumeProjectMutation.isPending}
                      data-testid="button-resume-generation"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Continuar
                    </Button>
                  )}

                  {["completed", "paused", "cancelled", "error"].includes(currentProject.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowExtendDialog(true)}
                      disabled={extendProjectMutation.isPending}
                      data-testid="button-extend-project"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Extender
                    </Button>
                  )}

                  {currentProject.status === "archived" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unarchiveProjectMutation.mutate(currentProject.id)}
                      disabled={unarchiveProjectMutation.isPending}
                      data-testid="button-unarchive-project"
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Restaurar
                    </Button>
                  ) : currentProject.status !== "generating" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => archiveProjectMutation.mutate(currentProject.id)}
                      disabled={archiveProjectMutation.isPending}
                      data-testid="button-archive-project"
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archivar
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDialog("delete")}
                    disabled={deleteProjectMutation.isPending || currentProject.status === "generating"}
                    className="text-destructive hover:text-destructive"
                    data-testid="button-delete-project"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {currentProject.title} - {currentProject.status === "completed" ? "Completado" : 
                   currentProject.status === "archived" ? "Archivado" :
                   currentProject.status === "generating" ? "Generando" : "Pendiente"}
                </p>
              </CardContent>
            </Card>
          )}

          {reeditProjects.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Edit3 className="h-5 w-5" />
                  Manuscritos Importados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {reeditProjects.slice(0, 5).map((project) => (
                  <Link key={project.id} href={`/reedit?project=${project.id}`}>
                    <div 
                      className="flex items-center justify-between p-2 rounded-md hover-elevate cursor-pointer border border-border/50"
                      data-testid={`reedit-project-${project.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{project.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{project.totalChapters} capítulos</span>
                          <Badge 
                            variant={project.status === "completed" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {project.status === "completed" ? "Completado" : 
                             project.status === "processing" ? "Procesando" : 
                             project.status === "editing" ? "Editando" : "Pendiente"}
                          </Badge>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
                {reeditProjects.length > 5 && (
                  <Link href="/reedit">
                    <Button variant="ghost" size="sm" className="w-full">
                      Ver todos ({reeditProjects.length})
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Gestión de Datos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Exporta o importa todos los datos de la aplicación (proyectos, capítulos, configuraciones).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportData}
                  disabled={isExporting}
                  data-testid="button-export-data"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isExporting ? "Exportando..." : "Exportar Datos"}
                </Button>
                
                <label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isImporting}
                    asChild
                    data-testid="button-import-data"
                  >
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      {isImporting ? "Importando..." : "Importar Datos"}
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportData}
                    className="hidden"
                    data-testid="input-import-file"
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <DuplicateManager />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog === "cancel"}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        title="Cancelar generación"
        description="¿Cancelar la generación? El progreso actual se mantendrá."
        confirmText="Cancelar generación"
        variant="destructive"
        onConfirm={() => {
          if (currentProject) cancelProjectMutation.mutate(currentProject.id);
          setConfirmDialog(null);
        }}
      />

      <ConfirmDialog
        open={confirmDialog === "forceComplete"}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        title="Forzar completado"
        description="¿Marcar como completado? Los capítulos con contenido se guardarán."
        confirmText="Completar"
        onConfirm={() => {
          if (currentProject) forceCompleteMutation.mutate(currentProject.id);
          setConfirmDialog(null);
        }}
      />

      <ConfirmDialog
        open={confirmDialog === "resume"}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        title="Continuar generación"
        description="¿Continuar la generación desde donde se detuvo?"
        confirmText="Continuar"
        onConfirm={() => {
          if (currentProject) resumeProjectMutation.mutate(currentProject.id);
          setConfirmDialog(null);
        }}
      />

      <ConfirmDialog
        open={confirmDialog === "delete"}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        title="Eliminar proyecto"
        description={`¿Estás seguro de eliminar "${currentProject?.title}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        variant="destructive"
        onConfirm={() => {
          if (currentProject) deleteProjectMutation.mutate(currentProject.id);
          setConfirmDialog(null);
        }}
      />

      <ConfirmDialog
        open={regenerateChapterTarget !== null}
        onOpenChange={(open) => !open && setRegenerateChapterTarget(null)}
        title={`Regenerar ${regenerateChapterTarget !== null ? sectionLabel(regenerateChapterTarget) : ""}`}
        description={`Se reescribirá el capítulo desde cero usando El Narrador (no pasa por Editor ni Estilista). El contenido actual se sustituirá. Tarda 1-5 min. ¿Continuar?`}
        confirmText="Regenerar"
        variant="destructive"
        onConfirm={() => {
          if (currentProject && regenerateChapterTarget !== null) {
            regenerateChapterMutation.mutate({
              projectId: currentProject.id,
              chapterNumber: regenerateChapterTarget,
            });
          }
          setRegenerateChapterTarget(null);
        }}
      />

      {/* Architect Instructions Dialog */}
      <Dialog open={showArchitectDialog} onOpenChange={setShowArchitectDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Instrucciones para el Arquitecto</DialogTitle>
            <DialogDescription>
              Proporciona instrucciones específicas que guiarán la planificación de la trama y estructura de tu novela. Estas instrucciones serán utilizadas por el Arquitecto antes de generar los capítulos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="architect-instructions">Instrucciones (opcional)</Label>
              <Textarea
                id="architect-instructions"
                placeholder="Escribe las instrucciones para el Arquitecto. Ejemplos:&#10;&#10;- Quiero que cada capítulo termine con un gancho fuerte&#10;- El villano debe aparecer sutilmente en los primeros capítulos&#10;- Incluir escenas de tensión romántica entre X e Y&#10;- El giro principal debe ocurrir en el capítulo 8&#10;- Mantener un ritmo acelerado en la segunda mitad"
                value={architectInstructions}
                onChange={(e) => setArchitectInstructions(e.target.value)}
                className="min-h-[200px]"
                data-testid="input-architect-instructions"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p><strong>Nota:</strong> Estas instrucciones son opcionales. Puedes iniciar la generación sin ellas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchitectDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmGeneration}
              disabled={startGenerationMutation.isPending}
              data-testid="button-confirm-generation"
            >
              {startGenerationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Generación
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmación para ELIMINAR capítulos vía notas editoriales.
          Se abre desde el botón "Aplicar" cuando entre las instrucciones seleccionadas
          hay alguna con tipo "eliminar". Borrar capítulos es destructivo e irreversible
          (renumera los siguientes), así que pedimos confirmación explícita. */}
      <AlertDialog
        open={pendingEditorialApply !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEditorialApply(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-deletion">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <Trash2 className="h-5 w-5" />
              Confirmar eliminación de capítulos
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Vas a aplicar <strong>{pendingEditorialApply?.selected.length ?? 0}</strong> instrucciones,
                  de las cuales <strong className="text-red-700 dark:text-red-300">
                    {pendingEditorialApply?.deletions.length ?? 0} son eliminaciones definitivas
                  </strong> de capítulos.
                </p>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded p-3 space-y-2 max-h-48 overflow-y-auto">
                  {(pendingEditorialApply?.deletions ?? []).map((d, i) => (
                    <div key={i} className="text-xs" data-testid={`confirm-deletion-${i}`}>
                      <div className="font-semibold text-red-700 dark:text-red-300">
                        Caps. {(d.capitulos_afectados || []).join(", ")}
                      </div>
                      <div className="text-muted-foreground">{d.descripcion}</div>
                    </div>
                  ))}
                </div>
                <ul className="text-xs space-y-1 list-disc pl-5 text-amber-700 dark:text-amber-400">
                  <li>El contenido de los capítulos eliminados se pierde de forma permanente.</li>
                  <li>Los capítulos posteriores se renumeran automáticamente.</li>
                  <li>Si tienes audiolibros generados, sus números pueden quedar desincronizados.</li>
                  <li>Esta acción <strong>no se puede deshacer</strong> desde la interfaz.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deletion">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-deletion"
              onClick={() => {
                if (!pendingEditorialApply) return;
                const selected = pendingEditorialApply.selected;
                setPendingEditorialApply(null);
                applyEditorialNotesMutation.mutate({
                  id: currentProject!.id,
                  instructions: selected,
                });
              }}
            >
              Sí, eliminar y aplicar el resto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extend Project Dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extender Proyecto</DialogTitle>
            <DialogDescription>
              Añade más capítulos a tu proyecto. El sistema generará la escaleta y contenido de los capítulos adicionales manteniendo la continuidad con los existentes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="target-chapters">Número total de capítulos</Label>
              <input
                id="target-chapters"
                type="number"
                min={(chapters?.filter(c => c.chapterNumber > 0).length || 0) + 1}
                value={targetChapters}
                onChange={(e) => setTargetChapters(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={`Actualmente: ${chapters?.filter(c => c.chapterNumber > 0).length || 0} capítulos`}
                data-testid="input-target-chapters"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Capítulos actuales: <strong>{chapters?.filter(c => c.chapterNumber > 0).length || 0}</strong></p>
              <p>Nuevos capítulos a generar: <strong>{targetChapters ? Math.max(0, parseInt(targetChapters) - (chapters?.filter(c => c.chapterNumber > 0).length || 0)) : 0}</strong></p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (currentProject && targetChapters) {
                  extendProjectMutation.mutate({ 
                    id: currentProject.id, 
                    targetChapters: parseInt(targetChapters) 
                  });
                }
              }}
              disabled={extendProjectMutation.isPending || !targetChapters || parseInt(targetChapters) <= (chapters?.filter(c => c.chapterNumber > 0).length || 0)}
              data-testid="button-confirm-extend"
            >
              {extendProjectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extendiendo...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Extender Proyecto
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff dialog: muestra qué cambió entre el preEditContent (snapshot anterior) y el content actual */}
      <Dialog open={!!diffChapter} onOpenChange={(open) => { if (!open) setDiffChapter(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-chapter-diff">
          <DialogHeader>
            <DialogTitle>
              Cambios en {diffChapter ? sectionLabel(diffChapter.chapterNumber) : ""}
              {diffChapter?.title && ` — ${diffChapter.title}`}
            </DialogTitle>
            <DialogDescription>
              Comparación entre la versión anterior (antes de las últimas notas editoriales) y la versión actual.
              <span className="text-red-600 dark:text-red-400 ml-1 font-medium">Rojo tachado</span> = eliminado,{" "}
              <span className="text-green-600 dark:text-green-400 font-medium">verde</span> = añadido.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-muted/20 text-sm leading-relaxed whitespace-pre-wrap font-serif">
            {diffChapter && (() => {
              const before = (diffChapter as any).preEditContent || "";
              const after = diffChapter.content || "";
              const parts = diffWords(before, after);
              return parts.map((p: any, i: number) => {
                if (p.added) {
                  return <span key={i} className="bg-green-500/20 text-green-900 dark:text-green-200 px-0.5 rounded">{p.value}</span>;
                }
                if (p.removed) {
                  return <span key={i} className="bg-red-500/20 text-red-900 dark:text-red-200 line-through px-0.5 rounded">{p.value}</span>;
                }
                return <span key={i}>{p.value}</span>;
              });
            })()}
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-2">
            {diffChapter && (diffChapter as any).preEditAt ? (
              <span className="text-[11px] text-muted-foreground">
                Snapshot guardado el {new Date((diffChapter as any).preEditAt).toLocaleString()}
              </span>
            ) : <span />}
            <div className="flex items-center gap-2">
              {diffChapter && (diffChapter as any).preEditContent && currentProject && (
                <Button
                  variant="destructive"
                  data-testid="button-revert-chapter-edit"
                  disabled={revertChapterEditMutation.isPending}
                  onClick={() => {
                    if (!diffChapter || !currentProject) return;
                    if (window.confirm("¿Revertir este capítulo a la versión anterior? Se descartarán los cambios actuales y el snapshot se eliminará.")) {
                      revertChapterEditMutation.mutate({ projectId: currentProject.id, chapterId: diffChapter.id });
                    }
                  }}
                >
                  {revertChapterEditMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Undo2 className="h-4 w-4 mr-2" />
                  )}
                  Revertir cambios
                </Button>
              )}
              <Button variant="outline" onClick={() => setDiffChapter(null)} data-testid="button-close-diff">
                Cerrar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
