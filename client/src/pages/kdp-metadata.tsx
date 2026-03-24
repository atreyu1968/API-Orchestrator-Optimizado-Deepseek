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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tag, Loader2, Sparkles, Copy, Trash2, Edit3, BookOpen, 
  Check, Eye, AlertTriangle, Search, Globe, Info, FileText
} from "lucide-react";
import type { KdpMetadata } from "@shared/schema";

const KDP_ALLOWED_TAGS = new Set(["b", "i", "em", "strong", "br", "p", "h4", "h5", "h6", "ul", "ol", "li", "hr"]);

function sanitizeKdpHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi, (match, tag) => {
    return KDP_ALLOWED_TAGS.has(tag.toLowerCase()) ? match : "";
  });
}

const MARKETPLACES = [
  { value: "amazon.es", label: "Amazon España" },
  { value: "amazon.com", label: "Amazon USA" },
  { value: "amazon.co.uk", label: "Amazon UK" },
  { value: "amazon.de", label: "Amazon Alemania" },
  { value: "amazon.fr", label: "Amazon Francia" },
  { value: "amazon.it", label: "Amazon Italia" },
  { value: "amazon.com.mx", label: "Amazon México" },
  { value: "amazon.com.br", label: "Amazon Brasil" },
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Portugués" },
];

export default function KdpMetadataPage() {
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<"project" | "reedit">("project");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedReeditId, setSelectedReeditId] = useState<number | null>(null);
  const [language, setLanguage] = useState("es");
  const [marketplace, setMarketplace] = useState("amazon.es");
  const [editingMeta, setEditingMeta] = useState<KdpMetadata | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [viewingMeta, setViewingMeta] = useState<KdpMetadata | null>(null);

  const { data: allMetadata = [], isLoading } = useQuery<KdpMetadata[]>({
    queryKey: ["/api/kdp-metadata"],
  });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: reedits = [] } = useQuery<any[]>({ queryKey: ["/api/reedit-projects"] });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const body: any = { language, targetMarketplace: marketplace };
      if (sourceType === "project") body.projectId = selectedProjectId;
      if (sourceType === "reedit") body.reeditProjectId = selectedReeditId;
      const res = await apiRequest("POST", "/api/kdp-metadata/generate", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kdp-metadata"] });
      toast({ title: "Metadatos generados", description: "Los metadatos KDP se han creado correctamente." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/kdp-metadata/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kdp-metadata"] });
      toast({ title: "Eliminado" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/kdp-metadata/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kdp-metadata"] });
      setEditingMeta(null);
      toast({ title: "Actualizado" });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: `${label} copiado al portapapeles.` });
  };

  const copyAllMetadata = (meta: KdpMetadata) => {
    const parts = [
      `TÍTULO: ${meta.title}`,
      meta.subtitle ? `SUBTÍTULO: ${meta.subtitle}` : "",
      `\nDESCRIPCIÓN:\n${meta.description || ""}`,
      `\nPALABRAS CLAVE:`,
      ...(meta.keywords || []).map((k, i) => `  ${i + 1}. ${k}`),
      `\nCATEGORÍAS BISAC:`,
      ...(meta.bisacCategories || []).map((c, i) => `  ${i + 1}. ${c}`),
      meta.seriesName ? `\nSERIE: ${meta.seriesName}` : "",
      meta.seriesNumber ? `NÚMERO EN SERIE: ${meta.seriesNumber}` : "",
      meta.seriesDescription ? `DESCRIPCIÓN DE SERIE: ${meta.seriesDescription}` : "",
      `\nIDIOMA: ${meta.language}`,
      `MARKETPLACE: ${meta.targetMarketplace}`,
      `DIVULGACIÓN IA: ${meta.aiDisclosure}`,
      meta.contentWarnings ? `ADVERTENCIAS: ${meta.contentWarnings}` : "",
    ].filter(Boolean).join("\n");
    copyToClipboard(parts, "Todos los metadatos");
  };

  const canGenerate = () => {
    if (sourceType === "project") return !!selectedProjectId;
    if (sourceType === "reedit") return !!selectedReeditId;
    return false;
  };

  const completedProjects = projects.filter((p: any) => p.status === "completed");
  const completedReedits = reedits.filter((r: any) => r.status === "completed");

  const descriptionLength = (desc: string) => {
    return desc?.length || 0;
  };

  const openEditDialog = (meta: KdpMetadata) => {
    setEditingMeta(meta);
    setEditForm({
      subtitle: meta.subtitle || "",
      description: meta.description || "",
      keywords: [...(meta.keywords || [])],
      bisacCategories: [...(meta.bisacCategories || [])],
      seriesName: meta.seriesName || "",
      seriesNumber: meta.seriesNumber || "",
      seriesDescription: meta.seriesDescription || "",
      contentWarnings: meta.contentWarnings || "",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-kdp-title">
            <Tag className="h-8 w-8" />
            Metadatos KDP
          </h1>
          <p className="text-muted-foreground mt-1">
            Genera subtítulo, descripción, palabras clave y categorías para publicar en Amazon
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {allMetadata.length} registro{allMetadata.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Generar Metadatos
          </CardTitle>
          <CardDescription>
            Selecciona el libro y genera metadatos optimizados para Amazon KDP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="project" data-testid="tab-source-project">
                <BookOpen className="h-3 w-3 mr-1" /> Proyecto
              </TabsTrigger>
              <TabsTrigger value="reedit" data-testid="tab-source-reedit">
                <Edit3 className="h-3 w-3 mr-1" /> Reedición
              </TabsTrigger>
            </TabsList>

            <TabsContent value="project" className="mt-4">
              <Select
                value={selectedProjectId?.toString() || ""}
                onValueChange={(v) => setSelectedProjectId(parseInt(v))}
              >
                <SelectTrigger data-testid="select-kdp-project">
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

            <TabsContent value="reedit" className="mt-4">
              <Select
                value={selectedReeditId?.toString() || ""}
                onValueChange={(v) => setSelectedReeditId(parseInt(v))}
              >
                <SelectTrigger data-testid="select-kdp-reedit">
                  <SelectValue placeholder="Selecciona una reedición completada..." />
                </SelectTrigger>
                <SelectContent>
                  {completedReedits.map((r: any) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> Idioma
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Search className="h-3 w-3" /> Marketplace
              </Label>
              <Select value={marketplace} onValueChange={setMarketplace}>
                <SelectTrigger data-testid="select-marketplace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate() || generateMutation.isPending}
            className="w-full"
            data-testid="button-generate-metadata"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando metadatos...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generar Metadatos KDP
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : allMetadata.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Tag className="h-12 w-12 mb-4 opacity-50" />
            <p>No hay metadatos KDP todavía</p>
            <p className="text-sm">Selecciona un proyecto y genera los metadatos para publicar en Amazon</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allMetadata.map((meta) => (
            <Card key={meta.id} data-testid={`kdp-metadata-${meta.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{meta.title}</CardTitle>
                    {meta.subtitle && (
                      <CardDescription className="mt-0.5">{meta.subtitle}</CardDescription>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">{meta.language}</Badge>
                      <Badge variant="outline" className="text-xs">{meta.targetMarketplace}</Badge>
                      <Badge 
                        variant={meta.aiDisclosure === "ai-generated" ? "destructive" : "secondary"} 
                        className="text-xs"
                      >
                        {meta.aiDisclosure === "ai-generated" ? "IA Generado" : "IA Asistido"}
                      </Badge>
                      {meta.seriesName && (
                        <Badge variant="default" className="text-xs">Serie: {meta.seriesName}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewingMeta(meta)}
                      data-testid={`button-view-meta-${meta.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyAllMetadata(meta)}
                      data-testid={`button-copy-meta-${meta.id}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditDialog(meta)}
                      data-testid={`button-edit-meta-${meta.id}`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(meta.id)}
                      data-testid={`button-delete-meta-${meta.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Search className="h-3 w-3" /> Palabras Clave
                  </Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(meta.keywords || []).map((kw, i) => (
                      kw && <Badge key={i} variant="outline" className="text-xs cursor-pointer hover:bg-muted"
                        onClick={() => copyToClipboard(kw, `Keyword ${i + 1}`)}
                      >
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Categorías BISAC
                  </Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(meta.bisacCategories || []).map((cat, i) => (
                      <Badge key={i} variant="secondary" className="text-xs cursor-pointer hover:bg-muted"
                        onClick={() => copyToClipboard(cat, `Categoría ${i + 1}`)}
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!viewingMeta} onOpenChange={(open) => !open && setViewingMeta(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {viewingMeta?.title}
            </DialogTitle>
          </DialogHeader>
          {viewingMeta && (
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-5 pr-4">
                {viewingMeta.subtitle && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Subtítulo</Label>
                    <p className="text-sm mt-1 font-medium">{viewingMeta.subtitle}</p>
                    <Button variant="ghost" size="sm" className="mt-1 h-6" 
                      onClick={() => copyToClipboard(viewingMeta.subtitle!, "Subtítulo")}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Descripción (HTML)</Label>
                    <span className={`text-xs ${descriptionLength(viewingMeta.description || "") > 4000 ? "text-destructive" : "text-muted-foreground"}`}>
                      {descriptionLength(viewingMeta.description || "")}/4000 caracteres
                    </span>
                  </div>
                  {descriptionLength(viewingMeta.description || "") > 4000 && (
                    <Alert variant="destructive" className="mt-1 py-1 px-2">
                      <AlertTriangle className="h-3 w-3" />
                      <AlertDescription className="text-xs">La descripción excede el límite de 4000 caracteres de KDP</AlertDescription>
                    </Alert>
                  )}
                  <div className="mt-2 bg-muted p-3 rounded-md">
                    <pre className="text-xs whitespace-pre-wrap font-mono">{viewingMeta.description}</pre>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Button variant="ghost" size="sm" className="h-6"
                      onClick={() => copyToClipboard(viewingMeta.description || "", "Descripción HTML")}>
                      <Copy className="h-3 w-3 mr-1" /> HTML
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6"
                      onClick={() => {
                        const tmp = document.createElement("div");
                        tmp.innerHTML = viewingMeta.description || "";
                        copyToClipboard(tmp.textContent || "", "Descripción texto");
                      }}>
                      <Copy className="h-3 w-3 mr-1" /> Texto plano
                    </Button>
                  </div>
                  <Separator className="my-2" />
                  <Label className="text-xs text-muted-foreground">Vista previa</Label>
                  <div className="mt-1 bg-background border p-3 rounded-md text-sm prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeKdpHtml(viewingMeta.description || "") }}
                  />
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-muted-foreground">Palabras Clave (7)</Label>
                  <div className="space-y-1 mt-2">
                    {(viewingMeta.keywords || []).map((kw, i) => (
                      <div key={i} className="flex items-center justify-between bg-muted rounded px-2 py-1">
                        <span className="text-sm">
                          <span className="text-muted-foreground mr-2">{i + 1}.</span>
                          {kw}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${(kw?.length || 0) > 50 ? "text-destructive" : "text-muted-foreground"}`}>
                            {kw?.length || 0}/50
                          </span>
                          <Button variant="ghost" size="icon" className="h-5 w-5"
                            onClick={() => copyToClipboard(kw, `Keyword ${i + 1}`)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Categorías BISAC</Label>
                  <div className="space-y-1 mt-2">
                    {(viewingMeta.bisacCategories || []).map((cat, i) => (
                      <div key={i} className="flex items-center justify-between bg-muted rounded px-2 py-1">
                        <span className="text-sm">{cat}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5"
                          onClick={() => copyToClipboard(cat, `Categoría ${i + 1}`)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {viewingMeta.seriesName && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-xs text-muted-foreground">Información de Serie</Label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <span className="text-xs text-muted-foreground">Nombre</span>
                          <p className="text-sm font-medium">{viewingMeta.seriesName}</p>
                        </div>
                        {viewingMeta.seriesNumber && (
                          <div>
                            <span className="text-xs text-muted-foreground">Número</span>
                            <p className="text-sm font-medium">{viewingMeta.seriesNumber}</p>
                          </div>
                        )}
                      </div>
                      {viewingMeta.seriesDescription && (
                        <div className="mt-2">
                          <span className="text-xs text-muted-foreground">Descripción de Serie</span>
                          <p className="text-sm mt-1">{viewingMeta.seriesDescription}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Separator />

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-xs text-muted-foreground">Idioma</span>
                    <p className="text-sm">{viewingMeta.language}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Marketplace</span>
                    <p className="text-sm">{viewingMeta.targetMarketplace}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Divulgación IA</span>
                    <p className="text-sm">{viewingMeta.aiDisclosure}</p>
                  </div>
                </div>

                {viewingMeta.contentWarnings && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Advertencias de Contenido</Label>
                    <p className="text-sm mt-1">{viewingMeta.contentWarnings}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMeta} onOpenChange={(open) => !open && setEditingMeta(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Editar Metadatos</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            <div className="space-y-4 pr-4">
              <div>
                <Label>Subtítulo</Label>
                <Input
                  value={editForm.subtitle || ""}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                  data-testid="input-edit-subtitle"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Descripción (HTML)</Label>
                  <span className={`text-xs ${(editForm.description?.length || 0) > 4000 ? "text-destructive" : "text-muted-foreground"}`}>
                    {editForm.description?.length || 0}/4000
                  </span>
                </div>
                <Textarea
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={8}
                  className="font-mono text-xs mt-1"
                  data-testid="textarea-edit-description"
                />
              </div>

              <div>
                <Label>Palabras Clave (7 x 50 caracteres máx.)</Label>
                <div className="space-y-2 mt-2">
                  {(editForm.keywords || []).map((kw: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <Input
                        value={kw}
                        maxLength={50}
                        onChange={(e) => {
                          const newKw = [...editForm.keywords];
                          newKw[i] = e.target.value;
                          setEditForm({ ...editForm, keywords: newKw });
                        }}
                        className="text-sm"
                        data-testid={`input-edit-keyword-${i}`}
                      />
                      <span className={`text-xs ${(kw?.length || 0) > 50 ? "text-destructive" : "text-muted-foreground"} w-10 text-right`}>
                        {kw?.length || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Categorías BISAC</Label>
                <div className="space-y-2 mt-2">
                  {(editForm.bisacCategories || []).map((cat: string, i: number) => (
                    <Input
                      key={i}
                      value={cat}
                      onChange={(e) => {
                        const newCats = [...editForm.bisacCategories];
                        newCats[i] = e.target.value;
                        setEditForm({ ...editForm, bisacCategories: newCats });
                      }}
                      className="text-sm"
                      data-testid={`input-edit-category-${i}`}
                    />
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nombre de Serie</Label>
                  <Input
                    value={editForm.seriesName || ""}
                    onChange={(e) => setEditForm({ ...editForm, seriesName: e.target.value })}
                    data-testid="input-edit-series-name"
                  />
                </div>
                <div>
                  <Label>Número en Serie</Label>
                  <Input
                    type="number"
                    value={editForm.seriesNumber || ""}
                    onChange={(e) => setEditForm({ ...editForm, seriesNumber: parseInt(e.target.value) || null })}
                    data-testid="input-edit-series-number"
                  />
                </div>
              </div>

              <div>
                <Label>Descripción de Serie</Label>
                <Textarea
                  value={editForm.seriesDescription || ""}
                  onChange={(e) => setEditForm({ ...editForm, seriesDescription: e.target.value })}
                  rows={3}
                  className="text-sm mt-1"
                  data-testid="textarea-edit-series-desc"
                />
              </div>

              <div>
                <Label>Advertencias de Contenido</Label>
                <Input
                  value={editForm.contentWarnings || ""}
                  onChange={(e) => setEditForm({ ...editForm, contentWarnings: e.target.value })}
                  data-testid="input-edit-warnings"
                />
              </div>
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditingMeta(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingMeta) {
                  updateMutation.mutate({ id: editingMeta.id, data: editForm });
                }
              }}
              disabled={updateMutation.isPending}
              data-testid="button-save-metadata"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
