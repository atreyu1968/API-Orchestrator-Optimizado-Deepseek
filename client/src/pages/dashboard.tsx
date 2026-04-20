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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Play, FileText, Clock, CheckCircle, Download, Archive, Copy, Trash2, ClipboardCheck, RefreshCw, Ban, CheckCheck, Plus, Upload, Database, Info, Edit3, ExternalLink, Loader2, Wrench, FilePen, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  const INPUT_PRICE_PER_MILLION = 0.15;
  const OUTPUT_PRICE_PER_MILLION = 0.60;
  const THINKING_PRICE_PER_MILLION = 3.50;
  
  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;
  const thinkingCost = (thinkingTokens / 1_000_000) * THINKING_PRICE_PER_MILLION;
  
  return inputCost + outputCost + thinkingCost;
}

const MODEL_PRICING_INFO = `Modelo principal: gemini-2.5-flash
• Input: $0.15/M, Output: $0.60/M, Thinking: $3.50/M

Modelo secundario: gemini-2.0-flash (analizador)
• Input: $0.10/M, Output: $0.40/M`;

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

  const applyEditorialNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const response = await apiRequest("POST", `/api/projects/${id}/apply-editorial-notes`, { notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Aplicando notas del editor", description: "Analizando notas y aplicando correcciones quirúrgicas..." });
      addLog("thinking", "Aplicando notas del editor humano al manuscrito...", "editor");
      setEditorialNotes("");
      setEditorialNotesOpen(false);
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
    if (activeProject) {
      const eventSource = new EventSource(`/api/projects/${activeProject.id}/stream`);
      
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
            queryClient.invalidateQueries({ queryKey: ["/api/projects", activeProject.id, "chapters"] });
          } else if (data.type === "chapter_status_change") {
            queryClient.invalidateQueries({ queryKey: ["/api/projects", activeProject.id, "chapters"] });
          } else if (data.type === "chapter_complete") {
            const sectionName = data.chapterTitle === "Prólogo" ? "Prólogo" :
                               data.chapterTitle === "Epílogo" ? "Epílogo" :
                               data.chapterTitle === "Nota del Autor" ? "Nota del Autor" :
                               `Capítulo ${data.chapterNumber}`;
            addLog("success", `${sectionName} completado (${data.wordCount} palabras)`);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", activeProject.id, "chapters"] });
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
          }
        } catch (e) {
          console.error("Error parsing SSE:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [activeProject?.id]);

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
                        <Badge 
                          variant={chapter.status === "completed" ? "default" : chapter.status === "revision" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {chapter.status === "completed" ? "Completado" : 
                           chapter.status === "writing" ? "Escribiendo" :
                           chapter.status === "editing" ? "Editando" : 
                           chapter.status === "revision" ? "Reescribiendo" : "Pendiente"}
                        </Badge>
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

                        {editorialNotesOpen && (
                          <div className="mt-3 space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Pega aquí las notas que te ha dado tu editor (texto libre, veredicto editorial, instrucciones quirúrgicas, etc.).
                              El sistema las analizará, las convertirá en instrucciones por capítulo y aplicará correcciones quirúrgicas
                              preservando el 90%+ del texto. Si una reescritura empeora el capítulo, se revierte automáticamente al original.
                            </p>
                            <Label htmlFor="editorial-notes-textarea" className="text-xs">
                              Notas editoriales (máx. 50.000 caracteres)
                            </Label>
                            <Textarea
                              id="editorial-notes-textarea"
                              value={editorialNotes}
                              onChange={(e) => setEditorialNotes(e.target.value)}
                              placeholder="Ej: '1. Veredicto Editorial Riguroso. El manuscrito presenta una premisa de alto impacto... ⚠️ Debilidades críticas: La aparición de Vasco Carballo en la cripta de Guadalupe resulta demasiado providencial...'"
                              className="min-h-[200px] text-xs font-mono resize-y"
                              maxLength={50000}
                              data-testid="textarea-editorial-notes"
                            />
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>{editorialNotes.length.toLocaleString()} / 50.000 caracteres</span>
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
                              onClick={() => applyEditorialNotesMutation.mutate({
                                id: currentProject.id,
                                notes: editorialNotes.trim()
                              })}
                              disabled={
                                !editorialNotes.trim() ||
                                applyEditorialNotesMutation.isPending ||
                                currentProject.status !== "completed"
                              }
                              data-testid="button-apply-editorial-notes"
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <FilePen className="h-4 w-4 mr-2" />
                              {applyEditorialNotesMutation.isPending
                                ? "Procesando notas..."
                                : "Aplicar Notas del Editor (Reescritura Quirúrgica)"}
                            </Button>
                            <p className="text-[10px] text-muted-foreground italic">
                              ⓘ El proceso: 1) un agente analiza tus notas y extrae instrucciones por capítulo,
                              2) cada capítulo afectado se reescribe quirúrgicamente preservando longitud y estructura,
                              3) el Editor verifica la nueva versión y revierte si introduce nuevos errores críticos.
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
    </div>
  );
}
