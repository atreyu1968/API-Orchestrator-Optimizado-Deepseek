// [Fix17] Página KDP Metadata con pipeline completo (análisis + multi-mercado + marketing kit + landing).
import { useState, useMemo, useEffect } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Tag, Loader2, Sparkles, Copy, Trash2, Edit3, BookOpen,
  Check, Eye, AlertTriangle, Search, Globe, FileText, Rocket,
  Layers, Megaphone, LayoutTemplate, Brain
} from "lucide-react";
import type { KdpMetadata } from "@shared/schema";

const KDP_ALLOWED_TAGS = new Set(["b","i","em","strong","br","p","h4","h5","h6","ul","ol","li","hr","u"]);
// [Fix17/review] Sanitiza tags Y atributos para evitar XSS via <p onmouseover=...>
function sanitizeKdpHtml(html: string): string {
  if (!html) return "";
  let out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (mt, tag) => {
    const t = String(tag).toLowerCase();
    if (!KDP_ALLOWED_TAGS.has(t)) return "";
    const closing = mt.startsWith("</");
    const selfClosing = /\/\s*>$/.test(mt) || t === "br" || t === "hr";
    return closing ? `</${t}>` : (selfClosing ? `<${t}/>` : `<${t}>`);
  });
  return out;
}

const LANGUAGES = [
  { value: "es", label: "Español" }, { value: "en", label: "Inglés" },
  { value: "fr", label: "Francés" }, { value: "de", label: "Alemán" },
  { value: "it", label: "Italiano" }, { value: "pt", label: "Portugués" },
];
const MARKETPLACES = [
  { value: "amazon.es", label: "Amazon España" }, { value: "amazon.com", label: "Amazon USA" },
  { value: "amazon.co.uk", label: "Amazon UK" },  { value: "amazon.de", label: "Amazon Alemania" },
  { value: "amazon.fr", label: "Amazon Francia" }, { value: "amazon.it", label: "Amazon Italia" },
  { value: "amazon.com.mx", label: "Amazon México" }, { value: "amazon.com.br", label: "Amazon Brasil" },
];

interface MarketCatalog { id: string; name: string; locale: string; currency: string; domain: string; }

interface PipelineProgress {
  step: "queued" | "analyzing" | "metadata" | "marketing" | "landing" | "completed" | "failed";
  marketsTotal: number; marketsDone: number; currentMarket?: string;
  message?: string; error?: string;
}

interface MarketEntry {
  marketId: string; marketName: string; locale: string; currency: string; domain: string;
  metadata: { title: string; subtitle: string; description: string; keywords: string[]; categories: string[]; };
  optimizedKeywords: string[];
  seo: { seoTitle: string; seoDescription: string; seoKeywords: string[]; ogTitle: string; ogDescription: string; };
  generatedAt: string; error?: string;
}

interface ManuscriptAnalysis {
  seedKeywords: string[]; themes: string[]; entities: string[]; tropes: string[];
  targetAudienceInsights: string[]; emotionalHooks: string[]; isFiction: boolean;
  wasSampled: boolean; originalLength: number; sampledLength: number;
}

interface MarketingKit {
  tiktokHooks: string[]; instagramPosts: string[]; pinterestDescriptions: string[];
  hashtags: { general: string[]; specific: string[] };
  leadMagnetIdeas: string[]; reviewCTA: string; freePromoStrategy: string;
  bookQuotes: string[];
  nicheCategories: { category: string; competitiveness: "baja"|"media"|"alta"; reason: string }[];
  facebookGroupContent: string[];
  thirtyDayPlan: { day: number; task: string; platform?: string }[];
}

interface LandingContent {
  tagline: string; extendedSynopsis: string;
  featuredCharacteristics: string[]; memorableQuotes: string[]; pressNotes: string;
}

type FullMeta = KdpMetadata & {
  manuscriptAnalysis?: ManuscriptAnalysis | null;
  marketEntries?: MarketEntry[] | null;
  marketingKit?: MarketingKit | null;
  landingContent?: LandingContent | null;
  pipelineStatus?: string | null;
  pipelineProgress?: PipelineProgress | null;
};

const STEP_LABELS: Record<string, string> = {
  queued: "En cola", analyzing: "Analizando manuscrito", metadata: "Generando metadata por mercado",
  marketing: "Kit de marketing orgánico", landing: "Contenido para landing page",
  completed: "Completado", partial: "Completado con fallos parciales", failed: "Falló",
};

export default function KdpMetadataPage() {
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<"project" | "reedit">("project");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedReeditId, setSelectedReeditId] = useState<number | null>(null);

  // Legacy generator state
  const [language, setLanguage] = useState("es");
  const [marketplace, setMarketplace] = useState("amazon.es");

  // Pipeline state
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>(["es","us","uk","mx"]);
  const [primaryMarketId, setPrimaryMarketId] = useState<string>("es");

  const [editingMeta, setEditingMeta] = useState<FullMeta | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [viewingMeta, setViewingMeta] = useState<FullMeta | null>(null);

  const { data: allMetadata = [], isLoading } = useQuery<FullMeta[]>({
    queryKey: ["/api/kdp-metadata"],
    refetchInterval: (q) => {
      const data = (q.state.data || []) as FullMeta[];
      const inProgress = data.some(m => m.pipelineStatus && !["idle","completed","partial","failed"].includes(m.pipelineStatus));
      return inProgress ? 4000 : false;
    },
  });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: reedits = [] } = useQuery<any[]>({ queryKey: ["/api/reedit-projects"] });
  const { data: marketCatalog = [] } = useQuery<MarketCatalog[]>({ queryKey: ["/api/kdp-metadata/markets"] });

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
      toast({ title: "Metadatos generados", description: "Los metadatos KDP simples se han creado." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pipelineMutation = useMutation({
    mutationFn: async () => {
      const body: any = { marketIds: selectedMarketIds, primaryMarketId };
      if (sourceType === "project") body.projectId = selectedProjectId;
      if (sourceType === "reedit") body.reeditProjectId = selectedReeditId;
      const res = await apiRequest("POST", "/api/kdp-metadata/run-pipeline", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kdp-metadata"] });
      toast({
        title: "Pipeline en marcha",
        description: `${selectedMarketIds.length} mercado(s) en cola. Esto puede tardar varios minutos.`,
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/kdp-metadata/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kdp-metadata"] }); toast({ title: "Eliminado" }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/kdp-metadata/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kdp-metadata"] });
      setEditingMeta(null); toast({ title: "Actualizado" });
    },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: `${label} copiado al portapapeles.` });
  };

  const completedProjects = projects.filter((p: any) => p.status === "completed");
  const completedReedits = reedits.filter((r: any) => r.status === "completed");

  const canGenerate = () => sourceType === "project" ? !!selectedProjectId : !!selectedReeditId;
  const canRunPipeline = () => canGenerate() && selectedMarketIds.length > 0 && selectedMarketIds.includes(primaryMarketId);

  const toggleMarket = (id: string) => {
    setSelectedMarketIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (!next.includes(primaryMarketId) && next.length > 0) setPrimaryMarketId(next[0]);
      return next;
    });
  };

  // Sync viewingMeta with refreshed list (so the dialog updates as pipeline progresses)
  useEffect(() => {
    if (!viewingMeta) return;
    const fresh = allMetadata.find(m => m.id === viewingMeta.id);
    if (fresh && fresh !== viewingMeta) setViewingMeta(fresh);
  }, [allMetadata, viewingMeta]);

  const openEditDialog = (meta: FullMeta) => {
    setEditingMeta(meta);
    setEditForm({
      subtitle: meta.subtitle || "", description: meta.description || "",
      keywords: [...(meta.keywords || [])], bisacCategories: [...(meta.bisacCategories || [])],
      seriesName: meta.seriesName || "", seriesNumber: meta.seriesNumber || "",
      seriesDescription: meta.seriesDescription || "", contentWarnings: meta.contentWarnings || "",
    });
  };

  const renderProgress = (meta: FullMeta) => {
    const p = meta.pipelineProgress;
    const status = meta.pipelineStatus || "idle";
    if (status === "idle" || status === "completed" || status === "partial" || !p) return null;
    const total = p.marketsTotal || 0;
    const done = p.marketsDone || 0;
    const pct = status === "failed" ? 100
              : status === "analyzing" ? 5
              : status === "metadata" ? 10 + (total ? Math.round((done/total) * 70) : 0)
              : status === "marketing" ? 85
              : status === "landing" ? 95 : 0;
    return (
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{STEP_LABELS[status] || status}</span>
          <span className="text-muted-foreground">{p.message || ""}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
        {status === "failed" && p.error && (
          <Alert variant="destructive" className="py-1 px-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">{p.error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
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
            Pipeline completo: análisis → metadata multi-mercado → kit marketing → landing
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {allMetadata.length} registro{allMetadata.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Source selector compartido */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Origen del libro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="project" data-testid="tab-source-project">
                <BookOpen className="h-3 w-3 mr-1" /> Proyecto
              </TabsTrigger>
              <TabsTrigger value="reedit" data-testid="tab-source-reedit">
                <Edit3 className="h-3 w-3 mr-1" /> Reedición
              </TabsTrigger>
            </TabsList>
            <TabsContent value="project" className="mt-3">
              <Select value={selectedProjectId?.toString() || ""} onValueChange={(v) => setSelectedProjectId(parseInt(v))}>
                <SelectTrigger data-testid="select-kdp-project">
                  <SelectValue placeholder="Selecciona un proyecto completado..." />
                </SelectTrigger>
                <SelectContent>
                  {completedProjects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.title} ({p.genre})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
            <TabsContent value="reedit" className="mt-3">
              <Select value={selectedReeditId?.toString() || ""} onValueChange={(v) => setSelectedReeditId(parseInt(v))}>
                <SelectTrigger data-testid="select-kdp-reedit">
                  <SelectValue placeholder="Selecciona una reedición completada..." />
                </SelectTrigger>
                <SelectContent>
                  {completedReedits.map((r: any) => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Pipeline completo (multi-mercado) */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" /> Pipeline Completo (KDP Optimizer AI)
          </CardTitle>
          <CardDescription>
            Análisis del manuscrito + metadata nativa por mercado + optimización keywords + SEO landing + kit marketing + contenido landing page.
            <span className="block text-xs mt-1">⚠️ Genera ~3 llamadas LLM por mercado + 3 globales. Puede tardar 5-15 minutos.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="flex items-center gap-1 mb-2">
              <Globe className="h-3 w-3" /> Mercados a generar ({selectedMarketIds.length} seleccionados)
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {marketCatalog.map((m) => (
                <label key={m.id} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted"
                  data-testid={`checkbox-market-${m.id}`}>
                  <Checkbox
                    checked={selectedMarketIds.includes(m.id)}
                    onCheckedChange={() => toggleMarket(m.id)}
                  />
                  <div className="text-xs">
                    <div className="font-medium">{m.id.toUpperCase()}</div>
                    <div className="text-muted-foreground">{m.locale}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mercado primario (rellena columnas legacy)</Label>
              <Select value={primaryMarketId} onValueChange={setPrimaryMarketId}>
                <SelectTrigger data-testid="select-primary-market"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {selectedMarketIds.map(id => {
                    const m = marketCatalog.find(x => x.id === id);
                    return <SelectItem key={id} value={id}>{m?.name || id.toUpperCase()}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => pipelineMutation.mutate()}
                disabled={!canRunPipeline() || pipelineMutation.isPending}
                className="w-full"
                data-testid="button-run-pipeline"
              >
                {pipelineMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Encolando...</>
                ) : (
                  <><Rocket className="h-4 w-4 mr-2" /> Ejecutar Pipeline Completo</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generador legacy (1 mercado, sin pipeline) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Generador rápido (sin pipeline)
          </CardTitle>
          <CardDescription>
            Crea metadata simple para un solo mercado a partir del world bible (no usa el manuscrito).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1"><Globe className="h-3 w-3" /> Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger data-testid="select-language"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Search className="h-3 w-3" /> Marketplace</Label>
              <Select value={marketplace} onValueChange={setMarketplace}>
                <SelectTrigger data-testid="select-marketplace"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MARKETPLACES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate() || generateMutation.isPending}
            className="w-full" variant="secondary"
            data-testid="button-generate-metadata"
          >
            {generateMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...</>
              : <><Sparkles className="h-4 w-4 mr-2" /> Generar Metadata Simple</>}
          </Button>
        </CardContent>
      </Card>

      {/* Lista de registros */}
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : allMetadata.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Tag className="h-12 w-12 mb-4 opacity-50" />
            <p>No hay metadatos KDP todavía</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allMetadata.map((meta) => {
            const isPipelineRecord = !!meta.marketEntries && (meta.marketEntries as any).length > 0;
            const inProgress = meta.pipelineStatus && !["idle","completed","partial","failed"].includes(meta.pipelineStatus);
            return (
              <Card key={meta.id} data-testid={`kdp-metadata-${meta.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {meta.title}
                        {isPipelineRecord && <Badge variant="default" className="text-xs">Pipeline</Badge>}
                        {inProgress && <Loader2 className="h-3 w-3 animate-spin" />}
                      </CardTitle>
                      {meta.subtitle && <CardDescription className="mt-0.5">{meta.subtitle}</CardDescription>}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">{meta.language}</Badge>
                        <Badge variant="outline" className="text-xs">{meta.targetMarketplace}</Badge>
                        {isPipelineRecord && (
                          <Badge variant="default" className="text-xs">
                            {(meta.marketEntries as any).length} mercado(s)
                          </Badge>
                        )}
                        {meta.seriesName && <Badge variant="default" className="text-xs">Serie: {meta.seriesName}</Badge>}
                      </div>
                      {renderProgress(meta)}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setViewingMeta(meta)}
                        data-testid={`button-view-meta-${meta.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEditDialog(meta)}
                        data-testid={`button-edit-meta-${meta.id}`}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => deleteMutation.mutate(meta.id)}
                        data-testid={`button-delete-meta-${meta.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog visor */}
      <Dialog open={!!viewingMeta} onOpenChange={(open) => !open && setViewingMeta(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> {viewingMeta?.title}
            </DialogTitle>
          </DialogHeader>
          {viewingMeta && (
            <ScrollArea className="max-h-[75vh]">
              <div className="pr-4">
                <ViewerContent meta={viewingMeta} onCopy={copy} />
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog edición */}
      <Dialog open={!!editingMeta} onOpenChange={(open) => !open && setEditingMeta(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader><DialogTitle>Editar Metadatos (mercado primario)</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            <div className="space-y-4 pr-4">
              <div>
                <Label>Subtítulo</Label>
                <Input value={editForm.subtitle || ""}
                  onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                  data-testid="input-edit-subtitle" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Descripción (HTML)</Label>
                  <span className={`text-xs ${(editForm.description?.length || 0) > 4000 ? "text-destructive" : "text-muted-foreground"}`}>
                    {editForm.description?.length || 0}/4000
                  </span>
                </div>
                <Textarea value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={8} className="font-mono text-xs mt-1" data-testid="textarea-edit-description" />
              </div>
              <div>
                <Label>Palabras Clave (7 × 50 chars)</Label>
                <div className="space-y-2 mt-2">
                  {(editForm.keywords || []).map((kw: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <Input value={kw} maxLength={50}
                        onChange={(e) => {
                          const newKw = [...editForm.keywords]; newKw[i] = e.target.value;
                          setEditForm({ ...editForm, keywords: newKw });
                        }}
                        className="text-sm" data-testid={`input-edit-keyword-${i}`} />
                      <span className={`text-xs ${(kw?.length || 0) > 50 ? "text-destructive" : "text-muted-foreground"} w-10 text-right`}>{kw?.length || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Categorías BISAC</Label>
                <div className="space-y-2 mt-2">
                  {(editForm.bisacCategories || []).map((cat: string, i: number) => (
                    <Input key={i} value={cat}
                      onChange={(e) => {
                        const newCats = [...editForm.bisacCategories]; newCats[i] = e.target.value;
                        setEditForm({ ...editForm, bisacCategories: newCats });
                      }}
                      className="text-sm" data-testid={`input-edit-category-${i}`} />
                  ))}
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nombre de Serie</Label>
                  <Input value={editForm.seriesName || ""}
                    onChange={(e) => setEditForm({ ...editForm, seriesName: e.target.value })}
                    data-testid="input-edit-series-name" />
                </div>
                <div>
                  <Label>Número en Serie</Label>
                  <Input type="number" value={editForm.seriesNumber || ""}
                    onChange={(e) => setEditForm({ ...editForm, seriesNumber: parseInt(e.target.value) || null })}
                    data-testid="input-edit-series-number" />
                </div>
              </div>
              <div>
                <Label>Advertencias de Contenido</Label>
                <Input value={editForm.contentWarnings || ""}
                  onChange={(e) => setEditForm({ ...editForm, contentWarnings: e.target.value })}
                  data-testid="input-edit-warnings" />
              </div>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditingMeta(null)}>Cancelar</Button>
            <Button onClick={() => { if (editingMeta) updateMutation.mutate({ id: editingMeta.id, data: editForm }); }}
              disabled={updateMutation.isPending} data-testid="button-save-metadata">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewerContent({ meta, onCopy }: { meta: FullMeta; onCopy: (t: string, l: string) => void }) {
  const analysis = meta.manuscriptAnalysis;
  const entries = (meta.marketEntries || []) as MarketEntry[];
  const kit = meta.marketingKit;
  const landing = meta.landingContent;
  const status = meta.pipelineStatus || "idle";
  const inProgress = status && !["idle","completed","partial","failed"].includes(status);

  const tabs = useMemo(() => {
    const t: string[] = [];
    if (analysis) t.push("analysis");
    if (entries.length > 0) t.push("markets");
    else t.push("legacy");
    if (kit) t.push("marketing");
    if (landing) t.push("landing");
    return t;
  }, [analysis, entries.length, !!kit, !!landing]);

  const [tab, setTab] = useState<string>(tabs[0] || "legacy");
  useEffect(() => { if (!tabs.includes(tab) && tabs[0]) setTab(tabs[0]); }, [tabs, tab]);
  const [marketTab, setMarketTab] = useState<string>(entries[0]?.marketId || "");
  useEffect(() => { if (entries.length > 0 && !entries.find(e => e.marketId === marketTab)) setMarketTab(entries[0].marketId); }, [entries, marketTab]);
  const activeMarket = entries.find(e => e.marketId === marketTab);

  return (
    <div className="space-y-4">
      {inProgress && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription className="text-xs">
            Pipeline en curso ({STEP_LABELS[status] || status}). Esta vista se actualiza sola.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          {tabs.includes("analysis") && <TabsTrigger value="analysis"><Brain className="h-3 w-3 mr-1" /> Análisis</TabsTrigger>}
          {tabs.includes("markets")  && <TabsTrigger value="markets"><Layers className="h-3 w-3 mr-1" /> Mercados ({entries.length})</TabsTrigger>}
          {tabs.includes("legacy")   && <TabsTrigger value="legacy"><Tag className="h-3 w-3 mr-1" /> Metadata</TabsTrigger>}
          {tabs.includes("marketing")&& <TabsTrigger value="marketing"><Megaphone className="h-3 w-3 mr-1" /> Marketing</TabsTrigger>}
          {tabs.includes("landing")  && <TabsTrigger value="landing"><LayoutTemplate className="h-3 w-3 mr-1" /> Landing</TabsTrigger>}
        </TabsList>

        {analysis && (
          <TabsContent value="analysis" className="mt-4 space-y-4">
            <div className="text-xs text-muted-foreground">
              {analysis.wasSampled
                ? `Muestreo aplicado: ${analysis.originalLength.toLocaleString()} → ${analysis.sampledLength.toLocaleString()} chars`
                : `Manuscrito completo (${analysis.originalLength.toLocaleString()} chars)`}
              {" · "}{analysis.isFiction ? "Ficción" : "No-ficción"}
            </div>
            <Section title={`Seed Keywords (${analysis.seedKeywords.length})`} items={analysis.seedKeywords} onCopy={onCopy} />
            <Section title="Temas" items={analysis.themes} onCopy={onCopy} />
            <Section title="Tropos literarios" items={analysis.tropes} onCopy={onCopy} />
            <Section title="Audiencia objetivo" items={analysis.targetAudienceInsights} onCopy={onCopy} />
            <Section title="Ganchos emocionales" items={analysis.emotionalHooks} onCopy={onCopy} />
            <Section title="Entidades (personajes / lugares)" items={analysis.entities} onCopy={onCopy} />
          </TabsContent>
        )}

        {entries.length > 0 && (
          <TabsContent value="markets" className="mt-4">
            <Tabs value={marketTab} onValueChange={setMarketTab}>
              <TabsList className="flex-wrap h-auto">
                {entries.map(e => (
                  <TabsTrigger key={e.marketId} value={e.marketId} data-testid={`tab-market-${e.marketId}`}>
                    {e.marketId.toUpperCase()}
                    {e.error && <AlertTriangle className="h-3 w-3 ml-1 text-destructive" />}
                  </TabsTrigger>
                ))}
              </TabsList>
              {activeMarket && (
                <TabsContent value={activeMarket.marketId} className="mt-4">
                  <MarketEntryView entry={activeMarket} onCopy={onCopy} />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>
        )}

        {tabs.includes("legacy") && (
          <TabsContent value="legacy" className="mt-4">
            <LegacyView meta={meta} onCopy={onCopy} />
          </TabsContent>
        )}

        {kit && (
          <TabsContent value="marketing" className="mt-4">
            <MarketingKitView kit={kit} onCopy={onCopy} />
          </TabsContent>
        )}

        {landing && (
          <TabsContent value="landing" className="mt-4">
            <LandingView landing={landing} onCopy={onCopy} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Section({ title, items, onCopy }: { title: string; items: string[]; onCopy: (t: string, l: string) => void }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{title}</Label>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map((s, i) => (
          <Badge key={i} variant="outline" className="text-xs cursor-pointer hover:bg-muted"
            onClick={() => onCopy(s, title)}>
            {s}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MarketEntryView({ entry, onCopy }: { entry: MarketEntry; onCopy: (t: string, l: string) => void }) {
  if (entry.error) {
    return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{entry.error}</AlertDescription></Alert>;
  }
  const { metadata, optimizedKeywords, seo } = entry;
  const descLen = metadata.description?.length || 0;
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">{entry.marketName} · {entry.locale} · {entry.currency}</div>

      <div>
        <Label className="text-xs text-muted-foreground">Título</Label>
        <p className="text-sm font-medium mt-1">{metadata.title}</p>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Subtítulo ({metadata.subtitle.length}/200)</Label>
        <p className="text-sm mt-1">{metadata.subtitle}</p>
        <Button variant="ghost" size="sm" className="mt-1 h-6"
          onClick={() => onCopy(metadata.subtitle, "Subtítulo")}>
          <Copy className="h-3 w-3 mr-1" /> Copiar
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Descripción HTML ({descLen}/4000)</Label>
          {descLen > 4000 && <Badge variant="destructive" className="text-xs">Excede límite</Badge>}
        </div>
        <div className="mt-2 bg-muted p-3 rounded-md max-h-64 overflow-auto">
          <pre className="text-xs whitespace-pre-wrap font-mono">{metadata.description}</pre>
        </div>
        <div className="flex gap-2 mt-1">
          <Button variant="ghost" size="sm" className="h-6" onClick={() => onCopy(metadata.description, "Descripción HTML")}>
            <Copy className="h-3 w-3 mr-1" /> HTML
          </Button>
          <Button variant="ghost" size="sm" className="h-6" onClick={() => {
            const tmp = document.createElement("div"); tmp.innerHTML = metadata.description || "";
            onCopy(tmp.textContent || "", "Descripción texto");
          }}>
            <Copy className="h-3 w-3 mr-1" /> Texto plano
          </Button>
        </div>
        <Separator className="my-2" />
        <Label className="text-xs text-muted-foreground">Vista previa</Label>
        <div className="mt-1 bg-background border p-3 rounded-md text-sm prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeKdpHtml(metadata.description || "") }} />
      </div>

      <Separator />
      <div>
        <Label className="text-xs text-muted-foreground">Palabras Clave (PASO 2A — generador)</Label>
        <KeywordList items={metadata.keywords} onCopy={onCopy} />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Palabras Clave optimizadas nativas (PASO 2B)</Label>
        <KeywordList items={optimizedKeywords} onCopy={onCopy} />
      </div>

      <Separator />
      <div>
        <Label className="text-xs text-muted-foreground">Categorías BISAC sugeridas</Label>
        <div className="space-y-1 mt-2">
          {metadata.categories.map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-muted rounded px-2 py-1">
              <span className="text-sm">{c}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onCopy(c, "Categoría")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Separator />
      <Label className="text-xs text-muted-foreground">SEO Landing (PASO 2C)</Label>
      <div className="space-y-2 mt-2">
        <FieldCopy label={`SEO Title (${seo.seoTitle.length})`} value={seo.seoTitle} onCopy={onCopy} />
        <FieldCopy label={`SEO Description (${seo.seoDescription.length})`} value={seo.seoDescription} onCopy={onCopy} />
        <FieldCopy label={`OG Title (${seo.ogTitle.length})`} value={seo.ogTitle} onCopy={onCopy} />
        <FieldCopy label={`OG Description (${seo.ogDescription.length})`} value={seo.ogDescription} onCopy={onCopy} />
        <Section title="SEO Keywords" items={seo.seoKeywords} onCopy={onCopy} />
      </div>
    </div>
  );
}

function KeywordList({ items, onCopy }: { items: string[]; onCopy: (t: string, l: string) => void }) {
  return (
    <div className="space-y-1 mt-2">
      {items.map((kw, i) => (
        <div key={i} className="flex items-center justify-between bg-muted rounded px-2 py-1">
          <span className="text-sm"><span className="text-muted-foreground mr-2">{i + 1}.</span>{kw}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${(kw?.length || 0) > 50 ? "text-destructive" : "text-muted-foreground"}`}>{kw?.length || 0}/50</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onCopy(kw, `Keyword ${i + 1}`)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldCopy({ label, value, onCopy }: { label: string; value: string; onCopy: (t: string, l: string) => void }) {
  return (
    <div className="bg-muted rounded p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onCopy(value, label)}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      <p className="text-sm mt-1">{value}</p>
    </div>
  );
}

function LegacyView({ meta, onCopy }: { meta: FullMeta; onCopy: (t: string, l: string) => void }) {
  const descLen = meta.description?.length || 0;
  return (
    <div className="space-y-4">
      {meta.subtitle && (
        <div>
          <Label className="text-xs text-muted-foreground">Subtítulo</Label>
          <p className="text-sm mt-1 font-medium">{meta.subtitle}</p>
          <Button variant="ghost" size="sm" className="mt-1 h-6" onClick={() => onCopy(meta.subtitle!, "Subtítulo")}>
            <Copy className="h-3 w-3 mr-1" /> Copiar
          </Button>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Descripción HTML</Label>
          <span className={`text-xs ${descLen > 4000 ? "text-destructive" : "text-muted-foreground"}`}>{descLen}/4000</span>
        </div>
        <div className="mt-2 bg-muted p-3 rounded-md">
          <pre className="text-xs whitespace-pre-wrap font-mono">{meta.description}</pre>
        </div>
      </div>
      <KeywordList items={meta.keywords || []} onCopy={onCopy} />
      <div>
        <Label className="text-xs text-muted-foreground">Categorías BISAC</Label>
        {(meta.bisacCategories || []).map((c, i) => (
          <div key={i} className="flex items-center justify-between bg-muted rounded px-2 py-1 mt-1">
            <span className="text-sm">{c}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onCopy(c, "Categoría")}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketingKitView({ kit, onCopy }: { kit: MarketingKit; onCopy: (t: string, l: string) => void }) {
  return (
    <Accordion type="multiple" className="space-y-1">
      <AccordionItem value="tt"><AccordionTrigger className="text-sm">TikTok hooks ({kit.tiktokHooks.length})</AccordionTrigger>
        <AccordionContent><BulletList items={kit.tiktokHooks} onCopy={onCopy} label="Hook" /></AccordionContent></AccordionItem>
      <AccordionItem value="ig"><AccordionTrigger className="text-sm">Instagram posts ({kit.instagramPosts.length})</AccordionTrigger>
        <AccordionContent><BulletList items={kit.instagramPosts} onCopy={onCopy} label="Post" /></AccordionContent></AccordionItem>
      <AccordionItem value="pi"><AccordionTrigger className="text-sm">Pinterest descriptions ({kit.pinterestDescriptions.length})</AccordionTrigger>
        <AccordionContent><BulletList items={kit.pinterestDescriptions} onCopy={onCopy} label="Pin" /></AccordionContent></AccordionItem>
      <AccordionItem value="ht"><AccordionTrigger className="text-sm">Hashtags</AccordionTrigger>
        <AccordionContent>
          <Section title="Generales" items={kit.hashtags?.general || []} onCopy={onCopy} />
          <Section title="Específicos" items={kit.hashtags?.specific || []} onCopy={onCopy} />
        </AccordionContent></AccordionItem>
      <AccordionItem value="lm"><AccordionTrigger className="text-sm">Lead magnets ({kit.leadMagnetIdeas.length})</AccordionTrigger>
        <AccordionContent><BulletList items={kit.leadMagnetIdeas} onCopy={onCopy} label="Lead magnet" /></AccordionContent></AccordionItem>
      <AccordionItem value="cta"><AccordionTrigger className="text-sm">Review CTA</AccordionTrigger>
        <AccordionContent>
          <div className="bg-muted rounded p-3 text-sm whitespace-pre-wrap">{kit.reviewCTA}</div>
          <Button variant="ghost" size="sm" className="mt-1 h-6" onClick={() => onCopy(kit.reviewCTA, "Review CTA")}>
            <Copy className="h-3 w-3 mr-1" /> Copiar
          </Button>
        </AccordionContent></AccordionItem>
      <AccordionItem value="fp"><AccordionTrigger className="text-sm">Free promo strategy</AccordionTrigger>
        <AccordionContent>
          <div className="bg-muted rounded p-3 text-sm whitespace-pre-wrap">{kit.freePromoStrategy}</div>
        </AccordionContent></AccordionItem>
      <AccordionItem value="qt"><AccordionTrigger className="text-sm">Citas memorables ({kit.bookQuotes.length})</AccordionTrigger>
        <AccordionContent><BulletList items={kit.bookQuotes} onCopy={onCopy} label="Cita" /></AccordionContent></AccordionItem>
      <AccordionItem value="nc"><AccordionTrigger className="text-sm">Categorías nicho ({kit.nicheCategories.length})</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            {kit.nicheCategories.map((c, i) => (
              <div key={i} className="bg-muted rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.category}</span>
                  <Badge variant={c.competitiveness === "baja" ? "default" : c.competitiveness === "alta" ? "destructive" : "secondary"} className="text-xs">
                    {c.competitiveness}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.reason}</p>
              </div>
            ))}
          </div>
        </AccordionContent></AccordionItem>
      <AccordionItem value="fb"><AccordionTrigger className="text-sm">Facebook groups ({kit.facebookGroupContent.length})</AccordionTrigger>
        <AccordionContent><BulletList items={kit.facebookGroupContent} onCopy={onCopy} label="Post FB" /></AccordionContent></AccordionItem>
      <AccordionItem value="plan"><AccordionTrigger className="text-sm">Plan 30 días ({kit.thirtyDayPlan.length})</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">
            {kit.thirtyDayPlan.map((d) => (
              <div key={d.day} className="flex gap-2 text-sm bg-muted rounded p-2">
                <span className="font-mono text-xs text-muted-foreground w-8">D{d.day}</span>
                <div className="flex-1">
                  {d.platform && <Badge variant="outline" className="text-xs mr-2">{d.platform}</Badge>}
                  {d.task}
                </div>
              </div>
            ))}
          </div>
        </AccordionContent></AccordionItem>
    </Accordion>
  );
}

function BulletList({ items, onCopy, label }: { items: string[]; onCopy: (t: string, l: string) => void; label: string }) {
  return (
    <div className="space-y-1">
      {items.map((s, i) => (
        <div key={i} className="flex items-start gap-2 bg-muted rounded p-2">
          <span className="text-xs text-muted-foreground font-mono mt-0.5">{i + 1}.</span>
          <p className="text-sm flex-1 whitespace-pre-wrap">{s}</p>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => onCopy(s, `${label} ${i+1}`)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function LandingView({ landing, onCopy }: { landing: LandingContent; onCopy: (t: string, l: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Tagline</Label>
        <div className="bg-muted rounded p-3 mt-1">
          <p className="text-base font-medium italic">{landing.tagline}</p>
        </div>
        <Button variant="ghost" size="sm" className="mt-1 h-6" onClick={() => onCopy(landing.tagline, "Tagline")}>
          <Copy className="h-3 w-3 mr-1" /> Copiar
        </Button>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Sinopsis extendida (markdown)</Label>
        <div className="bg-muted rounded p-3 mt-1 max-h-72 overflow-auto">
          <pre className="text-xs whitespace-pre-wrap font-sans">{landing.extendedSynopsis}</pre>
        </div>
        <Button variant="ghost" size="sm" className="mt-1 h-6" onClick={() => onCopy(landing.extendedSynopsis, "Sinopsis extendida")}>
          <Copy className="h-3 w-3 mr-1" /> Copiar
        </Button>
      </div>
      <Section title="Características destacadas" items={landing.featuredCharacteristics} onCopy={onCopy} />
      <div>
        <Label className="text-xs text-muted-foreground">Citas memorables</Label>
        <BulletList items={landing.memorableQuotes} onCopy={onCopy} label="Cita" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Press notes</Label>
        <div className="bg-muted rounded p-3 mt-1 text-sm whitespace-pre-wrap">{landing.pressNotes}</div>
        <Button variant="ghost" size="sm" className="mt-1 h-6" onClick={() => onCopy(landing.pressNotes, "Press notes")}>
          <Copy className="h-3 w-3 mr-1" /> Copiar
        </Button>
      </div>
    </div>
  );
}
