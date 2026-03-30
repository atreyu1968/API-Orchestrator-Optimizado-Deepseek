import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfigPanel, type ConfigFormData } from "@/components/config-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Settings, Trash2, BookOpen, Clock, Pencil, FileText, Upload, Search, Download, Library } from "lucide-react";
import { BOOK_WRITING_GUIDE_TEMPLATE, downloadTemplate } from "@/lib/writing-templates";
import { Link } from "wouter";
import type { Project, ExtendedGuide, Pseudonym } from "@shared/schema";

export default function ConfigPage() {
  const { toast } = useToast();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const [deleteGuideId, setDeleteGuideId] = useState<number | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [convertProject, setConvertProject] = useState<Project | null>(null);
  const [seriesTitle, setSeriesTitle] = useState("");
  const [totalPlannedBooks, setTotalPlannedBooks] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: extendedGuides = [], isLoading: isLoadingGuides } = useQuery<ExtendedGuide[]>({
    queryKey: ["/api/extended-guides"],
  });

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const getPseudonymName = (id: number | null) => {
    if (!id) return null;
    return pseudonyms.find(p => p.id === id)?.name || null;
  };

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const search = projectSearch.toLowerCase();
    return projects.filter(p => 
      p.title.toLowerCase().includes(search) ||
      p.genre.toLowerCase().includes(search) ||
      p.tone.toLowerCase().includes(search)
    );
  }, [projects, projectSearch]);

  const createProjectMutation = useMutation({
    mutationFn: async (data: ConfigFormData) => {
      console.log("[Config] Creating project with data:", JSON.stringify(data));
      const response = await apiRequest("POST", "/api/projects", data);
      const result = await response.json();
      console.log("[Config] Create response:", JSON.stringify(result));
      return result;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      const projectTitle = project?.title || "Nuevo proyecto";
      toast({
        title: "Proyecto creado",
        description: `"${projectTitle}" ha sido configurado. Puedes iniciar la generación desde el panel principal.`,
      });
    },
    onError: (error: any) => {
      console.error("Create project error:", error);
      toast({
        title: "Error",
        description: error?.message || "No se pudo crear el proyecto",
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Proyecto eliminado",
        description: "El proyecto ha sido eliminado correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el proyecto",
        variant: "destructive",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & ConfigFormData) => {
      const response = await apiRequest("PATCH", `/api/projects/${id}`, data);
      return response.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      setEditingProject(null);
      toast({
        title: "Proyecto actualizado",
        description: `"${project.title}" ha sido actualizado correctamente`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el proyecto",
        variant: "destructive",
      });
    },
  });

  const convertToSeriesMutation = useMutation({
    mutationFn: async ({ projectId, seriesTitle, totalPlannedBooks }: { projectId: number; seriesTitle: string; totalPlannedBooks: number }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/convert-to-series`, { seriesTitle, totalPlannedBooks });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      setConvertProject(null);
      toast({
        title: "Convertido en serie",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo convertir en serie",
        variant: "destructive",
      });
    },
  });

  const deleteGuideMutation = useMutation({
    mutationFn: async (guideId: number) => {
      await apiRequest("DELETE", `/api/extended-guides/${guideId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/extended-guides"] });
      toast({
        title: "Guía eliminada",
        description: "La guía de escritura ha sido eliminada correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la guía",
        variant: "destructive",
      });
    },
  });

  const uploadGuideMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/extended-guides/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      return response.json();
    },
    onSuccess: (guide: ExtendedGuide) => {
      queryClient.invalidateQueries({ queryKey: ["/api/extended-guides"] });
      toast({
        title: "Guía subida",
        description: `"${guide.title}" se ha añadido correctamente (${(guide.wordCount || 0).toLocaleString()} palabras)`,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo subir el archivo",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast({
        title: "Formato no soportado",
        description: "Por favor sube un archivo .docx (Word)",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    uploadGuideMutation.mutate(file);
  };

  const handleSubmit = (data: ConfigFormData) => {
    createProjectMutation.mutate(data);
  };

  const handleDelete = (projectId: number) => {
    setDeleteProjectId(projectId);
  };

  const statusLabels: Record<string, string> = {
    idle: "En espera",
    planning: "Planificando",
    generating: "Generando",
    completed: "Completado",
    error: "Error",
    awaiting_instructions: "Esperando instrucciones",
    archived: "Archivado",
  };

  const statusColors: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    planning: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    generating: "bg-chart-2/20 text-chart-2",
    completed: "bg-green-500/20 text-green-600 dark:text-green-400",
    error: "bg-red-500/20 text-red-600 dark:text-red-400",
    awaiting_instructions: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    archived: "bg-gray-500/20 text-gray-500",
  };

  return (
    <div className="p-6 space-y-6" data-testid="config-page">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona tus proyectos y configuraciones de generación
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Nuevo Proyecto
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate(BOOK_WRITING_GUIDE_TEMPLATE, "guia-escritura-libro.txt")}
                data-testid="button-download-book-guide"
              >
                <Download className="h-4 w-4 mr-1" />
                Guía de Escritura
              </Button>
            </div>
            <CardDescription>
              Configura los parámetros para un nuevo manuscrito
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigPanel 
              onSubmit={handleSubmit}
              isLoading={createProjectMutation.isPending}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Proyectos Existentes
            </CardTitle>
            <CardDescription>
              {projects.length} proyecto{projects.length !== 1 ? "s" : ""} creado{projects.length !== 1 ? "s" : ""}
            </CardDescription>
            {projects.length > 0 && (
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar proyectos..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-project-search"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Clock className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm">
                  No hay proyectos todavía
                </p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  Crea tu primer proyecto usando el formulario
                </p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm">
                  No se encontraron proyectos
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {filteredProjects.map((project) => (
                    <div 
                      key={project.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                      data-testid={`project-item-${project.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-medium text-sm truncate">{project.title}</h3>
                          {getPseudonymName(project.pseudonymId) && (
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-pseudonym-${project.id}`}>
                              {getPseudonymName(project.pseudonymId)}
                            </Badge>
                          )}
                          <Badge className={`text-xs ${statusColors[project.status] || statusColors.idle}`}>
                            {statusLabels[project.status] || project.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{project.genre}</Badge>
                          <Badge variant="outline" className="text-xs">{project.tone}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {project.chapterCount} capítulos
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {project.workType === "standalone" && !project.seriesId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setConvertProject(project);
                              setSeriesTitle(`Serie de ${project.title}`);
                              setTotalPlannedBooks(3);
                            }}
                            data-testid={`button-convert-series-${project.id}`}
                            title="Convertir en serie"
                          >
                            <Library className="h-4 w-4" />
                          </Button>
                        )}
                        {project.status === "idle" && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/projects/${project.id}`);
                                if (res.ok) {
                                  const fullProject = await res.json();
                                  setEditingProject(fullProject);
                                } else {
                                  setEditingProject(project);
                                }
                              } catch {
                                setEditingProject(project);
                              }
                            }}
                            data-testid={`button-edit-${project.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Link href="/manuscript">
                          <Button variant="ghost" size="sm" data-testid={`button-view-${project.id}`}>
                            Ver
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(project.id)}
                          disabled={deleteProjectMutation.isPending}
                          data-testid={`button-delete-${project.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Guías de Escritura Extendidas
            </CardTitle>
            <CardDescription>
              Sube documentos Word con instrucciones detalladas para la generación de novelas
            </CardDescription>
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".docx"
              className="hidden"
              data-testid="input-guide-upload"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadGuideMutation.isPending}
              data-testid="button-upload-guide"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadGuideMutation.isPending ? "Subiendo..." : "Subir Guía"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingGuides ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
            </div>
          ) : extendedGuides.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-sm">
                No hay guías de escritura todavía
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Sube un documento Word (.docx) con instrucciones detalladas
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {extendedGuides.map((guide) => (
                  <div 
                    key={guide.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                    data-testid={`guide-item-${guide.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-medium text-sm truncate">{guide.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {(guide.wordCount || 0).toLocaleString()} palabras
                        </Badge>
                      </div>
                      {guide.description && (
                        <p className="text-xs text-muted-foreground truncate">{guide.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {guide.originalFileName}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setDeleteGuideId(guide.id)}
                      disabled={deleteGuideMutation.isPending}
                      data-testid={`button-delete-guide-${guide.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acerca del Sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Modelo de IA
              </p>
              <p className="font-medium">Gemini 3 Pro Preview</p>
            </div>
            <div className="p-4 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Nivel de Razonamiento
              </p>
              <p className="font-medium">High (Deep Thinking)</p>
            </div>
            <div className="p-4 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Temperatura
              </p>
              <p className="font-medium">1.0</p>
            </div>
            <div className="p-4 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Top P
              </p>
              <p className="font-medium">0.95</p>
            </div>
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Este sistema utiliza cuatro agentes literarios autónomos (Arquitecto, Narrador, Editor, Estilista) 
            que colaboran para crear manuscritos completos. Cada agente utiliza el motor de razonamiento 
            avanzado de Gemini 3 Pro para planificar y ejecutar sus tareas con máxima coherencia narrativa.
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
          </DialogHeader>
          {editingProject && (
            <ConfigPanel
              key={editingProject.id}
              onSubmit={(data) => {
                updateProjectMutation.mutate({ id: editingProject.id, ...data });
              }}
              onReset={() => setEditingProject(null)}
              isLoading={updateProjectMutation.isPending}
              defaultValues={{
                title: editingProject.title,
                premise: editingProject.premise || "",
                genre: editingProject.genre,
                tone: editingProject.tone,
                chapterCount: editingProject.chapterCount,
                hasPrologue: editingProject.hasPrologue,
                hasEpilogue: editingProject.hasEpilogue,
                hasAuthorNote: editingProject.hasAuthorNote,
                pseudonymId: editingProject.pseudonymId,
                styleGuideId: editingProject.styleGuideId,
                extendedGuideId: editingProject.extendedGuideId,
                workType: editingProject.workType || "standalone",
                seriesId: editingProject.seriesId,
                seriesOrder: editingProject.seriesOrder,
                minWordCount: editingProject.minWordCount,
              }}
              isEditing
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteProjectId !== null}
        onOpenChange={(open) => !open && setDeleteProjectId(null)}
        title="Eliminar proyecto"
        description="¿Estás seguro de que quieres eliminar este proyecto? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="destructive"
        onConfirm={() => {
          if (deleteProjectId) {
            deleteProjectMutation.mutate(deleteProjectId);
          }
          setDeleteProjectId(null);
        }}
      />

      <ConfirmDialog
        open={deleteGuideId !== null}
        onOpenChange={(open) => !open && setDeleteGuideId(null)}
        title="Eliminar guía"
        description="¿Estás seguro de que quieres eliminar esta guía de escritura? Los proyectos que la usen perderán la referencia."
        confirmText="Eliminar"
        variant="destructive"
        onConfirm={() => {
          if (deleteGuideId) {
            deleteGuideMutation.mutate(deleteGuideId);
          }
          setDeleteGuideId(null);
        }}
      />

      <Dialog open={convertProject !== null} onOpenChange={(open) => !open && setConvertProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="h-5 w-5" />
              Convertir en Serie
            </DialogTitle>
          </DialogHeader>
          {convertProject && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                El proyecto <strong>"{convertProject.title}"</strong> se convertirá en el libro #1 de una nueva serie.
              </p>
              <div>
                <Label htmlFor="series-title">Nombre de la serie</Label>
                <Input
                  id="series-title"
                  data-testid="input-series-title"
                  value={seriesTitle}
                  onChange={(e) => setSeriesTitle(e.target.value)}
                  placeholder="Nombre de la serie..."
                />
              </div>
              <div>
                <Label htmlFor="total-books">Libros planificados</Label>
                <Input
                  id="total-books"
                  data-testid="input-total-books"
                  type="number"
                  min={2}
                  max={100}
                  value={totalPlannedBooks}
                  onChange={(e) => setTotalPlannedBooks(parseInt(e.target.value) || 3)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {totalPlannedBooks === 3 ? "Se creará como trilogía" : "Se creará como serie"}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConvertProject(null)} data-testid="button-cancel-convert">
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    if (convertProject) {
                      convertToSeriesMutation.mutate({
                        projectId: convertProject.id,
                        seriesTitle: seriesTitle.trim(),
                        totalPlannedBooks,
                      });
                    }
                  }}
                  disabled={!seriesTitle.trim() || convertToSeriesMutation.isPending}
                  data-testid="button-confirm-convert"
                >
                  {convertToSeriesMutation.isPending ? "Convirtiendo..." : "Convertir en Serie"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
