import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Image, Loader2, Sparkles, Copy, Trash2, Edit3, Palette, 
  BookOpen, Library, User, Wand2, Check, Eye
} from "lucide-react";
import type { CoverPrompt } from "@shared/schema";

type Scope = "project" | "series" | "pseudonym" | "independent";

export default function CoversPage() {
  const { toast } = useToast();
  const [scope, setScope] = useState<Scope>("project");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [selectedPseudonymId, setSelectedPseudonymId] = useState<number | null>(null);
  const [independentTitle, setIndependentTitle] = useState("");
  const [independentGenre, setIndependentGenre] = useState("fantasy");
  const [independentTone, setIndependentTone] = useState("dramatic");
  const [editingPrompt, setEditingPrompt] = useState<CoverPrompt | null>(null);
  const [editedPromptText, setEditedPromptText] = useState("");
  const [viewingPrompt, setViewingPrompt] = useState<CoverPrompt | null>(null);

  const { data: prompts = [], isLoading: loadingPrompts } = useQuery<CoverPrompt[]>({
    queryKey: ["/api/cover-prompts"],
  });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: seriesList = [] } = useQuery<any[]>({ queryKey: ["/api/series"] });
  const { data: pseudonyms = [] } = useQuery<any[]>({ queryKey: ["/api/pseudonyms"] });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const body: any = { scope };
      if (scope === "project") body.projectId = selectedProjectId;
      if (scope === "series") body.seriesId = selectedSeriesId;
      if (scope === "pseudonym") body.pseudonymId = selectedPseudonymId;
      if (scope === "independent") {
        body.title = independentTitle;
        body.genre = independentGenre;
        body.tone = independentTone;
      }
      const res = await apiRequest("POST", "/api/cover-prompts/generate", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cover-prompts"] });
      if (data.chainGenerated && data.chainGenerated.length > 1) {
        const chainLabels = data.chainGenerated.map((c: any) => {
          if (c.scope === "pseudonym") return `Branding de autor`;
          if (c.scope === "series") return `Diseño de serie`;
          return `Portada del proyecto`;
        }).join(" → ");
        toast({ title: "Cadena generada", description: `Se crearon ${data.chainGenerated.length} prompts en cadena: ${chainLabels}` });
      } else {
        toast({ title: "Prompt generado", description: "El prompt de portada se ha creado correctamente." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cover-prompts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cover-prompts"] });
      toast({ title: "Eliminado" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/cover-prompts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cover-prompts"] });
      setEditingPrompt(null);
      toast({ title: "Actualizado" });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: `${label} copiado al portapapeles.` });
  };

  const canGenerate = () => {
    if (scope === "project") return !!selectedProjectId;
    if (scope === "series") return !!selectedSeriesId;
    if (scope === "pseudonym") return !!selectedPseudonymId;
    if (scope === "independent") return independentTitle.trim().length > 0;
    return false;
  };

  const getScopeIcon = (s: string) => {
    switch (s) {
      case "project": return <BookOpen className="h-4 w-4" />;
      case "series": return <Library className="h-4 w-4" />;
      case "pseudonym": return <User className="h-4 w-4" />;
      default: return <Wand2 className="h-4 w-4" />;
    }
  };

  const completedProjects = projects.filter((p: any) => p.status === "completed");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-covers-title">
            <Image className="h-8 w-8" />
            Portadas
          </h1>
          <p className="text-muted-foreground mt-1">
            Genera prompts optimizados para crear portadas con IA (KDP: 2560x1600px, 300 DPI, RGB)
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {prompts.length} prompt{prompts.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Generar Nuevo Prompt
          </CardTitle>
          <CardDescription>
            Selecciona el ámbito y genera un prompt detallado para tu portada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Ámbito</Label>
            <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)} className="mt-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="project" data-testid="tab-scope-project" className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Proyecto
                </TabsTrigger>
                <TabsTrigger value="series" data-testid="tab-scope-series" className="flex items-center gap-1">
                  <Library className="h-3 w-3" /> Serie
                </TabsTrigger>
                <TabsTrigger value="pseudonym" data-testid="tab-scope-pseudonym" className="flex items-center gap-1">
                  <User className="h-3 w-3" /> Seudónimo
                </TabsTrigger>
                <TabsTrigger value="independent" data-testid="tab-scope-independent" className="flex items-center gap-1">
                  <Wand2 className="h-3 w-3" /> Independiente
                </TabsTrigger>
              </TabsList>

              <TabsContent value="project" className="mt-4">
                <Select
                  value={selectedProjectId?.toString() || ""}
                  onValueChange={(v) => setSelectedProjectId(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-project">
                    <SelectValue placeholder="Selecciona un proyecto completado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {completedProjects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.title} ({p.genre})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>

              <TabsContent value="series" className="mt-4">
                <Select
                  value={selectedSeriesId?.toString() || ""}
                  onValueChange={(v) => setSelectedSeriesId(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-series">
                    <SelectValue placeholder="Selecciona una serie..." />
                  </SelectTrigger>
                  <SelectContent>
                    {seriesList.map((s: any) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>

              <TabsContent value="pseudonym" className="mt-4">
                <Select
                  value={selectedPseudonymId?.toString() || ""}
                  onValueChange={(v) => setSelectedPseudonymId(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-pseudonym">
                    <SelectValue placeholder="Selecciona un seudónimo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pseudonyms.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name} {p.defaultGenre ? `(${p.defaultGenre})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>

              <TabsContent value="independent" className="mt-4 space-y-3">
                <div>
                  <Label>Título del libro</Label>
                  <Input
                    value={independentTitle}
                    onChange={(e) => setIndependentTitle(e.target.value)}
                    placeholder="Título del libro..."
                    data-testid="input-independent-title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Género</Label>
                    <Select value={independentGenre} onValueChange={setIndependentGenre}>
                      <SelectTrigger data-testid="select-independent-genre">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["fantasy", "sci-fi", "thriller", "romance", "horror", "mystery", "literary", "historical", "adventure", "dystopian"].map(g => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tono</Label>
                    <Select value={independentTone} onValueChange={setIndependentTone}>
                      <SelectTrigger data-testid="select-independent-tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["dramatic", "dark", "epic", "intimate", "suspenseful", "whimsical", "melancholic", "hopeful"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {scope === "project" && selectedProjectId && (() => {
            const proj = projects.find((p: any) => p.id === selectedProjectId);
            if (!proj) return null;
            const projSeries = proj.seriesId ? seriesList.find((s: any) => s.id === proj.seriesId) : null;
            const effectivePseudonymId = proj.pseudonymId || projSeries?.pseudonymId || null;
            const hasPseudonym = !!effectivePseudonymId;
            const hasSeries = !!proj.seriesId;
            if (!hasPseudonym && !hasSeries) return null;
            const pseudoCovers = hasPseudonym ? prompts.filter(p => p.pseudonymId === effectivePseudonymId && (p as any).authorBranding) : [];
            const seriesCovers = hasSeries ? prompts.filter(p => p.seriesId === proj.seriesId && (p as any).seriesDesignSystem) : [];
            const missingPseudo = hasPseudonym && pseudoCovers.length === 0;
            const missingSeries = hasSeries && seriesCovers.length === 0;
            if (!missingPseudo && !missingSeries) return null;
            return (
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm space-y-1" data-testid="chain-warning">
                <p className="font-medium text-amber-600 dark:text-amber-400">Se generarán diseños previos automáticamente:</p>
                {missingPseudo && <p className="text-muted-foreground">• Branding del autor (no existe aún)</p>}
                {missingSeries && <p className="text-muted-foreground">• Diseño de la serie (no existe aún)</p>}
                <p className="text-muted-foreground">• Portada del proyecto</p>
              </div>
            );
          })()}

          {scope === "series" && selectedSeriesId && (() => {
            const ser = seriesList.find((s: any) => s.id === selectedSeriesId);
            if (!ser?.pseudonymId) return null;
            const pseudoCovers = prompts.filter(p => p.pseudonymId === ser.pseudonymId && (p as any).authorBranding);
            if (pseudoCovers.length > 0) return null;
            return (
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm space-y-1" data-testid="chain-warning-series">
                <p className="font-medium text-amber-600 dark:text-amber-400">Se generará el branding del autor primero:</p>
                <p className="text-muted-foreground">• Branding del autor (no existe aún)</p>
                <p className="text-muted-foreground">• Diseño de la serie</p>
              </div>
            );
          })()}

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate() || generateMutation.isPending}
            className="w-full"
            data-testid="button-generate-cover"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando{scope === "project" || scope === "series" ? " cadena de diseño..." : " prompt..."}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generar Prompt de Portada
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {loadingPrompts ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : prompts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Image className="h-12 w-12 mb-4 opacity-50" />
            <p>No hay prompts de portada todavía</p>
            <p className="text-sm">Genera tu primer prompt seleccionando un ámbito arriba</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {prompts.map((prompt) => (
            <Card key={prompt.id} data-testid={`cover-prompt-${prompt.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{prompt.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{prompt.style}</Badge>
                      {prompt.mood && <Badge variant="outline" className="text-xs">{prompt.mood}</Badge>}
                      {prompt.seriesId && <Badge variant="default" className="text-xs">Serie</Badge>}
                      {prompt.pseudonymId && <Badge variant="default" className="text-xs">Autor</Badge>}
                      {(prompt as any).authorBranding && <Badge className="text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30">Branding</Badge>}
                      {prompt.seriesDesignSystem && <Badge className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30">Diseño Serie</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setViewingPrompt(prompt)}
                          data-testid={`button-view-${prompt.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>{prompt.title}</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh]">
                          <div className="space-y-4 pr-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Prompt Principal</Label>
                              <p className="text-sm mt-1 whitespace-pre-wrap bg-muted p-3 rounded-md">{prompt.prompt}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1"
                                onClick={() => copyToClipboard(prompt.prompt, "Prompt")}
                              >
                                <Copy className="h-3 w-3 mr-1" /> Copiar
                              </Button>
                            </div>
                            {prompt.negativePrompt && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Negative Prompt</Label>
                                <p className="text-sm mt-1 whitespace-pre-wrap bg-muted p-3 rounded-md">{prompt.negativePrompt}</p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-1"
                                  onClick={() => copyToClipboard(prompt.negativePrompt!, "Negative prompt")}
                                >
                                  <Copy className="h-3 w-3 mr-1" /> Copiar
                                </Button>
                              </div>
                            )}
                            <Separator />
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs text-muted-foreground">Estilo</Label>
                                <p className="text-sm">{prompt.style}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Mood</Label>
                                <p className="text-sm">{prompt.mood || "-"}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Paleta de Colores</Label>
                                <p className="text-sm">{prompt.colorPalette || "-"}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Tipografía</Label>
                                <p className="text-sm">{prompt.typography || "-"}</p>
                              </div>
                            </div>
                            {prompt.composition && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Composición</Label>
                                <p className="text-sm">{prompt.composition}</p>
                              </div>
                            )}
                            {(prompt as any).authorBranding && (
                              <div>
                                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="h-3 w-3" /> Branding de Autor
                                </Label>
                                <div className="text-sm mt-1 bg-purple-500/5 border border-purple-500/20 p-3 rounded-md space-y-1">
                                  {Object.entries((prompt as any).authorBranding).map(([key, val]) => (
                                    <div key={key}><span className="font-medium">{key}:</span> {String(val)}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {prompt.seriesDesignSystem && (
                              <div>
                                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Library className="h-3 w-3" /> Sistema de Diseño de Serie
                                </Label>
                                <div className="text-sm mt-1 bg-blue-500/5 border border-blue-500/20 p-3 rounded-md space-y-1">
                                  {Object.entries(prompt.seriesDesignSystem as Record<string, any>).map(([key, val]) => (
                                    <div key={key}><span className="font-medium">{key}:</span> {String(val)}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(prompt.prompt, "Prompt")}
                      data-testid={`button-copy-${prompt.id}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingPrompt(prompt);
                        setEditedPromptText(prompt.prompt);
                      }}
                      data-testid={`button-edit-${prompt.id}`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(prompt.id)}
                      data-testid={`button-delete-${prompt.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground line-clamp-3">{prompt.prompt}</p>
                {prompt.colorPalette && (
                  <div className="flex items-center gap-1 mt-2">
                    <Palette className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{prompt.colorPalette}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prompt</Label>
              <Textarea
                value={editedPromptText}
                onChange={(e) => setEditedPromptText(e.target.value)}
                rows={10}
                className="mt-1 font-mono text-sm"
                data-testid="textarea-edit-prompt"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingPrompt(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (editingPrompt) {
                    updateMutation.mutate({ id: editingPrompt.id, data: { prompt: editedPromptText } });
                  }
                }}
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
