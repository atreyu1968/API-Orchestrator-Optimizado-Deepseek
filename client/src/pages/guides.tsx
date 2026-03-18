import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Sparkles, Trash2, Eye, UserPlus, BookOpen,
  Pen, Lightbulb, Users, Library
} from "lucide-react";
import type { GeneratedGuide, Pseudonym, Series, StyleGuide } from "@shared/schema";

const GUIDE_TYPE_LABELS: Record<string, { label: string; icon: typeof Pen; color: string }> = {
  author_style: { label: "Estilo de Autor", icon: Pen, color: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200" },
  idea_writing: { label: "Guía por Idea", icon: Lightbulb, color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  pseudonym_style: { label: "Estilo de Pseudónimo", icon: Users, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  series_writing: { label: "Guía de Serie", icon: Library, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

function AuthorStyleForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const [authorName, setAuthorName] = useState("");
  const [genre, setGenre] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="author-name">Nombre del Autor</Label>
        <Input
          id="author-name"
          data-testid="input-author-name"
          placeholder="Ej: Gabriel García Márquez, Stephen King..."
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="author-genre">Género (opcional)</Label>
        <Input
          id="author-genre"
          data-testid="input-author-genre"
          placeholder="Ej: Realismo mágico, Terror psicológico..."
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        />
      </div>
      <Button
        data-testid="button-generate-author-style"
        onClick={() => onGenerate({ guideType: "author_style", authorName, genre })}
        disabled={!authorName.trim() || isGenerating}
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Generando guía..." : "Generar Guía de Estilo"}
      </Button>
    </div>
  );
}

function IdeaWritingForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="idea-text">Idea / Premisa de la Historia</Label>
        <Textarea
          id="idea-text"
          data-testid="input-idea-text"
          placeholder="Describe tu idea de novela..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={4}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="idea-genre">Género</Label>
          <Input
            id="idea-genre"
            data-testid="input-idea-genre"
            placeholder="Ej: Thriller, Romance..."
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="idea-tone">Tono</Label>
          <Input
            id="idea-tone"
            data-testid="input-idea-tone"
            placeholder="Ej: Oscuro, Esperanzador..."
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          />
        </div>
      </div>
      <Button
        data-testid="button-generate-idea-guide"
        onClick={() => onGenerate({ guideType: "idea_writing", idea, genre, tone })}
        disabled={!idea.trim() || isGenerating}
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Generando guía..." : "Generar Guía de Escritura"}
      </Button>
    </div>
  );
}

function PseudonymStyleForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({ queryKey: ["/api/pseudonyms"] });
  const { data: allStyleGuides = [] } = useQuery<StyleGuide[]>({ queryKey: ["/api/style-guides"] });
  const [selectedPseudonym, setSelectedPseudonym] = useState<string>("");

  const pseudonym = pseudonyms.find((p) => p.id.toString() === selectedPseudonym);
  const existingGuides = pseudonym
    ? allStyleGuides.filter((sg) => sg.pseudonymId === pseudonym.id && sg.isActive)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <Label>Pseudónimo</Label>
        <Select value={selectedPseudonym} onValueChange={setSelectedPseudonym}>
          <SelectTrigger data-testid="select-pseudonym">
            <SelectValue placeholder="Seleccionar pseudónimo..." />
          </SelectTrigger>
          <SelectContent>
            {pseudonyms.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pseudonym && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 space-y-1 text-sm">
            {pseudonym.bio && <p><strong>Bio:</strong> {pseudonym.bio}</p>}
            {pseudonym.defaultGenre && <p><strong>Género:</strong> {pseudonym.defaultGenre}</p>}
            {pseudonym.defaultTone && <p><strong>Tono:</strong> {pseudonym.defaultTone}</p>}
            {existingGuides.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-muted-foreground">
                  <strong>{existingGuides.length}</strong> guía(s) de estilo existente(s). La IA las tendrá en cuenta para generar contenido complementario.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Button
        data-testid="button-generate-pseudonym-style"
        onClick={() => {
          if (!pseudonym) return;
          onGenerate({
            guideType: "pseudonym_style",
            pseudonymId: pseudonym.id,
            pseudonymName: pseudonym.name,
            pseudonymBio: pseudonym.bio,
            pseudonymGenre: pseudonym.defaultGenre,
            pseudonymTone: pseudonym.defaultTone,
          });
        }}
        disabled={!selectedPseudonym || isGenerating}
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Generando guía..." : "Generar Guía de Estilo"}
      </Button>
    </div>
  );
}

function SeriesWritingForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const { data: seriesList = [] } = useQuery<Series[]>({ queryKey: ["/api/series"] });
  const [selectedSeries, setSelectedSeries] = useState<string>("");
  const [genre, setGenre] = useState("");

  const s = seriesList.find((x) => x.id.toString() === selectedSeries);

  return (
    <div className="space-y-4">
      <div>
        <Label>Serie</Label>
        <Select value={selectedSeries} onValueChange={setSelectedSeries}>
          <SelectTrigger data-testid="select-series">
            <SelectValue placeholder="Seleccionar serie..." />
          </SelectTrigger>
          <SelectContent>
            {seriesList.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {s && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 space-y-1 text-sm">
            {s.description && <p><strong>Descripción:</strong> {s.description}</p>}
            {s.totalPlannedBooks && <p><strong>Libros:</strong> {s.totalPlannedBooks}</p>}
            {s.workType && <p><strong>Tipo:</strong> {s.workType}</p>}
          </CardContent>
        </Card>
      )}
      <div>
        <Label htmlFor="series-genre">Género (opcional)</Label>
        <Input
          id="series-genre"
          data-testid="input-series-genre"
          placeholder="Ej: Fantasía épica, Ciencia ficción..."
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        />
      </div>
      <Button
        data-testid="button-generate-series-guide"
        onClick={() => {
          if (!s) return;
          onGenerate({
            guideType: "series_writing",
            seriesId: s.id,
            seriesTitle: s.title,
            seriesDescription: s.description,
            seriesTotalBooks: s.totalPlannedBooks,
            seriesWorkType: s.workType,
            genre,
          });
        }}
        disabled={!selectedSeries || isGenerating}
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Generando guía..." : "Generar Guía de Serie"}
      </Button>
    </div>
  );
}

function GuideViewDialog({ guide, open, onClose }: { guide: GeneratedGuide | null; open: boolean; onClose: () => void }) {
  if (!guide) return null;
  const typeInfo = GUIDE_TYPE_LABELS[guide.guideType] || GUIDE_TYPE_LABELS.author_style;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <typeInfo.icon className="w-5 h-5" />
            {guide.title}
          </DialogTitle>
          <DialogDescription>
            <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
            {guide.sourceAuthor && <span className="ml-2 text-muted-foreground">Autor: {guide.sourceAuthor}</span>}
            {guide.inputTokens !== null && guide.outputTokens !== null && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({(guide.inputTokens || 0).toLocaleString()} in / {(guide.outputTokens || 0).toLocaleString()} out)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {guide.content}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function GuideLibrary() {
  const { toast } = useToast();
  const { data: guides = [], isLoading } = useQuery<GeneratedGuide[]>({ queryKey: ["/api/guides"] });
  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({ queryKey: ["/api/pseudonyms"] });
  const [viewGuide, setViewGuide] = useState<GeneratedGuide | null>(null);
  const [applyGuideId, setApplyGuideId] = useState<number | null>(null);
  const [applyPseudonymId, setApplyPseudonymId] = useState<string>("");

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/guides/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      toast({ title: "Guía eliminada" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ guideId, pseudonymId }: { guideId: number; pseudonymId: number }) => {
      await apiRequest("POST", `/api/guides/${guideId}/apply-to-pseudonym`, { pseudonymId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pseudonyms"] });
      setApplyGuideId(null);
      setApplyPseudonymId("");
      toast({ title: "Guía aplicada al pseudónimo como guía de estilo" });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (guides.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No hay guías generadas todavía.</p>
        <p className="text-sm">Usa las pestañas de arriba para crear tu primera guía.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {guides.map((guide) => {
          const typeInfo = GUIDE_TYPE_LABELS[guide.guideType] || GUIDE_TYPE_LABELS.author_style;
          const IconComp = typeInfo.icon;
          return (
            <Card key={guide.id} data-testid={`card-guide-${guide.id}`}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <IconComp className="w-5 h-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{guide.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={typeInfo.color}>{typeInfo.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(guide.createdAt).toLocaleDateString()}
                      </span>
                      {(guide.inputTokens || guide.outputTokens) ? (
                        <span className="text-xs text-muted-foreground">
                          {((guide.inputTokens || 0) + (guide.outputTokens || 0)).toLocaleString()} tokens
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`button-view-guide-${guide.id}`}
                    onClick={() => setViewGuide(guide)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`button-apply-guide-${guide.id}`}
                    onClick={() => {
                      setApplyGuideId(guide.id);
                      setApplyPseudonymId("");
                    }}
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`button-delete-guide-${guide.id}`}
                    onClick={() => deleteMutation.mutate(guide.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <GuideViewDialog guide={viewGuide} open={!!viewGuide} onClose={() => setViewGuide(null)} />

      <Dialog open={applyGuideId !== null} onOpenChange={() => setApplyGuideId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar Guía a Pseudónimo</DialogTitle>
            <DialogDescription>
              La guía se guardará como guía de estilo del pseudónimo seleccionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={applyPseudonymId} onValueChange={setApplyPseudonymId}>
              <SelectTrigger data-testid="select-apply-pseudonym">
                <SelectValue placeholder="Seleccionar pseudónimo..." />
              </SelectTrigger>
              <SelectContent>
                {pseudonyms.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              data-testid="button-confirm-apply"
              className="w-full"
              disabled={!applyPseudonymId || applyMutation.isPending}
              onClick={() => {
                if (applyGuideId && applyPseudonymId) {
                  applyMutation.mutate({ guideId: applyGuideId, pseudonymId: parseInt(applyPseudonymId) });
                }
              }}
            >
              {applyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Aplicar como Guía de Estilo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function GuidesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("library");

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/guides/generate", data);
      return res.json();
    },
    onSuccess: (guide: GeneratedGuide) => {
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      toast({ title: "Guía generada", description: guide.title });
      setActiveTab("library");
    },
    onError: (err: any) => {
      toast({ title: "Error al generar", description: err.message, variant: "destructive" });
    },
  });

  const handleGenerate = (data: any) => {
    generateMutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Sparkles className="w-8 h-8" />
          Taller de Guías
        </h1>
        <p className="text-muted-foreground mt-1">
          Genera guías de estilo y escritura con IA para tus proyectos literarios.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5" data-testid="tabs-guide-types">
          <TabsTrigger value="library" data-testid="tab-library">
            <BookOpen className="w-4 h-4 mr-1" />
            Biblioteca
          </TabsTrigger>
          <TabsTrigger value="author_style" data-testid="tab-author-style">
            <Pen className="w-4 h-4 mr-1" />
            Autor
          </TabsTrigger>
          <TabsTrigger value="idea_writing" data-testid="tab-idea-writing">
            <Lightbulb className="w-4 h-4 mr-1" />
            Idea
          </TabsTrigger>
          <TabsTrigger value="pseudonym_style" data-testid="tab-pseudonym-style">
            <Users className="w-4 h-4 mr-1" />
            Pseudónimo
          </TabsTrigger>
          <TabsTrigger value="series_writing" data-testid="tab-series-writing">
            <Library className="w-4 h-4 mr-1" />
            Serie
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library">
          <Card>
            <CardHeader>
              <CardTitle>Biblioteca de Guías</CardTitle>
              <CardDescription>Todas las guías generadas. Puedes verlas, aplicarlas a un pseudónimo, o eliminarlas.</CardDescription>
            </CardHeader>
            <CardContent>
              <GuideLibrary />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="author_style">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pen className="w-5 h-5" />
                Guía de Estilo por Autor
              </CardTitle>
              <CardDescription>
                Analiza el estilo literario de un autor conocido y genera una guía detallada para emularlo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuthorStyleForm onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="idea_writing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Guía de Escritura por Idea
              </CardTitle>
              <CardDescription>
                A partir de una premisa o idea de novela, genera una guía completa de escritura con tono, estructura y técnicas recomendadas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IdeaWritingForm onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pseudonym_style">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Guía de Estilo por Pseudónimo
              </CardTitle>
              <CardDescription>
                Genera una guía de estilo coherente basada en la biografía, género y tono de un pseudónimo existente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PseudonymStyleForm onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="series_writing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Library className="w-5 h-5" />
                Guía de Escritura para Serie
              </CardTitle>
              <CardDescription>
                Genera una guía exhaustiva para mantener la coherencia narrativa, estilística y argumental a lo largo de una serie completa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SeriesWritingForm onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
