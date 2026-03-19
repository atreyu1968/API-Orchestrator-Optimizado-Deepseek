import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Library,
  Loader2,
  BookOpen,
  GripVertical,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  FileText,
  Link2,
  FileEdit,
  Upload
} from "lucide-react";
import type { ReeditProject, ImportedManuscript, Pseudonym } from "@shared/schema";

const SUPPORTED_LANGUAGES = [
  { code: "es", name: "Español" },
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ca", name: "Català" },
];

function getLanguageName(code: string | null | undefined): string {
  if (!code) return "No detectado";
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code.toLowerCase());
  return lang ? lang.name : code.toUpperCase();
}

function getStatusBadge(status: string) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    pending: { label: "Pendiente", variant: "outline", icon: Clock },
    processing: { label: "Procesando", variant: "default", icon: Loader2 },
    completed: { label: "Completado", variant: "secondary", icon: CheckCircle },
    error: { label: "Error", variant: "destructive", icon: AlertCircle },
    paused: { label: "Pausado", variant: "outline", icon: Clock },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="text-xs">
      <Icon className={`h-3 w-3 mr-1 ${status === "processing" ? "animate-spin" : ""}`} />
      {c.label}
    </Badge>
  );
}

type BookType = "reedit" | "imported";

type SelectedBook = {
  projectId: number;
  type: BookType;
  order: number;
  title: string;
  status: string;
  wordCount: number;
  language: string | null;
};

type UnifiedBook = {
  id: number;
  type: BookType;
  title: string;
  status: string;
  wordCount: number;
  language: string | null;
  totalChapters: number;
  seriesId: number | null;
  seriesOrder: number | null;
};

function toUnifiedBook(rp: ReeditProject): UnifiedBook {
  return {
    id: rp.id,
    type: "reedit",
    title: rp.title,
    status: rp.status,
    wordCount: rp.totalWordCount || 0,
    language: rp.detectedLanguage || null,
    totalChapters: rp.totalChapters || 0,
    seriesId: rp.seriesId || null,
    seriesOrder: rp.seriesOrder || null,
  };
}

function toUnifiedFromImported(ms: ImportedManuscript): UnifiedBook {
  return {
    id: ms.id,
    type: "imported",
    title: ms.title,
    status: ms.status,
    wordCount: ms.totalWordCount || 0,
    language: ms.detectedLanguage || null,
    totalChapters: ms.totalChapters || 0,
    seriesId: ms.seriesId || null,
    seriesOrder: ms.seriesOrder || null,
  };
}

function bookKey(book: { id: number; type: BookType }) {
  return `${book.type}-${book.id}`;
}

export default function ReeditSeriesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesTotalBooks, setSeriesTotalBooks] = useState(3);
  const [selectedPseudonymId, setSelectedPseudonymId] = useState<string>("");
  const [selectedBooks, setSelectedBooks] = useState<SelectedBook[]>([]);
  const [isConverting, setIsConverting] = useState(false);

  const { data: reeditProjects = [], isLoading: reeditLoading } = useQuery<ReeditProject[]>({
    queryKey: ["/api/reedit-projects"],
  });

  const { data: importedManuscripts = [], isLoading: importedLoading } = useQuery<ImportedManuscript[]>({
    queryKey: ["/api/imported-manuscripts"],
  });

  const { data: pseudonyms = [] } = useQuery<Pseudonym[]>({
    queryKey: ["/api/pseudonyms"],
  });

  const allBooks: UnifiedBook[] = [
    ...reeditProjects.map(toUnifiedBook),
    ...importedManuscripts.map(toUnifiedFromImported),
  ];

  const availableBooks = allBooks.filter(b => !b.seriesId);
  const linkedBooks = allBooks.filter(b => b.seriesId);
  const isLoading = reeditLoading || importedLoading;

  const toggleBook = (book: UnifiedBook) => {
    const key = bookKey(book);
    const isSelected = selectedBooks.some(b => bookKey({ id: b.projectId, type: b.type }) === key);
    if (isSelected) {
      const filtered = selectedBooks.filter(b => bookKey({ id: b.projectId, type: b.type }) !== key);
      setSelectedBooks(filtered.map((b, i) => ({ ...b, order: i + 1 })));
    } else {
      setSelectedBooks([
        ...selectedBooks,
        {
          projectId: book.id,
          type: book.type,
          order: selectedBooks.length + 1,
          title: book.title,
          status: book.status,
          wordCount: book.wordCount,
          language: book.language,
        },
      ]);
    }
  };

  const moveBook = (index: number, direction: "up" | "down") => {
    const newBooks = [...selectedBooks];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newBooks.length) return;
    [newBooks[index], newBooks[swapIndex]] = [newBooks[swapIndex], newBooks[index]];
    setSelectedBooks(newBooks.map((b, i) => ({ ...b, order: i + 1 })));
  };

  const removeBook = (book: SelectedBook) => {
    const key = bookKey({ id: book.projectId, type: book.type });
    const filtered = selectedBooks.filter(b => bookKey({ id: b.projectId, type: b.type }) !== key);
    setSelectedBooks(filtered.map((b, i) => ({ ...b, order: i + 1 })));
  };

  const handleCreateSeries = async () => {
    if (!seriesTitle.trim()) {
      toast({ title: "Error", description: "El nombre de la serie es obligatorio", variant: "destructive" });
      return;
    }
    if (selectedBooks.length < 1) {
      toast({ title: "Error", description: "Selecciona al menos un libro para la serie", variant: "destructive" });
      return;
    }

    setIsConverting(true);
    try {
      const response = await apiRequest("POST", "/api/reedit-projects/convert-to-series", {
        books: selectedBooks.map(b => ({ projectId: b.projectId, order: b.order, type: b.type })),
        seriesTitle: seriesTitle.trim(),
        totalPlannedBooks: seriesTotalBooks,
        pseudonymId: selectedPseudonymId && selectedPseudonymId !== "none" ? parseInt(selectedPseudonymId) : undefined,
      });
      const data = await response.json();
      toast({
        title: "Serie Creada",
        description: data.message || `Serie "${seriesTitle}" creada con ${selectedBooks.length} libro(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reedit-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/imported-manuscripts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      queryClient.invalidateQueries({ queryKey: ["/api/series/registry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      navigate("/series");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Error al crear la serie", variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  const totalWords = selectedBooks.reduce((sum, b) => sum + b.wordCount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/reedit")} data-testid="button-back-reedit">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="h-6 w-6" />
            Crear Serie desde Libros
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Agrupa tus libros reeditados e importados en una serie. Se generará automáticamente una guía de escritura y un World Bible unificado.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5" />
                Libros Disponibles
              </CardTitle>
              <CardDescription>
                Haz clic en un libro para añadirlo a la serie. Puedes mezclar libros reeditados e importados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : availableBooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No hay libros disponibles.</p>
                  <p className="text-xs mt-1">Importa manuscritos o crea proyectos de reedición primero.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {availableBooks.map((book) => {
                    const key = bookKey(book);
                    const isSelected = selectedBooks.some(b => bookKey({ id: b.projectId, type: b.type }) === key);
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-transparent hover:bg-muted"
                        }`}
                        onClick={() => toggleBook(book)}
                        data-testid={`toggle-book-${key}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isSelected ? (
                            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                              {selectedBooks.find(b => bookKey({ id: b.projectId, type: b.type }) === key)?.order}
                            </div>
                          ) : (
                            <div className="h-8 w-8 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                              <Plus className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{book.title}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0">
                                {book.type === "imported" ? (
                                  <><Upload className="h-2.5 w-2.5 mr-0.5" />Importado</>
                                ) : (
                                  <><FileEdit className="h-2.5 w-2.5 mr-0.5" />Reeditado</>
                                )}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {getLanguageName(book.language)} · {book.wordCount.toLocaleString()} palabras · {book.totalChapters} caps
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(book.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {linkedBooks.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      Ya vinculados a una serie ({linkedBooks.length})
                    </p>
                    <div className="space-y-1">
                      {linkedBooks.map((book) => (
                        <div key={bookKey(book)} className="flex items-center justify-between p-2 rounded-md opacity-50">
                          <div className="flex items-center gap-2 min-w-0">
                            <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{book.title}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              {book.type === "imported" ? "Imp" : "Reed"}
                            </Badge>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            Serie #{book.seriesOrder || "?"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Configuración de la Serie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="series-name">Nombre de la Serie *</Label>
                <Input
                  id="series-name"
                  value={seriesTitle}
                  onChange={(e) => setSeriesTitle(e.target.value)}
                  placeholder="Ej: Las Crónicas de la Sombra"
                  className="mt-1"
                  data-testid="input-series-title"
                />
              </div>

              <div>
                <Label htmlFor="total-books">Total de Libros Planeados</Label>
                <Input
                  id="total-books"
                  type="number"
                  value={seriesTotalBooks}
                  onChange={(e) => setSeriesTotalBooks(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={50}
                  className="mt-1"
                  data-testid="input-series-total-books"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Incluye libros futuros que aún no has escrito
                </p>
              </div>

              <div>
                <Label htmlFor="pseudonym">Seudónimo (opcional)</Label>
                <Select value={selectedPseudonymId} onValueChange={setSelectedPseudonymId}>
                  <SelectTrigger className="mt-1" data-testid="select-pseudonym">
                    <SelectValue placeholder="Sin seudónimo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin seudónimo</SelectItem>
                    {pseudonyms.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GripVertical className="h-5 w-5" />
                Orden de los Libros
                {selectedBooks.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {selectedBooks.length} libro{selectedBooks.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
              {selectedBooks.length > 0 && (
                <CardDescription>
                  {totalWords.toLocaleString()} palabras en total · Usa las flechas para reordenar
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {selectedBooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Library className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Selecciona libros de la lista</p>
                  <p className="text-xs mt-1">Aparecerán aquí con su orden en la serie</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedBooks.map((book, index) => {
                    const key = bookKey({ id: book.projectId, type: book.type });
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border"
                        data-testid={`series-book-${key}`}
                      >
                        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                          {book.order}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{book.title}</p>
                            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                              {book.type === "imported" ? "Imp" : "Reed"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {book.wordCount.toLocaleString()} palabras
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={index === 0}
                            onClick={() => moveBook(index, "up")}
                            data-testid={`button-move-up-${key}`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={index === selectedBooks.length - 1}
                            onClick={() => moveBook(index, "down")}
                            data-testid={`button-move-down-${key}`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeBook(book)}
                            data-testid={`button-remove-book-${key}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>Se generará una <strong>guía de escritura</strong> para la serie usando IA, basada en el contenido de los libros seleccionados.</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <BookOpen className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>Se creará un <strong>World Bible unificado</strong> combinando personajes, localizaciones y línea temporal de todos los libros.</span>
                </div>
                <Separator />
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleCreateSeries}
                  disabled={isConverting || !seriesTitle.trim() || selectedBooks.length < 1}
                  data-testid="button-create-series"
                >
                  {isConverting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generando Serie, Guía y World Bible...
                    </>
                  ) : (
                    <>
                      <Library className="h-4 w-4 mr-2" />
                      Crear Serie ({selectedBooks.length} libro{selectedBooks.length !== 1 ? "s" : ""})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
