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
  Pen, Lightbulb, Users, Library, Plus, Download
} from "lucide-react";
import type { GeneratedGuide, Pseudonym, Series, StyleGuide } from "@shared/schema";

const GUIDE_TYPE_LABELS: Record<string, { label: string; icon: typeof Pen; color: string }> = {
  author_style: { label: "Estilo de Autor", icon: Pen, color: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200" },
  idea_writing: { label: "Guía por Idea", icon: Lightbulb, color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  pseudonym_style: { label: "Novela para Pseudónimo", icon: Users, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  series_writing: { label: "Guía de Serie", icon: Library, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

function downloadGuideAsMd(guide: GeneratedGuide) {
  const typeLabel = GUIDE_TYPE_LABELS[guide.guideType]?.label || guide.guideType;
  const header = `# ${guide.title}\n\n**Tipo:** ${typeLabel}\n**Fecha:** ${new Date(guide.createdAt).toLocaleDateString()}\n${guide.sourceAuthor ? `**Autor de referencia:** ${guide.sourceAuthor}\n` : ""}${guide.sourceIdea ? `**Idea:** ${guide.sourceIdea}\n` : ""}${guide.sourceGenre ? `**Género:** ${guide.sourceGenre}\n` : ""}\n---\n\n`;
  const content = header + guide.content;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = guide.title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s_-]/g, "").replace(/\s+/g, "_").substring(0, 80);
  a.href = url;
  a.download = `${safeName}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function PseudonymAssignSelector({ selectedPseudonymId, onSelect, newPseudonymName, onNewNameChange, mode, onModeChange }: {
  selectedPseudonymId: string;
  onSelect: (id: string) => void;
  newPseudonymName: string;
  onNewNameChange: (name: string) => void;
  mode: "none" | "existing" | "new";
  onModeChange: (mode: "none" | "existing" | "new") => void;
}) {
  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({ queryKey: ["/api/pseudonyms"] });

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      <Label className="text-sm font-medium">Asignar a pseudónimo (opcional)</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "none" ? "default" : "outline"}
          size="sm"
          data-testid="button-assign-none"
          onClick={() => onModeChange("none")}
        >
          No asignar
        </Button>
        <Button
          type="button"
          variant={mode === "existing" ? "default" : "outline"}
          size="sm"
          data-testid="button-assign-existing"
          onClick={() => onModeChange("existing")}
        >
          <UserPlus className="w-3 h-3 mr-1" />
          Existente
        </Button>
        <Button
          type="button"
          variant={mode === "new" ? "default" : "outline"}
          size="sm"
          data-testid="button-assign-new"
          onClick={() => onModeChange("new")}
        >
          <Plus className="w-3 h-3 mr-1" />
          Crear nuevo
        </Button>
      </div>
      {mode === "existing" && (
        <Select value={selectedPseudonymId} onValueChange={onSelect}>
          <SelectTrigger data-testid="select-assign-pseudonym">
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
      )}
      {mode === "new" && (
        <Input
          data-testid="input-new-pseudonym-name"
          placeholder="Nombre del nuevo pseudónimo..."
          value={newPseudonymName}
          onChange={(e) => onNewNameChange(e.target.value)}
        />
      )}
    </div>
  );
}

function AuthorStyleForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const [authorName, setAuthorName] = useState("");
  const [genre, setGenre] = useState("");
  const [assignMode, setAssignMode] = useState<"none" | "existing" | "new">("none");
  const [assignPseudonymId, setAssignPseudonymId] = useState("");
  const [newPseudonymName, setNewPseudonymName] = useState("");

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
      <PseudonymAssignSelector
        selectedPseudonymId={assignPseudonymId}
        onSelect={setAssignPseudonymId}
        newPseudonymName={newPseudonymName}
        onNewNameChange={setNewPseudonymName}
        mode={assignMode}
        onModeChange={setAssignMode}
      />
      <Button
        data-testid="button-generate-author-style"
        onClick={() => onGenerate({
          guideType: "author_style",
          authorName,
          genre,
          assignPseudonymId: assignMode === "existing" ? parseInt(assignPseudonymId) : undefined,
          createPseudonymName: assignMode === "new" ? newPseudonymName : undefined,
          createPseudonymGenre: assignMode === "new" ? genre : undefined,
        })}
        disabled={
          !authorName.trim() || isGenerating ||
          (assignMode === "existing" && !assignPseudonymId) ||
          (assignMode === "new" && !newPseudonymName.trim())
        }
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Generando guía..." : "Generar Guía de Estilo"}
      </Button>
    </div>
  );
}

const IDEA_GENRES = [
  { value: "fantasy", label: "Fantasía" },
  { value: "scifi", label: "Ciencia Ficción" },
  { value: "thriller", label: "Thriller" },
  { value: "historical_thriller", label: "Thriller Histórico" },
  { value: "romance", label: "Romance" },
  { value: "horror", label: "Horror" },
  { value: "mystery", label: "Misterio" },
  { value: "literary", label: "Literaria" },
  { value: "historical", label: "Histórica" },
  { value: "adventure", label: "Aventura" },
];

const IDEA_TONES = [
  { value: "dramatic", label: "Dramático" },
  { value: "dark", label: "Oscuro" },
  { value: "satirical", label: "Satírico" },
  { value: "lyrical", label: "Lírico" },
  { value: "minimalist", label: "Minimalista" },
  { value: "epic", label: "Épico" },
  { value: "intimate", label: "Íntimo" },
  { value: "suspenseful", label: "Tenso" },
];

function IdeaWritingForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const [idea, setIdea] = useState("");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [assignMode, setAssignMode] = useState<"none" | "existing" | "new">("none");
  const [assignPseudonymId, setAssignPseudonymId] = useState("");
  const [newPseudonymName, setNewPseudonymName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [chapterCount, setChapterCount] = useState(20);
  const [hasPrologue, setHasPrologue] = useState(false);
  const [hasEpilogue, setHasEpilogue] = useState(false);
  const [hasAuthorNote, setHasAuthorNote] = useState(false);
  const [minWordsPerChapter, setMinWordsPerChapter] = useState(1500);
  const [maxWordsPerChapter, setMaxWordsPerChapter] = useState(3500);
  const [kindleUnlimitedOptimized, setKindleUnlimitedOptimized] = useState(false);

  const { data: styleGuides = [] } = useQuery<StyleGuide[]>({ queryKey: ["/api/style-guides"] });
  const [styleGuideId, setStyleGuideId] = useState<string>("");

  const selectedPseudonymIdNum = assignMode === "existing" ? parseInt(assignPseudonymId) : undefined;
  const pseudonymStyleGuides = selectedPseudonymIdNum
    ? styleGuides.filter((sg) => sg.pseudonymId === selectedPseudonymIdNum && sg.isActive)
    : [];

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
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger id="idea-genre" data-testid="select-idea-genre">
              <SelectValue placeholder="Seleccionar género..." />
            </SelectTrigger>
            <SelectContent>
              {IDEA_GENRES.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="idea-tone">Tono</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="idea-tone" data-testid="select-idea-tone">
              <SelectValue placeholder="Seleccionar tono..." />
            </SelectTrigger>
            <SelectContent>
              {IDEA_TONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Datos del proyecto a crear</p>

      <PseudonymAssignSelector
        selectedPseudonymId={assignPseudonymId}
        onSelect={(val) => { setAssignPseudonymId(val); setStyleGuideId(""); }}
        newPseudonymName={newPseudonymName}
        onNewNameChange={setNewPseudonymName}
        mode={assignMode}
        onModeChange={(m) => { setAssignMode(m); setStyleGuideId(""); }}
      />

      {assignMode === "existing" && pseudonymStyleGuides.length > 0 && (
        <div>
          <Label>Guía de estilo del pseudónimo (opcional)</Label>
          <Select value={styleGuideId} onValueChange={setStyleGuideId}>
            <SelectTrigger data-testid="select-idea-style-guide">
              <SelectValue placeholder="Sin guía de estilo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin guía de estilo</SelectItem>
              {pseudonymStyleGuides.map((sg) => (
                <SelectItem key={sg.id} value={sg.id.toString()}>{sg.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="project-title">Título del proyecto</Label>
        <Input
          id="project-title"
          data-testid="input-project-title"
          placeholder="Título de la novela..."
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="chapter-count">Capítulos</Label>
          <Input
            id="chapter-count"
            data-testid="input-chapter-count"
            type="number"
            min={1}
            max={350}
            value={chapterCount}
            onChange={(e) => setChapterCount(parseInt(e.target.value) || 1)}
          />
        </div>
        <div>
          <Label htmlFor="min-words">Min palabras/cap</Label>
          <Input
            id="min-words"
            data-testid="input-min-words"
            type="number"
            min={500}
            max={10000}
            value={minWordsPerChapter}
            onChange={(e) => setMinWordsPerChapter(parseInt(e.target.value) || 1500)}
          />
        </div>
        <div>
          <Label htmlFor="max-words">Max palabras/cap</Label>
          <Input
            id="max-words"
            data-testid="input-max-words"
            type="number"
            min={500}
            max={15000}
            value={maxWordsPerChapter}
            onChange={(e) => setMaxWordsPerChapter(parseInt(e.target.value) || 3500)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm" data-testid="check-prologue">
          <input type="checkbox" checked={hasPrologue} onChange={(e) => setHasPrologue(e.target.checked)} className="rounded" />
          Prólogo
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-epilogue">
          <input type="checkbox" checked={hasEpilogue} onChange={(e) => setHasEpilogue(e.target.checked)} className="rounded" />
          Epílogo
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-author-note">
          <input type="checkbox" checked={hasAuthorNote} onChange={(e) => setHasAuthorNote(e.target.checked)} className="rounded" />
          Nota del Autor
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-kindle">
          <input type="checkbox" checked={kindleUnlimitedOptimized} onChange={(e) => setKindleUnlimitedOptimized(e.target.checked)} className="rounded" />
          Kindle Unlimited
        </label>
      </div>

      <Button
        data-testid="button-generate-idea-guide"
        onClick={() => onGenerate({
          guideType: "idea_writing",
          idea,
          genre,
          tone,
          assignPseudonymId: assignMode === "existing" ? parseInt(assignPseudonymId) : undefined,
          createPseudonymName: assignMode === "new" ? newPseudonymName : undefined,
          createPseudonymGenre: assignMode === "new" ? genre : undefined,
          createPseudonymTone: assignMode === "new" ? tone : undefined,
          projectTitle: projectTitle.trim() || undefined,
          chapterCount,
          hasPrologue,
          hasEpilogue,
          hasAuthorNote,
          minWordsPerChapter,
          maxWordsPerChapter,
          kindleUnlimitedOptimized,
          styleGuideId: styleGuideId && styleGuideId !== "none" ? parseInt(styleGuideId) : undefined,
        })}
        disabled={
          !idea.trim() || !genre || !tone || !projectTitle.trim() || isGenerating ||
          (assignMode === "existing" && !assignPseudonymId) ||
          (assignMode === "new" && !newPseudonymName.trim())
        }
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Generando guía y creando proyecto..." : "Generar Guía y Crear Proyecto"}
      </Button>
    </div>
  );
}

function PseudonymStyleForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({ queryKey: ["/api/pseudonyms"] });
  const { data: allStyleGuides = [] } = useQuery<StyleGuide[]>({ queryKey: ["/api/style-guides"] });
  const [selectedPseudonym, setSelectedPseudonym] = useState<string>("");

  // Parámetros del proyecto a crear (la IA inventa la idea, pero el usuario
  // sigue controlando estructura y formato del libro).
  const [projectTitle, setProjectTitle] = useState("");
  const [chapterCount, setChapterCount] = useState(20);
  const [hasPrologue, setHasPrologue] = useState(false);
  const [hasEpilogue, setHasEpilogue] = useState(false);
  const [hasAuthorNote, setHasAuthorNote] = useState(false);
  const [minWordsPerChapter, setMinWordsPerChapter] = useState(1500);
  const [maxWordsPerChapter, setMaxWordsPerChapter] = useState(3500);
  const [kindleUnlimitedOptimized, setKindleUnlimitedOptimized] = useState(false);

  const pseudonym = pseudonyms.find((p) => p.id.toString() === selectedPseudonym);
  const existingGuides = pseudonym
    ? allStyleGuides.filter((sg) => sg.pseudonymId === pseudonym.id && sg.isActive)
    : [];
  const hasStyleGuide = existingGuides.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3 text-sm text-blue-900 dark:text-blue-100">
        <p>
          La IA inventará una novela original apropiada para el seudónimo seleccionado, leyendo su guía de estilo activa.
          Tú solo eliges el seudónimo y los parámetros del proyecto: el argumento, los personajes y el plan de capítulos los crea el sistema.
        </p>
      </div>

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
            {pseudonym.defaultGenre && <p><strong>Género habitual:</strong> {pseudonym.defaultGenre}</p>}
            {pseudonym.defaultTone && <p><strong>Tono habitual:</strong> {pseudonym.defaultTone}</p>}
            <div className="mt-2 pt-2 border-t">
              {hasStyleGuide ? (
                <p className="text-muted-foreground">
                  <strong>{existingGuides.length}</strong> guía(s) de estilo activa(s).
                  La IA las leerá completas para inventar una novela coherente con la voz del seudónimo.
                </p>
              ) : (
                <p className="text-amber-700 dark:text-amber-300" data-testid="text-no-style-guide-warning">
                  ⚠️ Este seudónimo aún no tiene ninguna guía de estilo activa. La IA tendrá que improvisar a partir de la biografía y el género/tono. Para mejores resultados, crea primero una guía en la pestaña "Estilo de Autor" o impórtala en la sección de seudónimos.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Datos del proyecto a crear</p>

      <div>
        <Label htmlFor="pseud-project-title">Título del proyecto (opcional)</Label>
        <Input
          id="pseud-project-title"
          data-testid="input-pseud-project-title"
          placeholder="Si lo dejas vacío, se usa el título inventado por la IA"
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="pseud-chapter-count">Capítulos</Label>
          <Input
            id="pseud-chapter-count"
            data-testid="input-pseud-chapter-count"
            type="number"
            min={1}
            max={350}
            value={chapterCount}
            onChange={(e) => setChapterCount(parseInt(e.target.value) || 1)}
          />
        </div>
        <div>
          <Label htmlFor="pseud-min-words">Min palabras/cap</Label>
          <Input
            id="pseud-min-words"
            data-testid="input-pseud-min-words"
            type="number"
            min={500}
            max={10000}
            value={minWordsPerChapter}
            onChange={(e) => setMinWordsPerChapter(parseInt(e.target.value) || 1500)}
          />
        </div>
        <div>
          <Label htmlFor="pseud-max-words">Max palabras/cap</Label>
          <Input
            id="pseud-max-words"
            data-testid="input-pseud-max-words"
            type="number"
            min={500}
            max={15000}
            value={maxWordsPerChapter}
            onChange={(e) => setMaxWordsPerChapter(parseInt(e.target.value) || 3500)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm" data-testid="check-pseud-prologue">
          <input type="checkbox" checked={hasPrologue} onChange={(e) => setHasPrologue(e.target.checked)} className="rounded" />
          Prólogo
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-pseud-epilogue">
          <input type="checkbox" checked={hasEpilogue} onChange={(e) => setHasEpilogue(e.target.checked)} className="rounded" />
          Epílogo
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-pseud-author-note">
          <input type="checkbox" checked={hasAuthorNote} onChange={(e) => setHasAuthorNote(e.target.checked)} className="rounded" />
          Nota del Autor
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-pseud-kindle">
          <input type="checkbox" checked={kindleUnlimitedOptimized} onChange={(e) => setKindleUnlimitedOptimized(e.target.checked)} className="rounded" />
          Kindle Unlimited
        </label>
      </div>

      <Button
        data-testid="button-generate-pseudonym-novel"
        onClick={() => {
          if (!pseudonym) return;
          onGenerate({
            guideType: "pseudonym_style",
            pseudonymId: pseudonym.id,
            pseudonymName: pseudonym.name,
            pseudonymBio: pseudonym.bio,
            pseudonymGenre: pseudonym.defaultGenre,
            pseudonymTone: pseudonym.defaultTone,
            // Asignación: el proyecto resultante queda vinculado al mismo pseudónimo.
            assignPseudonymId: pseudonym.id,
            projectTitle: projectTitle.trim() || undefined,
            chapterCount,
            hasPrologue,
            hasEpilogue,
            hasAuthorNote,
            minWordsPerChapter,
            maxWordsPerChapter,
            kindleUnlimitedOptimized,
          });
        }}
        disabled={!selectedPseudonym || isGenerating}
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating ? "Inventando novela y creando proyecto..." : "Generar Guía de Novela y Crear Proyecto"}
      </Button>
    </div>
  );
}

function SeriesWritingForm({ onGenerate, isGenerating }: { onGenerate: (data: any) => void; isGenerating: boolean }) {
  const { data: seriesList = [] } = useQuery<Series[]>({ queryKey: ["/api/series"] });
  const { data: styleGuides = [] } = useQuery<StyleGuide[]>({ queryKey: ["/api/style-guides"] });
  const [selectedSeries, setSelectedSeries] = useState<string>("");
  const [seriesIdea, setSeriesIdea] = useState("");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [assignMode, setAssignMode] = useState<"none" | "existing" | "new">("none");
  const [assignPseudonymId, setAssignPseudonymId] = useState("");
  const [newPseudonymName, setNewPseudonymName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [chapterCount, setChapterCount] = useState(20);
  const [hasPrologue, setHasPrologue] = useState(false);
  const [hasEpilogue, setHasEpilogue] = useState(false);
  const [hasAuthorNote, setHasAuthorNote] = useState(false);
  const [minWordsPerChapter, setMinWordsPerChapter] = useState(1500);
  const [maxWordsPerChapter, setMaxWordsPerChapter] = useState(3500);
  const [kindleUnlimitedOptimized, setKindleUnlimitedOptimized] = useState(false);
  const [styleGuideId, setStyleGuideId] = useState<string>("");
  const [createAllVolumes, setCreateAllVolumes] = useState(false);

  const s = seriesList.find((x) => x.id.toString() === selectedSeries);

  const selectedPseudonymIdNum = assignMode === "existing" ? parseInt(assignPseudonymId) : undefined;
  const pseudonymStyleGuides = selectedPseudonymIdNum
    ? styleGuides.filter((sg) => sg.pseudonymId === selectedPseudonymIdNum && sg.isActive)
    : [];

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
            {s.totalPlannedBooks && <p><strong>Libros planificados:</strong> {s.totalPlannedBooks}</p>}
            {s.workType && <p><strong>Tipo:</strong> {s.workType}</p>}
          </CardContent>
        </Card>
      )}
      <div>
        <Label htmlFor="series-idea-text">Idea / Concepto de la Serie</Label>
        <Textarea
          id="series-idea-text"
          data-testid="input-series-idea"
          placeholder="Describe la premisa general, el arco narrativo de la serie, los temas principales, el mundo..."
          value={seriesIdea}
          onChange={(e) => setSeriesIdea(e.target.value)}
          rows={4}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {s?.description ? "Complementa o reemplaza la descripción guardada en la serie." : "La IA usará esta idea para generar la guía y planificar los volúmenes."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="series-genre">Género</Label>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger id="series-genre" data-testid="select-series-genre">
              <SelectValue placeholder="Seleccionar género..." />
            </SelectTrigger>
            <SelectContent>
              {IDEA_GENRES.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="series-tone">Tono</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="series-tone" data-testid="select-series-tone">
              <SelectValue placeholder="Seleccionar tono..." />
            </SelectTrigger>
            <SelectContent>
              {IDEA_TONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />
      <p className="text-sm font-medium text-muted-foreground">Datos del proyecto a crear (siguiente libro de la serie)</p>

      <PseudonymAssignSelector
        selectedPseudonymId={assignPseudonymId}
        onSelect={(val) => { setAssignPseudonymId(val); setStyleGuideId(""); }}
        newPseudonymName={newPseudonymName}
        onNewNameChange={setNewPseudonymName}
        mode={assignMode}
        onModeChange={(m) => { setAssignMode(m); setStyleGuideId(""); }}
      />

      {assignMode === "existing" && pseudonymStyleGuides.length > 0 && (
        <div>
          <Label>Guía de estilo del pseudónimo (opcional)</Label>
          <Select value={styleGuideId} onValueChange={setStyleGuideId}>
            <SelectTrigger data-testid="select-series-style-guide">
              <SelectValue placeholder="Sin guía de estilo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin guía de estilo</SelectItem>
              {pseudonymStyleGuides.map((sg) => (
                <SelectItem key={sg.id} value={sg.id.toString()}>{sg.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="series-project-title">
          {createAllVolumes ? "Título del primer libro (los demás se generan automáticamente)" : "Título del nuevo libro"}
        </Label>
        <Input
          id="series-project-title"
          data-testid="input-series-project-title"
          placeholder={createAllVolumes ? "Opcional — la IA generará títulos para cada volumen" : "Título de la novela..."}
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="series-chapter-count">Capítulos</Label>
          <Input
            id="series-chapter-count"
            data-testid="input-series-chapter-count"
            type="number"
            min={1}
            max={350}
            value={chapterCount}
            onChange={(e) => setChapterCount(parseInt(e.target.value) || 1)}
          />
        </div>
        <div>
          <Label htmlFor="series-min-words">Min palabras/cap</Label>
          <Input
            id="series-min-words"
            data-testid="input-series-min-words"
            type="number"
            min={500}
            max={10000}
            value={minWordsPerChapter}
            onChange={(e) => setMinWordsPerChapter(parseInt(e.target.value) || 1500)}
          />
        </div>
        <div>
          <Label htmlFor="series-max-words">Max palabras/cap</Label>
          <Input
            id="series-max-words"
            data-testid="input-series-max-words"
            type="number"
            min={500}
            max={15000}
            value={maxWordsPerChapter}
            onChange={(e) => setMaxWordsPerChapter(parseInt(e.target.value) || 3500)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm" data-testid="check-series-prologue">
          <input type="checkbox" checked={hasPrologue} onChange={(e) => setHasPrologue(e.target.checked)} className="rounded" />
          Prólogo
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-series-epilogue">
          <input type="checkbox" checked={hasEpilogue} onChange={(e) => setHasEpilogue(e.target.checked)} className="rounded" />
          Epílogo
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-series-author-note">
          <input type="checkbox" checked={hasAuthorNote} onChange={(e) => setHasAuthorNote(e.target.checked)} className="rounded" />
          Nota del Autor
        </label>
        <label className="flex items-center gap-2 text-sm" data-testid="check-series-kindle">
          <input type="checkbox" checked={kindleUnlimitedOptimized} onChange={(e) => setKindleUnlimitedOptimized(e.target.checked)} className="rounded" />
          Kindle Unlimited
        </label>
      </div>

      {s && s.totalPlannedBooks && s.totalPlannedBooks > 1 && (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium" data-testid="check-create-all-volumes">
            <input type="checkbox" checked={createAllVolumes} onChange={(e) => setCreateAllVolumes(e.target.checked)} className="rounded" />
            Crear proyectos para todos los volúmenes ({s.totalPlannedBooks} libros)
          </label>
          <p className="text-xs text-muted-foreground ml-6">
            {createAllVolumes
              ? "Se crearán proyectos para todos los volúmenes planificados. La IA generará títulos automáticamente para cada uno."
              : "Solo se creará un proyecto para el siguiente libro de la serie."}
          </p>
        </div>
      )}

      <Button
        data-testid="button-generate-series-guide"
        onClick={() => {
          if (!s) return;
          onGenerate({
            guideType: "series_writing",
            seriesId: s.id,
            seriesTitle: s.title,
            seriesDescription: s.description,
            seriesIdea: seriesIdea.trim() || undefined,
            seriesTotalBooks: s.totalPlannedBooks,
            seriesWorkType: s.workType,
            genre,
            tone,
            assignPseudonymId: assignMode === "existing" ? parseInt(assignPseudonymId) : undefined,
            createPseudonymName: assignMode === "new" ? newPseudonymName : undefined,
            createPseudonymGenre: assignMode === "new" ? genre : undefined,
            createPseudonymTone: assignMode === "new" ? tone : undefined,
            projectTitle: projectTitle.trim() || undefined,
            chapterCount,
            hasPrologue,
            hasEpilogue,
            hasAuthorNote,
            minWordsPerChapter,
            maxWordsPerChapter,
            kindleUnlimitedOptimized,
            styleGuideId: styleGuideId && styleGuideId !== "none" ? parseInt(styleGuideId) : undefined,
            createAllVolumes,
          });
        }}
        disabled={
          !selectedSeries || !genre || !tone || isGenerating ||
          (!createAllVolumes && !projectTitle.trim()) ||
          (assignMode === "existing" && !assignPseudonymId) ||
          (assignMode === "new" && !newPseudonymName.trim())
        }
        className="w-full"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {isGenerating
          ? (createAllVolumes ? "Generando guía y creando todos los volúmenes..." : "Generando guía y creando proyecto...")
          : (createAllVolumes ? `Generar Guía y Crear ${s?.totalPlannedBooks || ""} Proyectos` : "Generar Guía Extendida y Crear Proyecto")}
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
        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="button-download-guide-dialog"
            onClick={() => downloadGuideAsMd(guide)}
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar .md
          </Button>
        </div>
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
                    data-testid={`button-download-guide-${guide.id}`}
                    onClick={() => downloadGuideAsMd(guide)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  {/* "Aplicar a pseudónimo" solo tiene sentido para guías de
                      estilo de autor. Las guías `pseudonym_style` ya no son
                      guías de estilo (ahora son guías de novela), así que el
                      botón se oculta para ellas. Si tienes guías legadas con
                      ese tipo que SÍ son guías de estilo, descárgalas y crea
                      la style_guide manualmente desde la sección de seudónimos. */}
                  {guide.guideType === "author_style" && (
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
                  )}
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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pseudonyms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/style-guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/extended-guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      let desc = data.title;
      if (data.projectsCreated && data.projectsCreated > 1) {
        desc = `${data.title} — ${data.projectsCreated} proyectos creados automáticamente`;
      } else if (data.projectId) {
        desc = `${data.title} — proyecto creado automáticamente`;
      } else if (data.assignedPseudonymId) {
        desc = `${data.title} — asignada automáticamente al pseudónimo`;
      }
      toast({ title: "Guía generada", description: desc });
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
